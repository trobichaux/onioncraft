export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getGoals,
  getSetting,
  putCachedPrices,
  getCachedRecipes,
  getCachedItems,
  putCachedRecipes,
  putCachedItems,
  putSetting,
} from '@/lib/tableStorage';
import { GoalProgressSchema, AccountDataSchema } from '@/lib/schemas';
import type { AccountData } from '@/lib/schemas';
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
  const rateResult = checkRateLimit(`${user.id}:refresh-prices`, {
    maxRequests: 5,
    windowMs: 300_000,
  });
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

    // --- Incremental recipe update: diff against cached account data ---
    let knownRecipeIds: number[] = [];
    let newRecipesCached = 0;
    let newItemsCached = 0;

    try {
      knownRecipeIds = await client.get<number[]>('/account/recipes');
    } catch {
      logger.warn('Could not fetch /account/recipes, using cached data', {
        userId: user.id,
      });
      // Fall back to cached account data
      const accountDataRaw = await getSetting(user.id, 'accountData');
      if (accountDataRaw) {
        const parsed = AccountDataSchema.safeParse(JSON.parse(accountDataRaw));
        if (parsed.success) knownRecipeIds = parsed.data.knownRecipeIds;
      }
    }

    // Check which recipes are already cached
    const recipeIdStrs = knownRecipeIds.map(String);
    const existingRecipes = await getCachedRecipes(recipeIdStrs);
    const missingRecipeIds = knownRecipeIds.filter((id) => !existingRecipes.has(String(id)));

    // Fetch only NEW recipe details
    let freshRecipes: GW2Recipe[] = [];
    if (missingRecipeIds.length > 0) {
      freshRecipes = await client.getBulk<GW2Recipe>('/recipes', missingRecipeIds);
      const now = new Date().toISOString();
      await putCachedRecipes(
        freshRecipes.map((r) => ({
          recipeId: String(r.id),
          outputItemId: r.output_item_id,
          outputItemCount: r.output_item_count,
          minRating: r.min_rating,
          disciplines: JSON.stringify(r.disciplines),
          ingredients: JSON.stringify(
            r.ingredients.map((ing) => ({ itemId: ing.item_id, count: ing.count }))
          ),
          cachedAt: now,
        }))
      );
      newRecipesCached = freshRecipes.length;
    }

    // Update accountData with current recipe list
    if (knownRecipeIds.length > 0) {
      const accountDataRaw = await getSetting(user.id, 'accountData');
      if (accountDataRaw) {
        const parsed = AccountDataSchema.safeParse(JSON.parse(accountDataRaw));
        if (parsed.success) {
          const updated: AccountData = {
            ...parsed.data,
            knownRecipeIds,
            cachedAt: new Date().toISOString(),
          };
          await putSetting(user.id, 'accountData', JSON.stringify(updated));
        }
      }
    }

    // Build recipes map from cache + fresh data
    const recipes = new Map<number, Recipe>();
    const items = new Map<number, Item>();
    for (const [, cached] of existingRecipes) {
      const ings = JSON.parse(cached.ingredients) as Array<{ itemId: number; count: number }>;
      recipes.set(cached.outputItemId, {
        outputItemId: cached.outputItemId,
        outputItemCount: cached.outputItemCount,
        disciplines: JSON.parse(cached.disciplines) as string[],
        minRating: cached.minRating,
        ingredients: ings,
      });
    }
    for (const r of freshRecipes) {
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
    for (const [, recipe] of recipes) {
      allItemIds.add(recipe.outputItemId);
      for (const ing of recipe.ingredients) allItemIds.add(ing.itemId);
    }

    // Cache any missing items
    const itemIdStrs = [...allItemIds].map(String);
    const existingItems = await getCachedItems(itemIdStrs);
    const missingItemIds = [...allItemIds].filter((id) => !existingItems.has(String(id)));
    if (missingItemIds.length > 0) {
      const itemDetails = await client.getBulk<{
        id: number;
        name: string;
        type?: string;
        rarity?: string;
        flags: string[];
      }>('/items', missingItemIds);
      const now = new Date().toISOString();
      await putCachedItems(
        itemDetails.map((item) => ({
          itemId: String(item.id),
          name: item.name,
          type: item.type,
          rarity: item.rarity,
          flags: JSON.stringify(item.flags),
          cachedAt: now,
        }))
      );
      newItemsCached = itemDetails.length;
    }

    const priceItemIds = [...allItemIds];

    logger.info('Refreshing prices', {
      userId: user.id,
      knownRecipes: knownRecipeIds.length,
      newRecipesCached,
      newItemsCached,
      itemsToPrice: priceItemIds.length,
    });

    // Fetch TP prices
    interface GW2Price {
      id: number;
      buys?: { unit_price: number };
      sells?: { unit_price: number };
    }

    let priceData: GW2Price[] = [];
    if (priceItemIds.length > 0) {
      try {
        priceData = await client.getBulk<GW2Price>('/commerce/prices', priceItemIds);
      } catch {
        for (let i = 0; i < priceItemIds.length; i += 200) {
          try {
            const batch = await client.getBulk<GW2Price>(
              '/commerce/prices',
              priceItemIds.slice(i, i + 200)
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
      newRecipesCached,
      newItemsCached,
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
