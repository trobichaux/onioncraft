import { TableClient } from '@azure/data-tables';

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

const TABLE_NAMES= ['Settings', 'PriceCache', 'GoalProgress', 'SkinCache'] as const;
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
