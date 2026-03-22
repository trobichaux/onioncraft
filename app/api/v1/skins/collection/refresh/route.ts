export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { getCachedSkins, putCachedSkins } from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';
import { PriorityRulesSchema } from '@/lib/schemas';
import type { PriorityRules } from '@/lib/schemas';
import {
  computeUnownedSkins,
  applyPriorityRules,
} from '@/lib/skinCatalog';
import skinSourcesData from '@/data/skin-sources.json';
import { logger } from '@/lib/logger';

interface GW2SkinDetail {
  id: number;
  name: string;
  type: string;
  rarity?: string;
  icon: string;
}

const BATCH_SIZE = 200;

/**
 * POST /api/v1/skins/collection/refresh
 *
 * Full refresh: fetches owned skins + catalog from GW2 API, computes unowned
 * list with acquisition methods and TP prices, persists owned IDs + metadata
 * to Table Storage, and returns the complete collection response.
 *
 * This is the "heavy" operation triggered by the Refresh button.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  try {
    const apiKeyRaw = await getSetting(user.id, 'apiKey');
    if (!apiKeyRaw) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    const { key } = JSON.parse(apiKeyRaw) as { key: string };
    const client = new Gw2Client({ apiKey: key });

    logger.info('Starting full skin collection refresh', { userId: user.id });

    // 1. Fetch owned + all skin IDs in parallel
    const [ownedSkinIds, allSkinIds] = await Promise.all([
      client.get<number[]>('/account/skins'),
      client.get<number[]>('/skins'),
    ]);

    logger.info('Fetched skin IDs from GW2 API', {
      userId: user.id,
      owned: ownedSkinIds.length,
      total: allSkinIds.length,
    });

    // 2. Persist owned skin IDs for cross-session state
    const ownedJson = JSON.stringify(ownedSkinIds);
    const ownedBytes = new TextEncoder().encode(ownedJson).length;
    if (ownedBytes <= 64 * 1024) {
      await putSetting(user.id, 'ownedSkinIds', ownedJson);
    } else {
      logger.warn('Owned skin IDs exceed 64KB, skipping persistence', {
        userId: user.id,
        bytes: ownedBytes,
        count: ownedSkinIds.length,
      });
    }

    // 3. Compute unowned IDs
    const ownedSet = new Set(ownedSkinIds);
    const unownedIds = allSkinIds.filter((id) => !ownedSet.has(id));

    // 4. Fetch skin details (from cache or GW2 API)
    const cachedMap = await getCachedSkins(unownedIds.map(String));
    const uncachedIds = unownedIds.filter((id) => !cachedMap.has(String(id)));

    if (uncachedIds.length > 0) {
      logger.info('Fetching uncached skin details', {
        userId: user.id,
        uncachedCount: uncachedIds.length,
      });

      const fetched = await client.getBulk<GW2SkinDetail>('/skins', uncachedIds);
      const now = new Date().toISOString();

      const toCache = fetched.map((s) => ({
        skinId: String(s.id),
        name: s.name,
        type: s.type,
        icon: s.icon,
        cachedAt: now,
      }));

      if (toCache.length > 0) {
        await putCachedSkins(toCache);
      }

      for (const s of fetched) {
        cachedMap.set(String(s.id), {
          name: s.name,
          type: s.type,
          icon: s.icon,
          cachedAt: now,
        });
      }
    }

    // 5. Build skin details map
    const skinDetails = new Map<number, { name: string; type: string; icon: string; rarity?: string }>();
    for (const [idStr, entity] of cachedMap.entries()) {
      skinDetails.set(Number(idStr), {
        name: entity.name,
        type: entity.type,
        icon: entity.icon,
      });
    }

    // 6. Build skin sources map
    const skinSources = new Map<number, { method: string; notes?: string }>();
    for (const s of skinSourcesData.skins) {
      skinSources.set(s.skinId, { method: s.method, notes: s.notes });
    }

    // 7. Fetch TP prices for unowned skins
    const tpPrices = new Map<number, number>();
    for (let i = 0; i < unownedIds.length; i += BATCH_SIZE) {
      const batch = unownedIds.slice(i, i + BATCH_SIZE);
      try {
        const prices = await client.get<Array<{ id: number; sells: { unit_price: number } }>>(
          '/commerce/prices',
          { ids: batch.join(',') },
        );
        for (const p of prices) {
          if (p.sells?.unit_price) {
            tpPrices.set(p.id, p.sells.unit_price);
          }
        }
      } catch (err) {
        logger.warn('TP price batch fetch failed (some skins may lack pricing)', {
          batchStart: i,
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 8. Acquisition method categorization
    const achievementSkinIds = new Set<number>();
    const vendorSkinIds = new Set<number>();

    const unowned = computeUnownedSkins(
      allSkinIds,
      ownedSkinIds,
      skinDetails,
      tpPrices,
      achievementSkinIds,
      vendorSkinIds,
      skinSources,
    );

    // 9. Apply priority rules
    const rulesRaw = await getSetting(user.id, 'priorityRules');
    let rules: PriorityRules = [];
    if (rulesRaw) {
      const parsed = PriorityRulesSchema.safeParse(JSON.parse(rulesRaw));
      if (parsed.success) {
        rules = parsed.data;
      }
    }

    const sorted = applyPriorityRules(unowned, rules);

    // 10. Persist collection metadata
    const now = new Date().toISOString();
    const meta = {
      total: allSkinIds.length,
      ownedCount: ownedSkinIds.length,
      lastRefreshed: now,
    };
    await putSetting(user.id, 'collectionMeta', JSON.stringify(meta));

    logger.info('Skin collection refresh completed', {
      userId: user.id,
      total: allSkinIds.length,
      owned: ownedSkinIds.length,
      unowned: sorted.length,
    });

    return NextResponse.json({
      total: allSkinIds.length,
      owned: ownedSkinIds.length,
      unowned: sorted,
      lastRefreshed: now,
    });
  } catch (err) {
    logger.error('Skin collection refresh failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to refresh skin collection' },
      { status: 500 },
    );
  }
}
