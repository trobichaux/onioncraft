export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { putCachedSkins } from '@/lib/tableStorage';
import { getSetting } from '@/lib/tableStorage';
import { Gw2Client } from '@/lib/gw2Client';

interface GW2SkinDetail {
  id: number;
  name: string;
  type: string;
  icon: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);

  const apiKeyRaw = await getSetting(user.id, 'apiKey');
  if (!apiKeyRaw) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  const { key } = JSON.parse(apiKeyRaw) as { key: string };
  const client = new Gw2Client({ apiKey: key });

  // Fetch all skin IDs
  const allSkinIds = await client.get<number[]>('/skins');

  // Fetch details in batches
  const details = await client.getBulk<GW2SkinDetail>('/skins', allSkinIds);

  const now = new Date().toISOString();
  const toCache = details.map((s) => ({
    skinId: String(s.id),
    name: s.name,
    type: s.type,
    icon: s.icon,
    cachedAt: now,
  }));

  if (toCache.length > 0) {
    await putCachedSkins(toCache);
  }

  return NextResponse.json({
    refreshed: details.length,
    cachedAt: now,
  });
}
