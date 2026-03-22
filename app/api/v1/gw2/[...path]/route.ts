import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { Gw2Client, Gw2ApiError, CircuitOpenError } from '@/lib/gw2Client';

const client = new Gw2Client();

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  // Auth gate — every route must call getRequestUser.
  getRequestUser(req);

  const endpoint = '/' + params.path.join('/');

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
      return NextResponse.json(
        { error: 'GW2 API temporarily unavailable' },
        { status: 503 },
      );
    }

    if (err instanceof Gw2ApiError) {
      return NextResponse.json({ error: 'Upstream API error' }, { status: err.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
