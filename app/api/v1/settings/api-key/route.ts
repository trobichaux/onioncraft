import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser } from '@/lib/auth';
import { getSetting, putSetting, deleteSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { Gw2Client, Gw2ApiError, REQUIRED_PERMISSIONS } from '@/lib/gw2Client';

const PostBodySchema = z.object({ key: z.string().min(1) });

interface TokenInfoResponse {
  id: string;
  name: string;
  permissions: string[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const parsed = await validateRequestBody(req, PostBodySchema);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { key } = parsed.data;
  const client = new Gw2Client({ apiKey: key });

  let tokenInfo: TokenInfoResponse;
  try {
    tokenInfo = await client.get<TokenInfoResponse>('/tokeninfo');
  } catch (err) {
    if (err instanceof Gw2ApiError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to validate API key' }, { status: 500 });
  }

  const missingPermissions = REQUIRED_PERMISSIONS.filter(
    (p) => !tokenInfo.permissions.includes(p),
  );

  if (missingPermissions.length > 0) {
    return NextResponse.json(
      {
        error: `Missing permissions: ${missingPermissions.join(', ')}`,
        missingPermissions,
      },
      { status: 400 },
    );
  }

  const permissions = [...tokenInfo.permissions];
  await putSetting(
    user.id,
    'apiKey',
    JSON.stringify({
      key,
      permissions,
      validatedAt: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ success: true, permissions });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  await deleteSetting(user.id, 'apiKey');
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  const raw = await getSetting(user.id, 'apiKey');

  if (!raw) {
    return NextResponse.json({ hasKey: false });
  }

  const stored = JSON.parse(raw) as { permissions: string[]; validatedAt: string };
  return NextResponse.json({
    hasKey: true,
    permissions: stored.permissions,
    validatedAt: stored.validatedAt,
  });
}
