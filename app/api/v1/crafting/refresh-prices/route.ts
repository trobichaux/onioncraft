export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getGoals, getSetting, putCachedPrices } from '@/lib/tableStorage';
import { GoalProgressSchema } from '@/lib/schemas';
import { buildRecipeTree } from '@/lib/recipeTree';
import type { Recipe, Item, RecipeNode } from '@/lib/recipeTree';
import { Gw2Client } from '@/lib/gw2Client';
import { logger } from '@/lib/logger';

interface GW2Recipe {
  id: number;
  output_item_id: number;
  output_item_count: number;
  min_rating: number;
  disciplines: string[];
  ingredients: Array<{ item_id: number; count: number }>;
}

function collectAllItemIds(node: RecipeNode, ids: Set<number>): void {
  ids.add(node.itemId);
  for (const child of node.ingredients) {
    collectAllItemIds(child, ids);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = requireUser(req);
  if (!isUser(user)) return user;
  const rateResult = checkRateLimit(user.id, { maxRequests: 5, windowMs: 300_000 });
  if (!rateResult.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  try {
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

    // Fetch known recipes from GW2 API
    let knownRecipeIds: number[] = [];
    try {
      knownRecipeIds = await client.get<number[]>('/account/recipes');
    } catch {
      logger.warn('Could not fetch /account/recipes, using goals only', {
        userId: user.id,
      });
    }

    // Batch fetch recipe details
    const gw2Recipes =
      knownRecipeIds.length > 0 ? await client.getBulk<GW2Recipe>('/recipes', knownRecipeIds) : [];

    // Build recipes map
    const recipes = new Map<number, Recipe>();
    const items = new Map<number, Item>();
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

    // Register goal items
    for (const goal of goals) {
      items.set(goal.itemId, { id: goal.itemId, name: goal.itemName, flags: [] });
    }

    // Collect all item IDs needing prices
    const allItemIds = new Set<number>();

    for (const goal of goals) {
      const tree = buildRecipeTree(goal.itemId, recipes, items);
      collectAllItemIds(tree, allItemIds);
    }

    for (const r of gw2Recipes) {
      allItemIds.add(r.output_item_id);
      for (const ing of r.ingredients) {
        allItemIds.add(ing.item_id);
      }
    }

    const itemIds = [...allItemIds];

    logger.info('Refreshing prices', {
      userId: user.id,
      knownRecipes: knownRecipeIds.length,
      itemsToPrice: itemIds.length,
    });

    // Fetch TP prices
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
              itemIds.slice(i, i + 200)
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

    return NextResponse.json({
      refreshed: priceEntries.length,
      knownRecipes: knownRecipeIds.length,
      cachedAt,
    });
  } catch (err) {
    logger.error('Refresh prices POST failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to refresh prices' }, { status: 500 });
  }
}
