import { Gw2Client } from '@/lib/gw2Client';

interface BankSlot {
  id: number;
  count: number;
}

interface MaterialSlot {
  id: number;
  count: number;
}

/**
 * Fetch player inventory from GW2 API and merge into a single item count map.
 * Combines: account bank + material storage.
 */
export async function fetchInventory(client: Gw2Client): Promise<Map<number, number>> {
  const inventory = new Map<number, number>();

  const [bankSlots, materialSlots] = await Promise.all([
    client.get<Array<BankSlot | null>>('/account/bank'),
    client.get<MaterialSlot[]>('/account/materials'),
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

  return inventory;
}
