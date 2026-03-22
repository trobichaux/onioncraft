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
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  // Get API key — required for inventory
  const apiKeyRaw = await getSetting(user.id, 'apiKey');
  if (!apiKeyRaw) {
    return NextResponse.json(
      { error: 'API key required. Add your GW2 API key on the Settings page.' },
      { status: 400 },
    );
  }

  const { key } = JSON.parse(apiKeyRaw) as { key: string };
  const client = new Gw2Client({ apiKey: key });

  // Fetch in parallel: inventory, goals, exclusion list
  const [inventory, records, exclusionRaw] = await Promise.all([
    fetchInventory(client),
    getGoals(user.id),
    getSetting(user.id, 'exclusionList'),
  ]);

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

  // Standard crafting recipes map (empty — buildRecipeTree uses mystic forge JSON)
  const recipes = new Map<number, Recipe>();
  const items = new Map<number, Item>();

  // Register all known items
  for (const goal of goals) {
    items.set(goal.itemId, { id: goal.itemId, name: goal.itemName, flags: [] });
  }

  const candidates = (candidatesData as {
    candidates: Array<{ itemId: number; itemName: string; category: string }>;
  }).candidates;

  for (const c of candidates) {
    items.set(c.itemId, { id: c.itemId, name: c.itemName, flags: [] });
  }

  // Step 1: Build recipe trees for ALL goals
  const goalTrees: RecipeNode[] = [];
  for (const goal of goals) {
    const tree = buildRecipeTree(goal.itemId, recipes, items);
    goalTrees.push(tree);
  }

  // Step 2: Calculate overages (inventory - goal requirements)
  // Positive overage = materials available after reserving for goals
  const overages = calculateOverages(goalTrees, inventory);

  // Clamp to >= 0: negative means fully reserved, no materials available
  const available = new Map<number, number>();
  for (const [itemId, overage] of overages) {
    available.set(itemId, Math.max(0, overage));
  }

  // Collect all item IDs we need prices for
  const allItemIds = new Set<number>();
  for (const c of candidates) {
    const tree = buildRecipeTree(c.itemId, recipes, items);
    collectAllItemIds(tree, allItemIds);
  }
  for (const tree of goalTrees) {
    collectAllItemIds(tree, allItemIds);
  }

  // Step 3: Load cached prices
  const cachedPrices = await getCachedPrices([...allItemIds].map(String));
  const prices = new Map<number, { buyPrice: number; sellPrice: number }>();
  for (const [idStr, value] of cachedPrices) {
    prices.set(Number(idStr), { buyPrice: value.buyPrice, sellPrice: value.sellPrice });
  }

  // Step 4: Evaluate each candidate — how many can we craft? what's the profit?
  const results: ProfitEntry[] = [];

  for (const candidate of candidates) {
    if (exclusionSet.has(candidate.itemId)) continue;

    const tree = buildRecipeTree(candidate.itemId, recipes, items);
    if (!tree.craftable) continue;

    // How many can we craft from available (post-reservation) materials?
    const qty = maxCraftableFromInventory(tree, available);
    if (qty <= 0) continue;

    // Cap by daily limit if applicable
    const effectiveQty = tree.dailyCap != null ? Math.min(qty, tree.dailyCap) : qty;
    if (effectiveQty <= 0) continue;

    // Profit calculation: we already own the materials, so crafting cost = 0
    // (materials came from inventory). Revenue = sell on TP minus fees.
    // But we also show opportunity cost: what would buying the materials cost?
    const sellPrice = prices.get(candidate.itemId)?.sellPrice ?? 0;
    if (sellPrice <= 0) continue;

    // Opportunity cost: sum of buy prices for leaf materials × required count
    let materialValue = 0;
    const leafReqs = new Map<number, number>();
    flattenLeafs(tree, leafReqs);
    for (const [leafId, countPerUnit] of leafReqs) {
      const leafBuyPrice = prices.get(leafId)?.buyPrice ?? 0;
      materialValue += leafBuyPrice * countPerUnit;
    }

    const { listingFee, exchangeFee, profit: profitPerUnit } = calculateProfit(
      sellPrice,
      materialValue,
    );

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

  // Sort by total profit descending, return top 10
  results.sort((a, b) => b.totalProfit - a.totalProfit);
  const top = results.slice(0, 10);

  return NextResponse.json({
    items: top,
    inventorySize: inventory.size,
    goalsCount: goals.length,
    lastUpdated: new Date().toISOString(),
  });
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
