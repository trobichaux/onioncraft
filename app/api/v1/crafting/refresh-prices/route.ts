export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getGoals, getSetting, putCachedPrices } from '@/lib/tableStorage';
import { GoalProgressSchema } from '@/lib/schemas';
import { buildRecipeTree } from '@/lib/recipeTree';
import type { Recipe, Item, RecipeNode } from '@/lib/recipeTree';
import { Gw2Client } from '@/lib/gw2Client';
import candidatesData from '@/data/profitable-candidates.json';
import { logger } from '@/lib/logger';

function collectAllItemIds(node: RecipeNode, ids: Set<number>): void {
  ids.add(node.itemId);
  for (const child of node.ingredients) {
    collectAllItemIds(child, ids);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    // Get API key for authenticated endpoints
    const apiKeyRaw = await getSetting(user.id, 'apiKey');
    const client = apiKeyRaw
      ? new Gw2Client({ apiKey: (JSON.parse(apiKeyRaw) as { key: string }).key })
      : new Gw2Client();

    const records = await getGoals(user.id);

    const goals = records
      .map((r) => {
        const parsed = GoalProgressSchema.safeParse(JSON.parse(r.value));
        return parsed.success ? parsed.data : null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    // Standard crafting recipes map (empty — buildRecipeTree uses mystic forge JSON)
    const recipes = new Map<number, Recipe>();
    const items = new Map<number, Item>();

    // Register goal items
    for (const goal of goals) {
      items.set(goal.itemId, { id: goal.itemId, name: goal.itemName, flags: [] });
    }

    // Register candidate items
    const candidates = (candidatesData as { candidates: Array<{ itemId: number; itemName: string }> }).candidates;
    for (const c of candidates) {
      items.set(c.itemId, { id: c.itemId, name: c.itemName, flags: [] });
    }

    // Build recipe trees for goals + candidates to discover all item IDs needing prices
    const allItemIds = new Set<number>();

    for (const goal of goals) {
      const tree = buildRecipeTree(goal.itemId, recipes, items);
      collectAllItemIds(tree, allItemIds);
    }

    for (const c of candidates) {
      const tree = buildRecipeTree(c.itemId, recipes, items);
      collectAllItemIds(tree, allItemIds);
    }

    const itemIds = [...allItemIds];

    // Fetch TP prices for all discovered items
    interface GW2Price {
      id: number;
      buys?: { unit_price: number };
      sells?: { unit_price: number };
    }

    let priceData: GW2Price[] = [];
    if (itemIds.length > 0) {
      try {
        priceData = await client.getBulk<GW2Price>('/commerce/prices', itemIds);
      } catch {
        // Some items may not be tradeable — fetch in smaller batches
        for (let i = 0; i < itemIds.length; i += 200) {
          try {
            const batch = await client.getBulk<GW2Price>(
              '/commerce/prices',
              itemIds.slice(i, i + 200),
            );
            priceData.push(...batch);
          } catch {
            // Skip batches with untradeable items
          }
        }
      }
    }

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
  } catch (err) {
    logger.error('Refresh prices POST failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to refresh prices' },
      { status: 500 },
    );
  }
}
