export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { CharacterFilterSchema } from '@/lib/schemas';
import type { CharacterFilter } from '@/lib/schemas';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        },
      );
    }

    const raw = await getSetting(user.id, 'characterFilter');

    if (!raw) {
      return NextResponse.json({ enabled: false, characters: [] });
    }

    const filter = JSON.parse(raw) as CharacterFilter;
    return NextResponse.json(filter);
  } catch (err) {
    logger.error('Character filter GET failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load character filter' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        },
      );
    }

    const parsed= await validateRequestBody(req, CharacterFilterSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    await putSetting(user.id, 'characterFilter', JSON.stringify(parsed.data));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Character filter PUT failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to save character filter' },
      { status: 500 },
    );
  }
}
