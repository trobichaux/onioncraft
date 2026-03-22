import { Gw2Client } from '@/lib/gw2Client';
import { logger } from '@/lib/logger';

interface BankSlot {
  id: number;
  count: number;
}

interface MaterialSlot {
  id: number;
  count: number;
}

interface SharedSlot {
  id: number;
  count: number;
}

interface BagItem {
  id: number;
  count: number;
}

interface Bag {
  inventory: Array<BagItem | null>;
}

/**
 * Fetch player inventory from GW2 API and merge into a single item count map.
 * Combines: account bank + material storage + shared inventory + character bags.
 *
 * @param characterFilter Optional list of character names to include.
 *   If omitted, all characters are included.
 */
export async function fetchInventory(
  client: Gw2Client,
  characterFilter?: string[]
): Promise<Map<number, number>> {
  const inventory = new Map<number, number>();

  // Fetch bank, materials, shared inventory, and character list in parallel
  const [bankSlots, materialSlots, sharedSlots, characterNames] = await Promise.all([
    client.get<Array<BankSlot | null>>('/account/bank'),
    client.get<MaterialSlot[]>('/account/materials'),
    client.get<Array<SharedSlot | null>>('/account/inventory'),
    client.get<string[]>('/characters'),
  ]);

  // Bank: array of slots, some may be null (empty)
  for (const slot of bankSlots) {
    if (slot && slot.id && slot.count > 0) {
      inventory.set(slot.id, (inventory.get(slot.id) ?? 0) + slot.count);
    }
  }

  // Material storage
  for (const mat of materialSlots) {
    if (mat.id && mat.count > 0) {
      inventory.set(mat.id, (inventory.get(mat.id) ?? 0) + mat.count);
    }
  }

  // Shared inventory slots
  for (const slot of sharedSlots) {
    if (slot && slot.id && slot.count > 0) {
      inventory.set(slot.id, (inventory.get(slot.id) ?? 0) + slot.count);
    }
  }

  // Character bags — respect character filter
  const chars = characterFilter ?? characterNames;
  for (const charName of chars) {
    try {
      const bags = await client.get<Array<Bag | null>>(
        `/characters/${encodeURIComponent(charName)}/inventory`
      );
      for (const bag of bags) {
        if (!bag?.inventory) continue;
        for (const item of bag.inventory) {
          if (item && item.id && item.count > 0) {
            inventory.set(item.id, (inventory.get(item.id) ?? 0) + item.count);
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch character inventory', {
        character: charName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return inventory;
}
