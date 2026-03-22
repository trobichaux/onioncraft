export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { ExclusionListSchema } from '@/lib/schemas';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  const raw = await getSetting(user.id, 'exclusionList');

  if (!raw) {
    return NextResponse.json({ items: [] });
  }

  const items = JSON.parse(raw) as number[];
  return NextResponse.json({ items });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const parsed = await validateRequestBody(req, ExclusionListSchema);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  await putSetting(user.id, 'exclusionList', JSON.stringify(parsed.data));
  return NextResponse.json({ success: true });
}
