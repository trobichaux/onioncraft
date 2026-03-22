export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getGoals,
  getSetting,
  getCachedPrices,
  getCachedRecipes,
  getCachedItems,
} from '@/lib/tableStorage';
import { GoalProgressSchema, ExclusionListSchema, AccountDataSchema } from '@/lib/schemas';
import type { AccountData } from '@/lib/schemas';
import { buildRecipeTree, calculateOverages, maxCraftableFromInventory } from '@/lib/recipeTree';
import type { Recipe, Item, RecipeNode } from '@/lib/recipeTree';
import { calculateProfit } from '@/lib/profitCalc';
import { Gw2Client } from '@/lib/gw2Client';
import { fetchInventory } from '@/lib/inventory';
import { logger } from '@/lib/logger';

function collectAllItemIds(node: RecipeNode, ids: Set<number>): void {
  ids.add(node.itemId);
  for (const child of node.ingredients) {
    collectAllItemIds(child, ids);
  }
}

interface ProfitEntry {
  itemId: number;
  itemName: string;
  sellPrice: number;
  craftingCost: number;
  listingFee: number;
  exchangeFee: number;
  profitPerUnit: number;
  quantity: number;
  totalProfit: number;
  roi: number;
  dailyCap?: number;
  noTpListing?: boolean;
  accountBound?: boolean;
  disciplineRequired?: string;
  levelRequired?: number;
}

function formatCacheAge(cachedAt: string): string {
  const ageMs = Date.now() - new Date(cachedAt).getTime();
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  if (ageMinutes < 1) return 'just now';
  if (ageMinutes < 60) return `${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} ago`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours} hour${ageHours !== 1 ? 's' : ''} ago`;
  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays} day${ageDays !== 1 ? 's' : ''} ago`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = requireUser(req);
  if (!isUser(user)) return user;
  const rateResult = checkRateLimit(`${user.id}:crafting-profit`, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rateResult.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  try {
    // Phase 1: Read all settings and account data in parallel
    const [apiKeyRaw, accountDataRaw, records, exclusionRaw, charFilterRaw] = await Promise.all([
      getSetting(user.id, 'apiKey'),
      getSetting(user.id, 'accountData'),
      getGoals(user.id),
      getSetting(user.id, 'exclusionList'),
      getSetting(user.id, 'characterFilter'),
    ]);

    if (!apiKeyRaw) {
      return NextResponse.json(
        { error: 'API key required. Add your GW2 API key on the Settings page.' },
        { status: 400 }
      );
    }

    if (!accountDataRaw) {
      return NextResponse.json(
        {
          error:
            'Account data not initialized. Click "Initialize Account" to load your recipes and characters.',
          needsInit: true,
        },
        { status: 400 }
      );
    }

    const { key } = JSON.parse(apiKeyRaw) as { key: string };
    const client = new Gw2Client({ apiKey: key });

    // Parse and validate cached account data (recipes + character disciplines)
    const accountData: AccountData = AccountDataSchema.parse(JSON.parse(accountDataRaw));
    const cacheAge = formatCacheAge(accountData.cachedAt);

    let charFilter: string[] | undefined;
    if (charFilterRaw) {
      try {
        charFilter = JSON.parse(charFilterRaw);
      } catch {
        /* ignore */
      }
    }

    // Build discipline map from cached character data
    const disciplineMap = new Map<string, number>();
    const charsToUse = charFilter
      ? accountData.characters.filter((c) => charFilter!.includes(c.name))
      : accountData.characters;
    for (const char of charsToUse) {
      for (const d of char.disciplines) {
        const current = disciplineMap.get(d.discipline) ?? 0;
        if (d.rating > current) disciplineMap.set(d.discipline, d.rating);
      }
    }

    // Phase 2: Fetch live inventory (GW2 API) and cached recipes in parallel
    const recipeIdStrs = accountData.knownRecipeIds.map(String);
    const [inventory, cachedRecipes] = await Promise.all([
      fetchInventory(client, charFilter),
      getCachedRecipes(recipeIdStrs),
    ]);

    // Build recipes map from cached data
    const recipes = new Map<number, Recipe>();
    for (const [, cached] of cachedRecipes) {
      const ingredients = JSON.parse(cached.ingredients) as Array<{
        itemId: number;
        count: number;
      }>;
      recipes.set(cached.outputItemId, {
        outputItemId: cached.outputItemId,
        outputItemCount: cached.outputItemCount,
        disciplines: JSON.parse(cached.disciplines) as string[],
        minRating: cached.minRating,
        ingredients,
      });
    }

    // Collect all item IDs needed (recipe outputs + ingredients)
    const allItemIds = new Set<number>();
    for (const [, cached] of cachedRecipes) {
      allItemIds.add(cached.outputItemId);
      const ings = JSON.parse(cached.ingredients) as Array<{ itemId: number }>;
      for (const ing of ings) allItemIds.add(ing.itemId);
    }

    // Phase 3: Read cached items from ItemCache table
    const cachedItems = await getCachedItems([...allItemIds].map(String));
    const items = new Map<number, Item>();
    for (const [idStr, cached] of cachedItems) {
      items.set(Number(idStr), {
        id: Number(idStr),
        name: cached.name,
        type: cached.type,
        rarity: cached.rarity,
        flags: JSON.parse(cached.flags) as string[],
      });
    }

    logger.info('Loaded crafting data from cache', {
      userId: user.id,
      knownRecipes: accountData.knownRecipeIds.length,
      cachedRecipes: cachedRecipes.size,
      cachedItems: cachedItems.size,
      inventorySize: inventory.size,
      disciplines: Object.fromEntries(disciplineMap),
      cacheAge,
    });

    // Parse exclusion list
    let exclusions: number[] = [];
    if (exclusionRaw) {
      const parsed = ExclusionListSchema.safeParse(JSON.parse(exclusionRaw));
      if (parsed.success) exclusions = parsed.data;
    }
    const exclusionSet = new Set(exclusions);

    // Parse goals
    const goals = records
      .map((r) => {
        const parsed = GoalProgressSchema.safeParse(JSON.parse(r.value));
        return parsed.success ? parsed.data : null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    for (const goal of goals) {
      if (!items.has(goal.itemId)) {
        items.set(goal.itemId, { id: goal.itemId, name: goal.itemName, flags: [] });
      }
    }

    // Cache recipe trees
    const treeCache = new Map<number, RecipeNode>();
    function getTree(itemId: number): RecipeNode {
      let tree = treeCache.get(itemId);
      if (!tree) {
        tree = buildRecipeTree(itemId, recipes, items);
        treeCache.set(itemId, tree);
      }
      return tree;
    }

    // Build goal trees and calculate overages
    const goalTrees: RecipeNode[] = [];
    for (const goal of goals) {
      goalTrees.push(getTree(goal.itemId));
    }
    const overages = calculateOverages(goalTrees, inventory);
    const available = new Map<number, number>();
    for (const [itemId, overage] of overages) {
      available.set(itemId, Math.max(0, overage));
    }

    // Load cached prices
    const priceItemIds = new Set<number>(allItemIds);
    for (const tree of goalTrees) {
      collectAllItemIds(tree, priceItemIds);
    }
    const cachedPrices = await getCachedPrices([...priceItemIds].map(String));
    const prices = new Map<number, { buyPrice: number; sellPrice: number }>();
    let oldestPriceAge: string | null = null;
    let pricesMissing = 0;
    for (const [idStr, value] of cachedPrices) {
      prices.set(Number(idStr), { buyPrice: value.buyPrice, sellPrice: value.sellPrice });
      if (value.cachedAt && (!oldestPriceAge || value.cachedAt < oldestPriceAge)) {
        oldestPriceAge = value.cachedAt;
      }
    }
    pricesMissing = priceItemIds.size - prices.size;

    // Evaluate all cached recipes
    let craftableWithDiscipline = 0;
    let craftableWithMaterials = 0;
    const results: ProfitEntry[] = [];

    for (const recipe of recipes.values()) {
      if (exclusionSet.has(recipe.outputItemId)) continue;

      // User must have at least one matching discipline at sufficient level
      const disciplines = recipe.disciplines ?? [];
      const minRating = recipe.minRating ?? 0;
      const hasDiscipline =
        disciplines.length === 0 ||
        disciplines.some((d) => (disciplineMap.get(d) ?? 0) >= minRating);
      if (!hasDiscipline) continue;

      craftableWithDiscipline++;

      const tree = getTree(recipe.outputItemId);
      if (!tree.craftable) continue;

      const qty = maxCraftableFromInventory(tree, available);
      if (qty <= 0) continue;

      craftableWithMaterials++;

      const effectiveQty = tree.dailyCap != null ? Math.min(qty, tree.dailyCap) : qty;
      if (effectiveQty <= 0) continue;

      const outputItem = items.get(recipe.outputItemId);
      const isAccountBound =
        outputItem?.flags.includes('AccountBound') || outputItem?.flags.includes('SoulBound');

      const sellPrice = prices.get(recipe.outputItemId)?.sellPrice ?? 0;
      const noTpListing = sellPrice <= 0;

      let materialValue = 0;
      const leafReqs = new Map<number, number>();
      flattenLeafs(tree, leafReqs);
      for (const [leafId, countPerUnit] of leafReqs) {
        const leafBuyPrice = prices.get(leafId)?.buyPrice ?? 0;
        materialValue += leafBuyPrice * countPerUnit;
      }

      const itemName = outputItem?.name ?? `Item ${recipe.outputItemId}`;

      if (noTpListing || isAccountBound) {
        results.push({
          itemId: recipe.outputItemId,
          itemName,
          sellPrice: 0,
          craftingCost: materialValue,
          listingFee: 0,
          exchangeFee: 0,
          profitPerUnit: 0,
          quantity: effectiveQty,
          totalProfit: 0,
          roi: 0,
          dailyCap: tree.dailyCap,
          noTpListing,
          accountBound: isAccountBound ?? false,
          disciplineRequired: disciplines[0],
          levelRequired: minRating,
        });
        continue;
      }

      const {
        listingFee,
        exchangeFee,
        profit: profitPerUnit,
      } = calculateProfit(sellPrice, materialValue);
      const totalProfit = profitPerUnit * effectiveQty;
      const roi = materialValue > 0 ? (profitPerUnit / materialValue) * 100 : 0;

      results.push({
        itemId: recipe.outputItemId,
        itemName,
        sellPrice,
        craftingCost: materialValue,
        listingFee,
        exchangeFee,
        profitPerUnit,
        quantity: effectiveQty,
        totalProfit,
        roi: Math.round(roi * 100) / 100,
        dailyCap: tree.dailyCap,
        disciplineRequired: disciplines[0],
        levelRequired: minRating,
      });
    }

    // Sort: highest crafting level first, then by profit within same level
    results.sort((a, b) => {
      if (a.noTpListing !== b.noTpListing) return a.noTpListing ? 1 : -1;
      if (a.accountBound !== b.accountBound) return a.accountBound ? 1 : -1;
      const levelDiff = (b.levelRequired ?? 0) - (a.levelRequired ?? 0);
      if (levelDiff !== 0) return levelDiff;
      return b.totalProfit - a.totalProfit;
    });

    // Price staleness
    let priceWarning: string | undefined;
    if (pricesMissing > 0) {
      priceWarning = `${pricesMissing} item(s) missing price data. Use Refresh Prices to update.`;
    } else if (oldestPriceAge) {
      const ageMs = Date.now() - new Date(oldestPriceAge).getTime();
      const ageHours = Math.round(ageMs / (1000 * 60 * 60));
      if (ageHours > 24) {
        priceWarning = `Prices are ${ageHours}h old. Use Refresh Prices for current data.`;
      }
    }

    return NextResponse.json({
      items: results,
      inventorySize: inventory.size,
      goalsCount: goals.length,
      knownRecipes: accountData.knownRecipeIds.length,
      craftableWithDiscipline,
      craftableWithMaterials,
      lastUpdated: new Date().toISOString(),
      cacheAge,
      priceWarning,
    });
  } catch (err) {
    logger.error('Crafting profit GET failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to calculate crafting profit' }, { status: 500 });
  }
}

function flattenLeafs(node: RecipeNode, totals: Map<number, number>): void {
  if (node.ingredients.length === 0) {
    totals.set(node.itemId, (totals.get(node.itemId) ?? 0) + node.count);
  } else {
    for (const child of node.ingredients) {
      flattenLeafs(child, totals);
    }
  }
}
