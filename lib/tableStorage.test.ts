import { RestError } from '@azure/data-tables';
import {
  getSetting,
  putSetting,
  deleteSetting,
  getCachedPrices,
  putCachedPrices,
  getGoals,
  putGoal,
  deleteGoal,
  getCachedSkins,
  putCachedSkins,
  _resetClients,
} from './tableStorage';

// ---------------------------------------------------------------------------
// Mock @azure/data-tables
// ---------------------------------------------------------------------------
const mockGetEntity = jest.fn();
const mockUpsertEntity = jest.fn();
const mockDeleteEntity = jest.fn();
const mockListEntities = jest.fn();
const mockSubmitTransaction = jest.fn();
const mockCreateTable = jest.fn();

jest.mock('@azure/data-tables', () => {
  const actual = jest.requireActual('@azure/data-tables');
  return {
    ...actual,
    TableClient: {
      fromConnectionString: jest.fn(() => ({
        getEntity: mockGetEntity,
        upsertEntity: mockUpsertEntity,
        deleteEntity: mockDeleteEntity,
        listEntities: mockListEntities,
        submitTransaction: mockSubmitTransaction,
        createTable: mockCreateTable,
      })),
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  _resetClients();
  process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
});

afterAll(() => {
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
describe('getSetting', () => {
  it('returns the value when entity exists', async () => {
    mockGetEntity.mockResolvedValue({ value: '["hello"]' });
    const result = await getSetting('user1', 'exclusionList');
    expect(result).toBe('["hello"]');
    expect(mockGetEntity).toHaveBeenCalledWith('user1', 'exclusionList');
  });

  it('returns null when entity does not exist', async () => {
    const error = new RestError('Not Found', { statusCode: 404 });
    mockGetEntity.mockRejectedValue(error);
    const result = await getSetting('user1', 'exclusionList');
    expect(result).toBeNull();
  });

  it('throws on non-404 errors', async () => {
    const error = new RestError('Server Error', { statusCode: 500 });
    mockGetEntity.mockRejectedValue(error);
    await expect(getSetting('user1', 'exclusionList')).rejects.toThrow();
  });
});

describe('putSetting', () => {
  it('calls upsertEntity with correct PK/RK', async () => {
    mockUpsertEntity.mockResolvedValue(undefined);
    await putSetting('user1', 'exclusionList', '[1,2,3]');
    expect(mockUpsertEntity).toHaveBeenCalledWith(
      { partitionKey: 'user1', rowKey: 'exclusionList', value: '[1,2,3]' },
      'Replace'
    );
  });

  it('throws when value exceeds 64KB', async () => {
    const bigValue = 'x'.repeat(64 * 1024 + 1);
    await expect(putSetting('user1', 'exclusionList', bigValue)).rejects.toThrow(
      /exceeds maximum size/
    );
    expect(mockUpsertEntity).not.toHaveBeenCalled();
  });
});

describe('deleteSetting', () => {
  it('calls deleteEntity with correct PK/RK', async () => {
    mockDeleteEntity.mockResolvedValue(undefined);
    await deleteSetting('user1', 'apiKey');
    expect(mockDeleteEntity).toHaveBeenCalledWith('user1', 'apiKey');
  });

  it('swallows 404 errors', async () => {
    const error = new RestError('Not Found', { statusCode: 404 });
    mockDeleteEntity.mockRejectedValue(error);
    await expect(deleteSetting('user1', 'apiKey')).resolves.toBeUndefined();
  });

  it('throws on non-404 errors', async () => {
    const error = new RestError('Server Error', { statusCode: 500 });
    mockDeleteEntity.mockRejectedValue(error);
    await expect(deleteSetting('user1', 'apiKey')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PriceCache
// ---------------------------------------------------------------------------
describe('getCachedPrices', () => {
  it('returns a Map keyed by itemId', async () => {
    mockGetEntity.mockResolvedValue({
      buyPrice: 100,
      sellPrice: 200,
      cachedAt: '2024-01-01T00:00:00Z',
    });
    const result = await getCachedPrices(['123']);
    expect(result).toBeInstanceOf(Map);
    expect(result.get('123')).toEqual({
      buyPrice: 100,
      sellPrice: 200,
      cachedAt: '2024-01-01T00:00:00Z',
    });
    expect(mockGetEntity).toHaveBeenCalledWith('shared', '123');
  });

  it('omits missing items (404)', async () => {
    const error = new RestError('Not Found', { statusCode: 404 });
    mockGetEntity.mockRejectedValue(error);
    const result = await getCachedPrices(['999']);
    expect(result.size).toBe(0);
  });

  it('returns empty Map for empty input', async () => {
    const result = await getCachedPrices([]);
    expect(result.size).toBe(0);
  });
});

describe('putCachedPrices', () => {
  it('submits a single transaction for ≤100 items', async () => {
    mockSubmitTransaction.mockResolvedValue(undefined);
    const prices = Array.from({ length: 5 }, (_, i) => ({
      itemId: String(i),
      buyPrice: i * 10,
      sellPrice: i * 20,
      cachedAt: '2024-01-01T00:00:00Z',
    }));
    await putCachedPrices(prices);
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    const actions = mockSubmitTransaction.mock.calls[0][0];
    expect(actions).toHaveLength(5);
  });

  it('chunks into batches of 100', async () => {
    mockSubmitTransaction.mockResolvedValue(undefined);
    const prices = Array.from({ length: 250 }, (_, i) => ({
      itemId: String(i),
      buyPrice: 0,
      sellPrice: 0,
      cachedAt: '2024-01-01T00:00:00Z',
    }));
    await putCachedPrices(prices);
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(3);
    expect(mockSubmitTransaction.mock.calls[0][0]).toHaveLength(100);
    expect(mockSubmitTransaction.mock.calls[1][0]).toHaveLength(100);
    expect(mockSubmitTransaction.mock.calls[2][0]).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// GoalProgress
// ---------------------------------------------------------------------------
describe('getGoals', () => {
  it('lists entities from the correct partition', async () => {
    const fakeEntities = [
      { rowKey: 'goal1', value: '{"itemId":1}', resolvedAt: undefined },
      { rowKey: 'goal2', value: '{"itemId":2}', resolvedAt: '2024-06-01T00:00:00Z' },
    ];
    mockListEntities.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const e of fakeEntities) yield e;
      },
    });

    const goals = await getGoals('user1');
    expect(goals).toEqual([
      { goalId: 'goal1', value: '{"itemId":1}', resolvedAt: undefined },
      { goalId: 'goal2', value: '{"itemId":2}', resolvedAt: '2024-06-01T00:00:00Z' },
    ]);
    expect(mockListEntities).toHaveBeenCalledWith({
      queryOptions: { filter: "PartitionKey eq 'user1'" },
    });
  });

  it('returns empty array when no goals exist', async () => {
    mockListEntities.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // empty
      },
    });
    const goals = await getGoals('user1');
    expect(goals).toEqual([]);
  });
});

describe('putGoal', () => {
  it('upserts with correct PK/RK', async () => {
    mockUpsertEntity.mockResolvedValue(undefined);
    await putGoal('user1', 'goal42', '{"itemId":42}');
    expect(mockUpsertEntity).toHaveBeenCalledWith(
      { partitionKey: 'user1', rowKey: 'goal42', value: '{"itemId":42}' },
      'Replace'
    );
  });
});

describe('deleteGoal', () => {
  it('swallows 404 errors', async () => {
    const error = new RestError('Not Found', { statusCode: 404 });
    mockDeleteEntity.mockRejectedValue(error);
    await expect(deleteGoal('user1', 'goal42')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SkinCache
// ---------------------------------------------------------------------------
describe('getCachedSkins', () => {
  it('returns a Map keyed by skinId', async () => {
    mockGetEntity.mockResolvedValue({
      name: 'Sunrise',
      type: 'Weapon',
      icon: 'https://example.com/icon.png',
      cachedAt: '2024-01-01T00:00:00Z',
    });
    const result = await getCachedSkins(['s1']);
    expect(result).toBeInstanceOf(Map);
    expect(result.get('s1')).toEqual({
      name: 'Sunrise',
      type: 'Weapon',
      icon: 'https://example.com/icon.png',
      cachedAt: '2024-01-01T00:00:00Z',
    });
    expect(mockGetEntity).toHaveBeenCalledWith('shared', 's1');
  });
});

describe('putCachedSkins', () => {
  it('submits a single transaction for ≤100 items', async () => {
    mockSubmitTransaction.mockResolvedValue(undefined);
    const skins = [
      {
        skinId: 's1',
        name: 'Sunrise',
        type: 'Weapon',
        icon: 'https://example.com/icon.png',
        cachedAt: '2024-01-01T00:00:00Z',
      },
    ];
    await putCachedSkins(skins);
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    const actions = mockSubmitTransaction.mock.calls[0][0];
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toMatchObject({
      partitionKey: 'shared',
      rowKey: 's1',
      name: 'Sunrise',
    });
  });
});
