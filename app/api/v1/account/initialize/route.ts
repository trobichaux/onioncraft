export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getSetting,
  putSetting,
  putCachedRecipes,
  putCachedItems,
  getCachedRecipes,
  getCachedItems,
} from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';
import { logger } from '@/lib/logger';
import type { AccountData } from '@/lib/schemas';

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

/**
 * POST /api/v1/account/initialize
 *
 * Heavy one-time data load: fetches all recipes, items, and character data
 * from the GW2 API and caches them in Azure Table Storage. Subsequent
 * crafting profit calculations read from cache instead of making API calls.
 *
 * Called automatically after API key save or when cache is cold.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = requireUser(req);
  if (!isUser(user)) return user;

  const rateResult = checkRateLimit(`${user.id}:account-init`, {
    maxRequests: 5,
    windowMs: 300_000,
  });
  if (!rateResult.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

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

    // --- Step 1: Fetch account recipes and character list in parallel ---
    const [knownRecipeIds, characterNames] = await Promise.all([
      client.get<number[]>('/account/recipes'),
      client.get<string[]>('/characters'),
    ]);

    // --- Step 2: Fetch character disciplines ---
    const charFilterRaw = await getSetting(user.id, 'characterFilter');
    let charFilter: string[] | undefined;
    if (charFilterRaw) {
      try {
        charFilter = JSON.parse(charFilterRaw);
      } catch {
        /* ignore */
      }
    }

    const charsToCheck = charFilter ?? characterNames;
    const characters: AccountData['characters'] = [];

    for (const charName of charsToCheck) {
      try {
        const crafting = await client.get<CharacterCrafting[]>(
          `/characters/${encodeURIComponent(charName)}/crafting`
        );
        characters.push({
          name: charName,
          disciplines: crafting.map((d) => ({
            discipline: d.discipline,
            rating: d.rating,
          })),
        });
      } catch (err) {
        logger.warn('Failed to fetch character disciplines during init', {
          character: charName,
          error: err instanceof Error ? err.message : String(err),
        });
        characters.push({ name: charName, disciplines: [] });
      }
    }

    // --- Step 3: Check which recipes/items are already cached ---
    const recipeIdStrs = knownRecipeIds.map(String);
    const existingRecipes = await getCachedRecipes(recipeIdStrs);
    const missingRecipeIds = knownRecipeIds.filter((id) => !existingRecipes.has(String(id)));

    logger.info('Account init: recipe cache check', {
      userId: user.id,
      total: knownRecipeIds.length,
      cached: existingRecipes.size,
      missing: missingRecipeIds.length,
    });

    // --- Step 4: Fetch missing recipe details from GW2 API ---
    let newRecipes: GW2Recipe[] = [];
    if (missingRecipeIds.length > 0) {
      newRecipes = await client.getBulk<GW2Recipe>('/recipes', missingRecipeIds);
    }

    // --- Step 5: Collect all item IDs (from both cached + new recipes) ---
    const allItemIds = new Set<number>();
    for (const cached of existingRecipes.values()) {
      allItemIds.add(cached.outputItemId);
      const ings = JSON.parse(cached.ingredients) as Array<{ itemId: number }>;
      for (const ing of ings) allItemIds.add(ing.itemId);
    }
    for (const r of newRecipes) {
      allItemIds.add(r.output_item_id);
      for (const ing of r.ingredients) allItemIds.add(ing.item_id);
    }

    // Check which items are already cached
    const itemIdStrs = [...allItemIds].map(String);
    const existingItems = await getCachedItems(itemIdStrs);
    const missingItemIds = [...allItemIds].filter((id) => !existingItems.has(String(id)));

    logger.info('Account init: item cache check', {
      userId: user.id,
      totalItems: allItemIds.size,
      cached: existingItems.size,
      missing: missingItemIds.length,
    });

    // --- Step 6: Fetch missing item details from GW2 API ---
    const now = new Date().toISOString();

    if (missingItemIds.length > 0) {
      const itemDetails = await client.getBulk<{
        id: number;
        name: string;
        type?: string;
        rarity?: string;
        flags: string[];
      }>('/items', missingItemIds);

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
    }

    // --- Step 7: Cache new recipes ---
    if (newRecipes.length > 0) {
      await putCachedRecipes(
        newRecipes.map((r) => ({
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
    }

    // --- Step 8: Save per-user account data ---
    const accountData: AccountData = {
      knownRecipeIds,
      characters,
      cachedAt: now,
    };
    await putSetting(user.id, 'accountData', JSON.stringify(accountData));

    logger.info('Account initialization completed', {
      userId: user.id,
      knownRecipes: knownRecipeIds.length,
      characters: characters.length,
      newRecipesCached: newRecipes.length,
      newItemsCached: missingItemIds.length,
    });

    return NextResponse.json({
      success: true,
      knownRecipes: knownRecipeIds.length,
      characters: characters.length,
      newRecipesCached: newRecipes.length,
      newItemsCached: missingItemIds.length,
      cachedAt: now,
    });
  } catch (err) {
    logger.error('Account initialization failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Account initialization failed' }, { status: 500 });
  }
}
