export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { Gw2Client, Gw2ApiError, CircuitOpenError } from '@/lib/gw2Client';

const client = new Gw2Client();

/** Only these GW2 API endpoint prefixes are allowed through the proxy. */
const ALLOWED_PREFIXES = [
  '/items',
  '/recipes',
  '/commerce/prices',
  '/commerce/listings',
  '/skins',
  '/currencies',
  '/legendaryarmory',
  '/achievements',
];

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  // Auth gate — every route must call requireUser.
  const user = requireUser(req);
  if (!isUser(user)) return user;

  const rateResult = checkRateLimit(user.id);
  if (!rateResult.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const endpoint = '/' + params.path.join('/');

  if (!ALLOWED_PREFIXES.some((p) => endpoint.startsWith(p))) {
    return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 });
  }

  // Forward incoming query parameters.
  const qp: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    qp[key] = value;
  });

  try {
    const data = await client.get<unknown>(endpoint, Object.keys(qp).length > 0 ? qp : undefined);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'GW2 API temporarily unavailable' }, { status: 503 });
    }

    if (err instanceof Gw2ApiError) {
      return NextResponse.json({ error: 'Upstream API error' }, { status: err.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
