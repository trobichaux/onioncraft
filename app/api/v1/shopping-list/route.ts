export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import {
  getShoppingList,
  putShoppingListItems,
  toggleShoppingListItem,
  deleteShoppingListItem,
  clearShoppingList,
} from '@/lib/tableStorage';
import type { ShoppingListItem } from '@/lib/tableStorage';
import { validateRequestBody } from '@/lib/validation';

// GET — return the full shopping list (plugin-friendly)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(req);
  try {
    const items = await getShoppingList(user.id);

    // Sort: incomplete first, then by addedAt desc
    items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.addedAt.localeCompare(a.addedAt);
    });

    return NextResponse.json({ items, updatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('Shopping list GET failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load shopping list' },
      { status: 500 },
    );
  }
}

// POST — save items to the shopping list (from profit calc results)
const SaveSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.number().int().positive(),
      itemName: z.string().min(1),
      quantity: z.number().int().positive(),
      action: z.enum(['craft', 'buy', 'farm']).default('craft'),
      unitProfit: z.number().int().default(0),
      totalProfit: z.number().int().default(0),
    }),
  ),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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
          },
        },
      );
    }

    const parsed = await validateRequestBody(req, SaveSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const now = new Date().toISOString();
    const listItems: ShoppingListItem[] = parsed.data.items.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
      action: item.action ?? 'craft',
      unitProfit: item.unitProfit ?? 0,
      totalProfit: item.totalProfit ?? 0,
      completed: false,
      addedAt: now,
    }));

    await putShoppingListItems(user.id, listItems);

    return NextResponse.json({ success: true, saved: listItems.length });
  } catch (err) {
    logger.error('Shopping list POST failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to save shopping list items' },
      { status: 500 },
    );
  }
}

// PATCH — toggle an item's completed status
const PatchSchema = z.object({
  itemId: z.number().int().positive(),
  completed: z.boolean(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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
          },
        },
      );
    }

    const parsed = await validateRequestBody(req, PatchSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    try {
      await toggleShoppingListItem(user.id, String(parsed.data.itemId), parsed.data.completed);
    } catch {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Shopping list PATCH failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to update shopping list item' },
      { status: 500 },
    );
  }
}

// DELETE — remove a single item or clear the entire list
const DeleteSchema = z.object({
  itemId: z.number().int().positive().optional(),
  clearAll: z.boolean().optional(),
});

export async function DELETE(req: NextRequest): Promise<NextResponse> {
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
          },
        },
      );
    }

    const parsed = await validateRequestBody(req, DeleteSchema);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    if (parsed.data.clearAll) {
      await clearShoppingList(user.id);
    } else if (parsed.data.itemId) {
      await deleteShoppingListItem(user.id, String(parsed.data.itemId));
    } else {
      return NextResponse.json({ error: 'Provide itemId or clearAll: true' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Shopping list DELETE failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to delete shopping list item' },
      { status: 500 },
    );
  }
}
