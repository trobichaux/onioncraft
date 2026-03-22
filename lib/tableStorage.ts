import { TableClient, RestError, TransactionAction, odata } from '@azure/data-tables';
import type {
  PriceCacheEntity,
  SkinCacheEntity,
  RecipeCacheEntity,
  ItemCacheEntity,
} from './schemas';

// ---------------------------------------------------------------------------
// Connection & client helpers
// ---------------------------------------------------------------------------

function getConnectionString(): string {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING is not set. ' +
        'For local dev, copy .env.local.example to .env.local and start Azurite.'
    );
  }
  return connStr;
}

const TABLE_NAMES = [
  'Settings',
  'PriceCache',
  'GoalProgress',
  'SkinCache',
  'ShoppingList',
  'RecipeCache',
  'ItemCache',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

const tableClients = new Map<TableName, TableClient>();

/**
 * Get a TableClient for the specified table.
 * Creates the table if it does not exist (idempotent).
 */
export async function getTableClient(tableName: TableName): Promise<TableClient> {
  const cached = tableClients.get(tableName);
  if (cached) return cached;

  const client = TableClient.fromConnectionString(getConnectionString(), tableName);
  await client.createTable();
  tableClients.set(tableName, client);
  return client;
}

/**
 * Ensure all required tables exist.
 * Call once during app startup or first request.
 */
export async function ensureTables(): Promise<void> {
  for (const name of TABLE_NAMES) {
    const client = TableClient.fromConnectionString(getConnectionString(), name);
    await client.createTable();
    tableClients.set(name, client);
  }
}

/**
 * Reset cached clients — used in tests.
 */
export function _resetClients(): void {
  tableClients.clear();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type SettingKey =
  | 'exclusionList'
  | 'priorityRules'
  | 'apiKey'
  | 'characterFilter'
  | 'ownedSkinIds'
  | 'collectionMeta'
  | 'accountData';

const MAX_VALUE_BYTES = 64 * 1024; // 64 KB

/**
 * Get a raw JSON string for a user setting.
 * Returns null when the setting does not exist.
 *
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function getSetting(userId: string, settingKey: SettingKey): Promise<string | null> {
  const client = await getTableClient('Settings');
  try {
    const entity = await client.getEntity<{ value: string }>(userId, settingKey);
    return entity.value ?? null;
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Upsert a user setting.
 *
 * @throws Error if `value` exceeds 64 KB.
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function putSetting(
  userId: string,
  settingKey: SettingKey,
  value: string
): Promise<void> {
  if (new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
    throw new Error(`Setting value exceeds maximum size of ${MAX_VALUE_BYTES} bytes`);
  }
  const client = await getTableClient('Settings');
  await client.upsertEntity({ partitionKey: userId, rowKey: settingKey, value }, 'Replace');
}

/**
 * Delete a user setting. Silently succeeds if the setting does not exist.
 *
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function deleteSetting(userId: string, settingKey: SettingKey): Promise<void> {
  const client = await getTableClient('Settings');
  try {
    await client.deleteEntity(userId, settingKey);
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PriceCache
// ---------------------------------------------------------------------------

/**
 * Batch-get cached prices for a list of item IDs.
 * Missing items are simply omitted from the returned Map.
 */
export async function getCachedPrices(itemIds: string[]): Promise<Map<string, PriceCacheEntity>> {
  const client = await getTableClient('PriceCache');
  const result = new Map<string, PriceCacheEntity>();

  for (const itemId of itemIds) {
    try {
      const entity = await client.getEntity<{
        buyPrice: number;
        sellPrice: number;
        cachedAt: string;
      }>('shared', itemId);
      result.set(itemId, {
        buyPrice: entity.buyPrice,
        sellPrice: entity.sellPrice,
        cachedAt: entity.cachedAt,
      });
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) continue;
      throw err;
    }
  }

  return result;
}

/** Chunk an array into groups of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Batch-upsert cached prices.
 * Automatically chunks into transactions of ≤100 (Azure Table Storage limit).
 */
export async function putCachedPrices(
  prices: Array<{ itemId: string } & PriceCacheEntity>
): Promise<void> {
  const client = await getTableClient('PriceCache');
  const batches = chunk(prices, 100);

  for (const batch of batches) {
    const actions: TransactionAction[] = batch.map((p) => [
      'upsert',
      {
        partitionKey: 'shared',
        rowKey: p.itemId,
        buyPrice: p.buyPrice,
        sellPrice: p.sellPrice,
        cachedAt: p.cachedAt,
      },
      'Replace',
    ]);
    await client.submitTransaction(actions);
  }
}

// ---------------------------------------------------------------------------
// GoalProgress
// ---------------------------------------------------------------------------

export interface GoalProgressRecord {
  goalId: string;
  value: string;
  resolvedAt?: string;
}

/**
 * List all goal-progress entities for a user.
 *
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function getGoals(userId: string): Promise<GoalProgressRecord[]> {
  const client = await getTableClient('GoalProgress');
  const results: GoalProgressRecord[] = [];

  const entities = client.listEntities<{
    value: string;
    resolvedAt?: string;
  }>({
    queryOptions: { filter: odata`PartitionKey eq ${userId}` },
  });

  for await (const entity of entities) {
    results.push({
      goalId: entity.rowKey as string,
      value: entity.value,
      resolvedAt: entity.resolvedAt,
    });
  }

  return results;
}

/**
 * Upsert a goal-progress entity.
 *
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function putGoal(userId: string, goalId: string, value: string): Promise<void> {
  const client = await getTableClient('GoalProgress');
  await client.upsertEntity({ partitionKey: userId, rowKey: goalId, value }, 'Replace');
}

/**
 * Delete a goal-progress entity. Silently succeeds if it does not exist.
 *
 * @remarks userId must come from `getRequestUser()` at the route level.
 */
export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const client = await getTableClient('GoalProgress');
  try {
    await client.deleteEntity(userId, goalId);
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SkinCache
// ---------------------------------------------------------------------------

/**
 * Batch-get cached skins for a list of skin IDs.
 * Missing skins are simply omitted from the returned Map.
 */
export async function getCachedSkins(skinIds: string[]): Promise<Map<string, SkinCacheEntity>> {
  const client = await getTableClient('SkinCache');
  const result = new Map<string, SkinCacheEntity>();

  for (const skinId of skinIds) {
    try {
      const entity = await client.getEntity<{
        name: string;
        type: string;
        icon: string;
        cachedAt: string;
      }>('shared', skinId);
      result.set(skinId, {
        name: entity.name,
        type: entity.type,
        icon: entity.icon,
        cachedAt: entity.cachedAt,
      });
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) continue;
      throw err;
    }
  }

  return result;
}

/**
 * Batch-upsert cached skins.
 * Automatically chunks into transactions of ≤100 (Azure Table Storage limit).
 */
export async function putCachedSkins(
  skins: Array<{ skinId: string } & SkinCacheEntity>
): Promise<void> {
  const client = await getTableClient('SkinCache');
  const batches = chunk(skins, 100);

  for (const batch of batches) {
    const actions: TransactionAction[] = batch.map((s) => [
      'upsert',
      {
        partitionKey: 'shared',
        rowKey: s.skinId,
        name: s.name,
        type: s.type,
        icon: s.icon,
        cachedAt: s.cachedAt,
      },
      'Replace',
    ]);
    await client.submitTransaction(actions);
  }
}

// ---------------------------------------------------------------------------
// ShoppingList
// ---------------------------------------------------------------------------

export interface ShoppingListItem {
  itemId: number;
  itemName: string;
  quantity: number;
  action: 'craft' | 'buy' | 'farm';
  unitProfit: number;
  totalProfit: number;
  completed: boolean;
  addedAt: string;
}

export async function getShoppingList(userId: string): Promise<ShoppingListItem[]> {
  const client = await getTableClient('ShoppingList');
  const results: ShoppingListItem[] = [];

  const entities = client.listEntities<{
    itemId: number;
    itemName: string;
    quantity: number;
    action: string;
    unitProfit: number;
    totalProfit: number;
    completed: boolean;
    addedAt: string;
  }>({
    queryOptions: { filter: odata`PartitionKey eq ${userId}` },
  });

  for await (const entity of entities) {
    results.push({
      itemId: entity.itemId,
      itemName: entity.itemName,
      quantity: entity.quantity,
      action: entity.action as 'craft' | 'buy' | 'farm',
      unitProfit: entity.unitProfit,
      totalProfit: entity.totalProfit,
      completed: entity.completed,
      addedAt: entity.addedAt,
    });
  }

  return results;
}

export async function putShoppingListItems(
  userId: string,
  items: ShoppingListItem[]
): Promise<void> {
  if (items.length === 0) return;
  const client = await getTableClient('ShoppingList');
  const batches = chunk(items, 100);

  for (const batch of batches) {
    const actions: TransactionAction[] = batch.map((item) => [
      'upsert',
      {
        partitionKey: userId,
        rowKey: String(item.itemId),
        ...item,
      },
      'Replace',
    ]);
    await client.submitTransaction(actions);
  }
}

export async function toggleShoppingListItem(
  userId: string,
  itemId: string,
  completed: boolean
): Promise<void> {
  const client = await getTableClient('ShoppingList');
  try {
    const entity = await client.getEntity<Record<string, unknown>>(userId, itemId);
    await client.upsertEntity(
      {
        partitionKey: userId,
        rowKey: itemId,
        ...entity,
        completed,
      },
      'Replace'
    );
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) {
      throw new Error('Shopping list item not found');
    }
    throw err;
  }
}

export async function deleteShoppingListItem(userId: string, itemId: string): Promise<void> {
  const client = await getTableClient('ShoppingList');
  try {
    await client.deleteEntity(userId, itemId);
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return;
    throw err;
  }
}

export async function clearShoppingList(userId: string): Promise<void> {
  const client = await getTableClient('ShoppingList');
  const entities = client.listEntities<{ rowKey: string }>({
    queryOptions: { filter: odata`PartitionKey eq ${userId}` },
  });
  for await (const entity of entities) {
    await client.deleteEntity(userId, entity.rowKey as string);
  }
}

// ---------------------------------------------------------------------------
// RecipeCache (shared — recipe details from GW2 API)
// ---------------------------------------------------------------------------

/**
 * Batch-get cached recipe details.
 * Missing recipes are omitted from the returned Map.
 */
export async function getCachedRecipes(
  recipeIds: string[]
): Promise<Map<string, RecipeCacheEntity>> {
  const client = await getTableClient('RecipeCache');
  const result = new Map<string, RecipeCacheEntity>();

  for (const recipeId of recipeIds) {
    try {
      const entity = await client.getEntity<{
        outputItemId: number;
        outputItemCount: number;
        minRating: number;
        disciplines: string;
        ingredients: string;
        cachedAt: string;
      }>('shared', recipeId);
      result.set(recipeId, {
        outputItemId: entity.outputItemId,
        outputItemCount: entity.outputItemCount,
        minRating: entity.minRating,
        disciplines: entity.disciplines,
        ingredients: entity.ingredients,
        cachedAt: entity.cachedAt,
      });
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) continue;
      throw err;
    }
  }

  return result;
}

/**
 * Batch-upsert cached recipes.
 * Chunks into transactions of ≤100 (Azure Table Storage limit).
 */
export async function putCachedRecipes(
  recipes: Array<{ recipeId: string } & RecipeCacheEntity>
): Promise<void> {
  const client = await getTableClient('RecipeCache');
  const batches = chunk(recipes, 100);

  for (const batch of batches) {
    const actions: TransactionAction[] = batch.map((r) => [
      'upsert',
      {
        partitionKey: 'shared',
        rowKey: r.recipeId,
        outputItemId: r.outputItemId,
        outputItemCount: r.outputItemCount,
        minRating: r.minRating,
        disciplines: r.disciplines,
        ingredients: r.ingredients,
        cachedAt: r.cachedAt,
      },
      'Replace',
    ]);
    await client.submitTransaction(actions);
  }
}

// ---------------------------------------------------------------------------
// ItemCache (shared — item details from GW2 API)
// ---------------------------------------------------------------------------

/**
 * Batch-get cached item details.
 * Missing items are omitted from the returned Map.
 */
export async function getCachedItems(itemIds: string[]): Promise<Map<string, ItemCacheEntity>> {
  const client = await getTableClient('ItemCache');
  const result = new Map<string, ItemCacheEntity>();

  for (const itemId of itemIds) {
    try {
      const entity = await client.getEntity<{
        name: string;
        type?: string;
        rarity?: string;
        flags: string;
        cachedAt: string;
      }>('shared', itemId);
      result.set(itemId, {
        name: entity.name,
        type: entity.type,
        rarity: entity.rarity,
        flags: entity.flags,
        cachedAt: entity.cachedAt,
      });
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) continue;
      throw err;
    }
  }

  return result;
}

/**
 * Batch-upsert cached items.
 * Chunks into transactions of ≤100 (Azure Table Storage limit).
 */
export async function putCachedItems(
  items: Array<{ itemId: string } & ItemCacheEntity>
): Promise<void> {
  const client = await getTableClient('ItemCache');
  const batches = chunk(items, 100);

  for (const batch of batches) {
    const actions: TransactionAction[] = batch.map((i) => [
      'upsert',
      {
        partitionKey: 'shared',
        rowKey: i.itemId,
        name: i.name,
        type: i.type ?? '',
        rarity: i.rarity ?? '',
        flags: i.flags,
        cachedAt: i.cachedAt,
      },
      'Replace',
    ]);
    await client.submitTransaction(actions);
  }
}
