export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser } from '@/lib/auth';
import { getGoals, putGoal, deleteGoal } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';
import { GoalProgressSchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

const AddGoalSchema = z.object({
  itemId: z.number().int().positive(),
  itemName: z.string().min(1),
});

const DeleteGoalSchema = z.object({
  goalId: z.string().min(1),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const records = await getGoals(user.id);

    const goals = records.map((r) => {
      const parsed = GoalProgressSchema.safeParse(JSON.parse(r.value));
      return {
        goalId: r.goalId,
        ...(parsed.success ? parsed.data : { itemId: 0, itemName: 'Unknown' }),
        resolvedAt: r.resolvedAt,
      };
    });

    return NextResponse.json({ goals });
  } catch (err) {
    logger.error('Crafting goals GET failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to load crafting goals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const parsed = await validateRequestBody(req, AddGoalSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { itemId, itemName } = parsed.data;
    const goalId = `goal-${itemId}`;
    const goalData = { itemId, itemName };

    await putGoal(user.id, goalId, JSON.stringify(goalData));
    return NextResponse.json({ success: true, goalId });
  } catch (err) {
    logger.error('Crafting goals POST failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to add crafting goal' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const parsed = await validateRequestBody(req, DeleteGoalSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    await deleteGoal(user.id, parsed.data.goalId);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Crafting goals DELETE failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to delete crafting goal' }, { status: 500 });
  }
}
