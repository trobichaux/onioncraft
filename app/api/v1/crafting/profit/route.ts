export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getGoals, getSetting, getCachedPrices } from '@/lib/tableStorage';
import { GoalProgressSchema, ExclusionListSchema } from '@/lib/schemas';
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

interface GW2Recipe {
  id: number;
  type: string;
  output_item_id: number;
  output_item_count: number;
  min_rating: number;
  disciplines: string[];
  ingredients: Array<{ item_id: number; count: number }>;
}

interface CharacterCrafting {
  discipline: string;
  rating: number;
  active: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const apiKeyRaw = await getSetting(user.id, 'apiKey');
    if (!apiKeyRaw) {
      return NextResponse.json(
        { error: 'API key required. Add your GW2 API key on the Settings page.' },
        { status: 400 }
      );
    }

    const { key } = JSON.parse(apiKeyRaw) as { key: string };
    const client = new Gw2Client({ apiKey: key });

    // Fetch settings in parallel
    const [records, exclusionRaw, charFilterRaw] = await Promise.all([
      getGoals(user.id),
      getSetting(user.id, 'exclusionList'),
      getSetting(user.id, 'characterFilter'),
    ]);

    let charFilter: string[] | undefined;
    if (charFilterRaw) {
      try {
        charFilter = JSON.parse(charFilterRaw);
      } catch {
        /* ignore */
      }
    }

    // Fetch inventory, known recipes, and character names in parallel
    const [inventory, knownRecipeIds, characterNames] = await Promise.all([
      fetchInventory(client, charFilter),
      client.get<number[]>('/account/recipes'),
      client.get<string[]>('/characters'),
    ]);

    // Build discipline map from characters
    const disciplineMap = new Map<string, number>();
    const charsToCheck = charFilter ?? characterNames;
    for (const charName of charsToCheck) {
      try {
        const crafting = await client.get<CharacterCrafting[]>(
          `/characters/${encodeURIComponent(charName)}/crafting`
        );
        for (const d of crafting) {
          const current = disciplineMap.get(d.discipline) ?? 0;
          if (d.rating > current) {
            disciplineMap.set(d.discipline, d.rating);
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch character disciplines', {
          character: charName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Fetched crafting data', {
      userId: user.id,
      knownRecipes: knownRecipeIds.length,
      inventorySize: inventory.size,
      disciplines: Object.fromEntries(disciplineMap),
    });

    // Batch fetch recipe details from GW2 API
    const gw2Recipes = await client.getBulk<GW2Recipe>('/recipes', knownRecipeIds);

    // Build recipes map for buildRecipeTree
    const recipes = new Map<number, Recipe>();
    for (const r of gw2Recipes) {
      recipes.set(r.output_item_id, {
        outputItemId: r.output_item_id,
        outputItemCount: r.output_item_count,
        disciplines: r.disciplines,
        minRating: r.min_rating,
        ingredients: r.ingredients.map((ing) => ({
          itemId: ing.item_id,
          count: ing.count,
        })),
      });
    }

    // Collect all item IDs for details fetch (outputs + ingredients)
    const allItemIds = new Set<number>();
    for (const r of gw2Recipes) {
      allItemIds.add(r.output_item_id);
      for (const ing of r.ingredients) {
        allItemIds.add(ing.item_id);
      }
    }

    // Fetch item details (names, flags)
    const items = new Map<number, Item>();
    try {
      const itemDetails = await client.getBulk<{
        id: number;
        name: string;
        type?: string;
        rarity?: string;
        flags: string[];
      }>('/items', [...allItemIds]);
      for (const detail of itemDetails) {
        items.set(detail.id, {
          id: detail.id,
          name: detail.name,
          type: detail.type,
          rarity: detail.rarity,
          flags: detail.flags,
        });
      }
    } catch (err) {
      logger.warn('Failed to fetch item details', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

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

    // Evaluate all known recipes
    let craftableWithDiscipline = 0;
    let craftableWithMaterials = 0;
    const results: ProfitEntry[] = [];

    for (const r of gw2Recipes) {
      if (exclusionSet.has(r.output_item_id)) continue;

      // User must have at least one matching discipline at sufficient level
      const hasDiscipline =
        r.disciplines.length === 0 ||
        r.disciplines.some((d) => (disciplineMap.get(d) ?? 0) >= r.min_rating);
      if (!hasDiscipline) continue;

      craftableWithDiscipline++;

      const tree = getTree(r.output_item_id);
      if (!tree.craftable) continue;

      const qty = maxCraftableFromInventory(tree, available);
      if (qty <= 0) continue;

      craftableWithMaterials++;

      const effectiveQty = tree.dailyCap != null ? Math.min(qty, tree.dailyCap) : qty;
      if (effectiveQty <= 0) continue;

      const outputItem = items.get(r.output_item_id);
      const isAccountBound =
        outputItem?.flags.includes('AccountBound') || outputItem?.flags.includes('SoulBound');

      const sellPrice = prices.get(r.output_item_id)?.sellPrice ?? 0;
      const noTpListing = sellPrice <= 0;

      let materialValue = 0;
      const leafReqs = new Map<number, number>();
      flattenLeafs(tree, leafReqs);
      for (const [leafId, countPerUnit] of leafReqs) {
        const leafBuyPrice = prices.get(leafId)?.buyPrice ?? 0;
        materialValue += leafBuyPrice * countPerUnit;
      }

      const itemName = outputItem?.name ?? `Item ${r.output_item_id}`;

      if (noTpListing || isAccountBound) {
        results.push({
          itemId: r.output_item_id,
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
          disciplineRequired: r.disciplines[0],
          levelRequired: r.min_rating,
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
        itemId: r.output_item_id,
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
        disciplineRequired: r.disciplines[0],
        levelRequired: r.min_rating,
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
      knownRecipes: knownRecipeIds.length,
      craftableWithDiscipline,
      craftableWithMaterials,
      lastUpdated: new Date().toISOString(),
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
