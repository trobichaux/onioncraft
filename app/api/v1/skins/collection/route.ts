export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting } from '@/lib/tableStorage';
import { CollectionMetaSchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/skins/collection
 *
 * Returns persisted collection metadata (stats) without calling the GW2 API.
 * If no persisted data exists, returns { needsRefresh: true } so the client
 * knows to prompt for an initial refresh.
 *
 * The full unowned skins list is only available via POST /collection/refresh.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  try {
    const apiKeyRaw = await getSetting(user.id, 'apiKey');
    if (!apiKeyRaw) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    const metaRaw = await getSetting(user.id, 'collectionMeta');
    if (!metaRaw) {
      logger.info('No persisted collection data, refresh needed', { userId: user.id });
      return NextResponse.json({ needsRefresh: true });
    }

    const parsed = CollectionMetaSchema.safeParse(JSON.parse(metaRaw));
    if (!parsed.success) {
      logger.warn('Invalid persisted collection metadata', {
        userId: user.id,
        errors: parsed.error.issues,
      });
      return NextResponse.json({ needsRefresh: true });
    }

    return NextResponse.json({
      total: parsed.data.total,
      owned: parsed.data.ownedCount,
      lastRefreshed: parsed.data.lastRefreshed,
      needsRefresh: false,
    });
  } catch (err) {
    logger.error('Failed to load collection metadata', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to load collection data' }, { status: 500 });
  }
}
