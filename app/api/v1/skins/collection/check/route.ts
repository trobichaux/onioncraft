export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting } from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';
import { CollectionMetaSchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/skins/collection/check
 *
 * Lightweight change detection: fetches the current owned-skin count from the
 * GW2 API and compares it with the persisted count.  No heavy computation.
 *
 * Returns: { changed, currentCount, previousCount }
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

    // Fetch current owned skin IDs from GW2 API (lightweight — just the ID list)
    const currentOwnedIds = await client.get<number[]>('/account/skins');
    const currentCount = currentOwnedIds.length;

    // Load persisted metadata
    const metaRaw = await getSetting(user.id, 'collectionMeta');
    let previousCount = 0;

    if (metaRaw) {
      const parsed = CollectionMetaSchema.safeParse(JSON.parse(metaRaw));
      if (parsed.success) {
        previousCount = parsed.data.ownedCount;
      }
    }

    const changed = currentCount !== previousCount;

    logger.info('Skin collection check completed', {
      userId: user.id,
      changed,
      currentCount,
      previousCount,
    });

    return NextResponse.json({ changed, currentCount, previousCount });
  } catch (err) {
    logger.error('Skin collection check failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to check for collection changes' },
      { status: 500 },
    );
  }
}
