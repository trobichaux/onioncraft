export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getGoals, getSetting, getCachedPrices } from '@/lib/tableStorage';
import { GoalProgressSchema, ExclusionListSchema } from '@/lib/schemas';
import { buildRecipeTree } from '@/lib/recipeTree';
import type { Recipe, Item } from '@/lib/recipeTree';
import { buildProfitResult } from '@/lib/profitCalc';
import type { ProfitResult } from '@/lib/profitCalc';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const [records, exclusionRaw] = await Promise.all([
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

  if (goals.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Collect all item IDs from goals for price lookup
  const allItemIds = goals.map((g) => g.itemId);
  const cachedPrices = await getCachedPrices(allItemIds.map(String));

  // Build price map
  const prices = new Map<number, { buyPrice: number; sellPrice: number }>();
  for (const [key, value] of cachedPrices) {
    prices.set(Number(key), { buyPrice: value.buyPrice, sellPrice: value.sellPrice });
  }

  // Build recipe trees and compute profits
  // In this route, we use empty recipe/item maps since real recipes
  // would come from the GW2 API. The trees are simplified for profit calc.
  const recipes = new Map<number, Recipe>();
  const items = new Map<number, Item>();
  for (const goal of goals) {
    items.set(goal.itemId, {
      id: goal.itemId,
      name: goal.itemName,
      flags: [],
    });
  }

  const inventory = new Map<number, number>();

  const results: ProfitResult[] = [];
  for (const goal of goals) {
    if (exclusionSet.has(goal.itemId)) continue;

    const tree = buildRecipeTree(goal.itemId, recipes, items);
    const result = buildProfitResult(tree, prices, inventory);
    results.push(result);
  }

  // Sort by profit descending
  results.sort((a, b) => b.profit - a.profit);

  return NextResponse.json({ items: results });
}
