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
import candidatesData from '@/data/profitable-candidates.json';
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
  category?: string;
  noTpListing?: boolean;
  accountBound?: boolean;
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

    // Fetch in parallel: inventory, goals, exclusion list, character filter
    const [records, exclusionRaw, charFilterRaw] = await Promise.all([
      getGoals(user.id),
      getSetting(user.id, 'exclusionList'),
      getSetting(user.id, 'characterFilter'),
    ]);

    // Parse character filter
    let charFilter: string[] | undefined;
    if (charFilterRaw) {
      try {
        charFilter = JSON.parse(charFilterRaw);
      } catch {
        /* ignore malformed filter */
      }
    }

    // Fetch inventory (bank + materials + shared + character bags)
    const inventory = await fetchInventory(client, charFilter);

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

    // Fetch character disciplines for craftability validation
    const disciplineMap = new Map<string, number>();
    try {
      const characterNames = await client.get<string[]>('/characters');
      const charsToCheck = charFilter ?? characterNames;
      for (const charName of charsToCheck) {
        const crafting = await client.get<CharacterCrafting[]>(
          `/characters/${encodeURIComponent(charName)}/crafting`
        );
        for (const d of crafting) {
          const current = disciplineMap.get(d.discipline) ?? 0;
          if (d.rating > current) {
            disciplineMap.set(d.discipline, d.rating);
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch character disciplines, skipping discipline check', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Standard crafting recipes map (empty — buildRecipeTree uses mystic forge JSON)
    const recipes = new Map<number, Recipe>();
    const items = new Map<number, Item>();

    // Register all known items
    for (const goal of goals) {
      items.set(goal.itemId, { id: goal.itemId, name: goal.itemName, flags: [] });
    }

    const candidates = (
      candidatesData as {
        candidates: Array<{ itemId: number; itemName: string; category: string }>;
      }
    ).candidates;

    for (const c of candidates) {
      items.set(c.itemId, { id: c.itemId, name: c.itemName, flags: [] });
    }

    // Fetch item details from GW2 API to get accurate flags (AccountBound, etc.)
    const candidateIds = candidates.map((c) => c.itemId);
    try {
      const itemDetails = await client.getBulk<{
        id: number;
        name: string;
        type?: string;
        rarity?: string;
        flags: string[];
      }>('/items', candidateIds);
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
      logger.warn('Failed to fetch item details for candidates, using defaults', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Build recipe trees — cache to avoid redundant builds
    const treeCache = new Map<number, RecipeNode>();
    function getTree(itemId: number): RecipeNode {
      let tree = treeCache.get(itemId);
      if (!tree) {
        tree = buildRecipeTree(itemId, recipes, items);
        treeCache.set(itemId, tree);
      }
      return tree;
    }

    // Step 1: Build recipe trees for ALL goals
    const goalTrees: RecipeNode[] = [];
    for (const goal of goals) {
      goalTrees.push(getTree(goal.itemId));
    }

    // Step 2: Calculate overages (inventory - goal requirements)
    const overages = calculateOverages(goalTrees, inventory);

    // Clamp to >= 0: negative means fully reserved
    const available = new Map<number, number>();
    for (const [itemId, overage] of overages) {
      available.set(itemId, Math.max(0, overage));
    }

    // Collect all item IDs we need prices for
    const allItemIds = new Set<number>();
    for (const c of candidates) {
      collectAllItemIds(getTree(c.itemId), allItemIds);
    }
    for (const tree of goalTrees) {
      collectAllItemIds(tree, allItemIds);
    }

    // Step 3: Load cached prices + check staleness
    const cachedPrices = await getCachedPrices([...allItemIds].map(String));
    const prices = new Map<number, { buyPrice: number; sellPrice: number }>();
    let oldestPriceAge: string | null = null;
    let pricesMissing = 0;

    for (const [idStr, value] of cachedPrices) {
      prices.set(Number(idStr), { buyPrice: value.buyPrice, sellPrice: value.sellPrice });
      if (value.cachedAt && (!oldestPriceAge || value.cachedAt < oldestPriceAge)) {
        oldestPriceAge = value.cachedAt;
      }
    }
    pricesMissing = allItemIds.size - prices.size;

    // Step 4: Evaluate each candidate
    const results: ProfitEntry[] = [];

    for (const candidate of candidates) {
      if (exclusionSet.has(candidate.itemId)) continue;

      const tree = getTree(candidate.itemId);
      if (!tree.craftable) continue;

      // Check if user has the required discipline
      if (tree.disciplineRequired && disciplineMap.size > 0) {
        const userLevel = disciplineMap.get(tree.disciplineRequired) ?? 0;
        const reqLevel = tree.levelRequired ?? 0;
        if (userLevel < reqLevel) {
          logger.debug('Skipping candidate: insufficient discipline', {
            item: candidate.itemName,
            required: `${tree.disciplineRequired} ${reqLevel}`,
            userLevel,
          });
          continue;
        }
      }

      // Check if output item is account-bound (can't sell on TP)
      const outputItem = items.get(candidate.itemId);
      const isAccountBound =
        outputItem?.flags.includes('AccountBound') || outputItem?.flags.includes('SoulBound');

      // How many can we craft from available (post-reservation) materials?
      const qty = maxCraftableFromInventory(tree, available);
      if (qty <= 0) continue;

      const effectiveQty = tree.dailyCap != null ? Math.min(qty, tree.dailyCap) : qty;
      if (effectiveQty <= 0) continue;

      const sellPrice = prices.get(candidate.itemId)?.sellPrice ?? 0;
      const noTpListing = sellPrice <= 0;

      // Opportunity cost: sum of buy prices for leaf materials
      let materialValue = 0;
      const leafReqs = new Map<number, number>();
      flattenLeafs(tree, leafReqs);
      for (const [leafId, countPerUnit] of leafReqs) {
        const leafBuyPrice = prices.get(leafId)?.buyPrice ?? 0;
        materialValue += leafBuyPrice * countPerUnit;
      }

      if (noTpListing || isAccountBound) {
        // Include in results but mark appropriately
        results.push({
          itemId: candidate.itemId,
          itemName: candidate.itemName,
          sellPrice: 0,
          craftingCost: materialValue,
          listingFee: 0,
          exchangeFee: 0,
          profitPerUnit: 0,
          quantity: effectiveQty,
          totalProfit: 0,
          roi: 0,
          dailyCap: tree.dailyCap,
          category: candidate.category,
          noTpListing,
          accountBound: isAccountBound ?? false,
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
        itemId: candidate.itemId,
        itemName: candidate.itemName,
        sellPrice,
        craftingCost: materialValue,
        listingFee,
        exchangeFee,
        profitPerUnit,
        quantity: effectiveQty,
        totalProfit,
        roi: Math.round(roi * 100) / 100,
        dailyCap: tree.dailyCap,
        category: candidate.category,
      });
    }

    // Sort: profitable items first (descending), then no-listing/account-bound at bottom
    results.sort((a, b) => {
      if (a.noTpListing !== b.noTpListing) return a.noTpListing ? 1 : -1;
      if (a.accountBound !== b.accountBound) return a.accountBound ? 1 : -1;
      return b.totalProfit - a.totalProfit;
    });

    // Price staleness info
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
