export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { putCachedSkins } from '@/lib/tableStorage';
import { getSetting } from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';
import { logger } from '@/lib/logger';

interface GW2SkinDetail {
  id: number;
  name: string;
  type: string;
  icon: string;
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
    if (!apiKeyRaw) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    const { key } = JSON.parse(apiKeyRaw) as { key: string };
    const client = new Gw2Client({ apiKey: key });

    logger.info('Starting skin catalog refresh', { userId: user.id });

    const allSkinIds = await client.get<number[]>('/skins');
    const details = await client.getBulk<GW2SkinDetail>('/skins', allSkinIds);

    const now = new Date().toISOString();
    const toCache = details.map((s) => ({
      skinId: String(s.id),
      name: s.name,
      type: s.type,
      icon: s.icon,
      cachedAt: now,
    }));

    if (toCache.length > 0) {
      await putCachedSkins(toCache);
    }

    logger.info('Skin catalog refresh completed', {
      userId: user.id,
      refreshed: details.length,
    });

    return NextResponse.json({
      refreshed: details.length,
      cachedAt: now,
    });
  } catch (err) {
    logger.error('Skin catalog refresh failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'Failed to refresh skin catalog' }, { status: 500 });
  }
}
