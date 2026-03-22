import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getSetting, putSetting } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { PriorityRulesSchema } from '@/lib/schemas';
import type { PriorityRules } from '@/lib/schemas';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  const raw = await getSetting(user.id, 'priorityRules');

  if (!raw) {
    return NextResponse.json({ rules: [] });
  }

  const rules = JSON.parse(raw) as PriorityRules;
  return NextResponse.json({ rules });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const parsed = await validateRequestBody(req, PriorityRulesSchema);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  await putSetting(user.id, 'priorityRules', JSON.stringify(parsed.data));
  return NextResponse.json({ success: true });
}
