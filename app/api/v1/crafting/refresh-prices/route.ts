export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getGoals, putCachedPrices } from '@/lib/tableStorage';
import { GoalProgressSchema } from '@/lib/schemas';
import { buildRecipeTree } from '@/lib/recipeTree';
import type { Recipe, Item, RecipeNode } from '@/lib/recipeTree';
import { Gw2Client } from '@/lib/gw2Client';

function collectLeafItemIds(node: RecipeNode, ids: Set<number>): void {
  if (node.ingredients.length === 0) {
    ids.add(node.itemId);
  } else {
    for (const child of node.ingredients) {
      collectLeafItemIds(child, ids);
    }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const records = await getGoals(user.id);

  const goals = records
    .map((r) => {
      const parsed = GoalProgressSchema.safeParse(JSON.parse(r.value));
      return parsed.success ? parsed.data : null;
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  if (goals.length === 0) {
    return NextResponse.json({ refreshed: 0, cachedAt: new Date().toISOString() });
  }

  // Build recipe trees to discover all leaf item IDs
  const recipes = new Map<number, Recipe>();
  const items = new Map<number, Item>();
  for (const goal of goals) {
    items.set(goal.itemId, {
      id: goal.itemId,
      name: goal.itemName,
      flags: [],
    });
  }

  const allLeafIds = new Set<number>();
  // Also include goal item IDs for sell price lookups
  for (const goal of goals) {
    allLeafIds.add(goal.itemId);
    const tree = buildRecipeTree(goal.itemId, recipes, items);
    collectLeafItemIds(tree, allLeafIds);
  }

  const itemIds = [...allLeafIds];

  // Fetch prices from GW2 API
  const client = new Gw2Client();
  interface GW2Price {
    id: number;
    buys?: { unit_price: number };
    sells?: { unit_price: number };
  }
  const priceData = await client.getBulk<GW2Price>('/commerce/prices', itemIds);

  const cachedAt = new Date().toISOString();
  const priceEntries = priceData.map((p) => ({
    itemId: String(p.id),
    buyPrice: p.buys?.unit_price ?? 0,
    sellPrice: p.sells?.unit_price ?? 0,
    cachedAt,
  }));

  if (priceEntries.length > 0) {
    await putCachedPrices(priceEntries);
  }

  return NextResponse.json({ refreshed: priceEntries.length, cachedAt });
}
