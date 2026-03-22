export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting } from '@/lib/tableStorage';
import { getCachedSkins, putCachedSkins } from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';
import { PriorityRulesSchema } from '@/lib/schemas';
import type { PriorityRules } from '@/lib/schemas';
import {
  computeUnownedSkins,
  applyPriorityRules,
} from '@/lib/skinCatalog';
import type { SkinEntry } from '@/lib/skinCatalog';
import skinSourcesData from '@/data/skin-sources.json';

interface GW2SkinDetail {
  id: number;
  name: string;
  type: string;
  rarity?: string;
  icon: string;
}

const BATCH_SIZE = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  // Get API key from settings
  const apiKeyRaw = await getSetting(user.id, 'apiKey');
  if (!apiKeyRaw) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  const { key } = JSON.parse(apiKeyRaw) as { key: string };
  const client = new Gw2Client({ apiKey: key });

  // Fetch owned + all skin IDs in parallel
  const [ownedSkinIds, allSkinIds] = await Promise.all([
    client.get<number[]>('/account/skins'),
    client.get<number[]>('/skins'),
  ]);

  const ownedSet = new Set(ownedSkinIds);
  const unownedIds = allSkinIds.filter((id) => !ownedSet.has(id));

  // Check skin cache
  const cachedMap = await getCachedSkins(unownedIds.map(String));
  const uncachedIds = unownedIds.filter((id) => !cachedMap.has(String(id)));

  // Fetch uncached skin details from GW2 API in batches
  if (uncachedIds.length > 0) {
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

    // Merge into cached map
    for (const s of fetched) {
      cachedMap.set(String(s.id), {
        name: s.name,
        type: s.type,
        icon: s.icon,
        cachedAt: now,
      });
    }
  }

  // Build skin details map
  const skinDetails = new Map<number, { name: string; type: string; icon: string; rarity?: string }>();
  for (const [idStr, entity] of cachedMap.entries()) {
    skinDetails.set(Number(idStr), {
      name: entity.name,
      type: entity.type,
      icon: entity.icon,
    });
  }

  // Build skin sources map from data file
  const skinSources = new Map<number, { method: string; notes?: string }>();
  for (const s of skinSourcesData.skins) {
    skinSources.set(s.skinId, { method: s.method, notes: s.notes });
  }

  // TP prices: check which unowned skins have TP listings
  // Fetch commerce prices for unowned skins in batches
  const tpPrices = new Map<number, number>();
  const tpBatchIds = unownedIds.slice(); // all unowned
  for (let i = 0; i < tpBatchIds.length; i += BATCH_SIZE) {
    const batch = tpBatchIds.slice(i, i + BATCH_SIZE);
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
    } catch {
      // Some skin IDs may not have TP listings — skip errors
    }
  }

  // Achievement skin IDs and vendor skin IDs are empty sets for now
  const achievementSkinIds = new Set<number>();
  const vendorSkinIds = new Set<number>();

  const unowned: SkinEntry[] = computeUnownedSkins(
    allSkinIds,
    ownedSkinIds,
    skinDetails,
    tpPrices,
    achievementSkinIds,
    vendorSkinIds,
    skinSources,
  );

  // Apply priority rules from user settings
  const rulesRaw = await getSetting(user.id, 'priorityRules');
  let rules: PriorityRules = [];
  if (rulesRaw) {
    const parsed = PriorityRulesSchema.safeParse(JSON.parse(rulesRaw));
    if (parsed.success) {
      rules = parsed.data;
    }
  }

  const sorted = applyPriorityRules(unowned, rules);

  return NextResponse.json({
    total: allSkinIds.length,
    owned: ownedSkinIds.length,
    unowned: sorted,
    lastUpdated: new Date().toISOString(),
  });
}
