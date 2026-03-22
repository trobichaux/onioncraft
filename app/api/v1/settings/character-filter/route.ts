export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { CharacterFilterSchema } from '@/lib/schemas';
import type { CharacterFilter } from '@/lib/schemas';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  const raw = await getSetting(user.id, 'characterFilter');

  if (!raw) {
    return NextResponse.json({ enabled: false, characters: [] });
  }

  const filter = JSON.parse(raw) as CharacterFilter;
  return NextResponse.json(filter);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const parsed = await validateRequestBody(req, CharacterFilterSchema);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  await putSetting(user.id, 'characterFilter', JSON.stringify(parsed.data));
  return NextResponse.json({ success: true });
}
