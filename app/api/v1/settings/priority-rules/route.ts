export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { PriorityRulesSchema } from '@/lib/schemas';
import type { PriorityRules } from '@/lib/schemas';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = requireUser(req);
  if (!isUser(user)) return user;
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
        }
      );
    }

    const raw = await getSetting(user.id, 'priorityRules');

    if (!raw) {
      return NextResponse.json({ rules: [] });
    }

    const rules = JSON.parse(raw) as PriorityRules;
    return NextResponse.json({ rules });
  } catch (err) {
    logger.error('Priority rules GET failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to load priority rules' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = requireUser(req);
  if (!isUser(user)) return user;
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
        }
      );
    }

    const parsed = await validateRequestBody(req, PriorityRulesSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    await putSetting(user.id, 'priorityRules', JSON.stringify(parsed.data));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Priority rules PUT failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to save priority rules' }, { status: 500 });
  }
}
