import { NextRequest } from 'next/server';
import { GET } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetGoals = jest.fn();
const mockGetSetting = jest.fn();
const mockGetCachedPrices = jest.fn();
const mockGetCachedRecipes = jest.fn();
const mockGetCachedItems = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getGoals: (...args: unknown[]) => mockGetGoals(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getCachedPrices: (...args: unknown[]) => mockGetCachedPrices(...args),
  getCachedRecipes: (...args: unknown[]) => mockGetCachedRecipes(...args),
  getCachedItems: (...args: unknown[]) => mockGetCachedItems(...args),
}));

jest.mock('@/lib/auth', () => ({
  requireUser: () => ({ id: 'default', name: 'You' }),
  isUser: () => true,
}));

const mockFetchInventory = jest.fn();
jest.mock('@/lib/inventory', () => ({
  fetchInventory: (...args: unknown[]) => mockFetchInventory(...args),
}));

jest.mock('@/lib/gw2Client', () => ({
  Gw2Client: jest.fn().mockImplementation(() => ({})),
  Gw2ApiError: class extends Error {
    constructor(
      public status: number,
      msg: string,
      public endpoint: string
    ) {
      super(msg);
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/crafting/profit', {
    method: 'GET',
  });
}

const MOCK_API_KEY = JSON.stringify({
  key: 'test-key',
  permissions: [],
  validatedAt: '2026-01-01T00:00:00.000Z',
});

function makeAccountData(overrides: Record<string, unknown> = {}): string {
  const base = {
    knownRecipeIds: [] as number[],
    characters: [
      {
        name: 'TestChar',
        disciplines: [
          { discipline: 'Weaponsmith', rating: 500 },
          { discipline: 'Armorsmith', rating: 500 },
          { discipline: 'Artificer', rating: 500 },
          { discipline: 'Huntsman', rating: 500 },
          { discipline: 'Tailor', rating: 500 },
          { discipline: 'Leatherworker', rating: 500 },
          { discipline: 'Chef', rating: 400 },
          { discipline: 'Jeweler', rating: 400 },
        ],
      },
    ],
    cachedAt: new Date().toISOString(),
  };
  return JSON.stringify({ ...base, ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGoals.mockResolvedValue([]);
  mockGetCachedRecipes.mockResolvedValue(new Map());
  mockGetCachedItems.mockResolvedValue(new Map());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/crafting/profit', () => {
  it('returns 400 when no API key is configured', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('API key');
  });

  it('returns 400 with needsInit when account data is not initialized', async () => {
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(MOCK_API_KEY);
      return Promise.resolve(null);
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.needsInit).toBe(true);
    expect(json.error).toContain('not initialized');
  });

  it('returns items array when API key and account data are configured', async () => {
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(MOCK_API_KEY);
      if (key === 'accountData') return Promise.resolve(makeAccountData());
      return Promise.resolve(null);
    });
    mockFetchInventory.mockResolvedValue(new Map<number, number>());
    mockGetCachedPrices.mockResolvedValue(new Map());

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toBeDefined();
    expect(json.inventorySize).toBe(0);
    expect(json.goalsCount).toBe(0);
    expect(json.knownRecipes).toBe(0);
    expect(json.craftableWithDiscipline).toBe(0);
    expect(json.craftableWithMaterials).toBe(0);
    expect(json.cacheAge).toBeDefined();
  });

  it('evaluates known recipes against available inventory', async () => {
    const accountData = makeAccountData({
      knownRecipeIds: [12345],
      characters: [
        {
          name: 'TestChar',
          disciplines: [{ discipline: 'Weaponsmith', rating: 500 }],
        },
      ],
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(MOCK_API_KEY);
      if (key === 'accountData') return Promise.resolve(accountData);
      return Promise.resolve(null);
    });

    // Cached recipe for Deldrimor Steel Ingot
    mockGetCachedRecipes.mockResolvedValue(
      new Map([
        [
          '12345',
          {
            outputItemId: 46735,
            outputItemCount: 1,
            minRating: 450,
            disciplines: JSON.stringify(['Weaponsmith']),
            ingredients: JSON.stringify([
              { itemId: 46742, count: 1 },
              { itemId: 19684, count: 3 },
            ]),
            cachedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ])
    );

    // Cached items
    mockGetCachedItems.mockResolvedValue(
      new Map([
        [
          '46735',
          { name: 'Deldrimor Steel Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        [
          '46742',
          { name: 'Lump of Mithrillium', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        ['19684', { name: 'Mithril Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    // Provide materials (live inventory from GW2 API)
    mockFetchInventory.mockResolvedValue(
      new Map<number, number>([
        [46742, 5],
        [19684, 15],
      ])
    );

    // Provide sell prices
    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['46735', { buyPrice: 0, sellPrice: 50000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46742', { buyPrice: 30000, sellPrice: 35000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19684', { buyPrice: 100, sellPrice: 120, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.knownRecipes).toBe(1);
    expect(json.craftableWithDiscipline).toBe(1);
    expect(json.craftableWithMaterials).toBe(1);
    const deldrimor = json.items.find((i: Record<string, unknown>) => i.itemId === 46735);
    expect(deldrimor).toBeDefined();
    expect(deldrimor.quantity).toBeGreaterThan(0);
    expect(deldrimor.sellPrice).toBe(50000);
  });

  it('reserves materials for goals before evaluating profit', async () => {
    const accountData = makeAccountData({
      knownRecipeIds: [12345],
      characters: [
        {
          name: 'TestChar',
          disciplines: [{ discipline: 'Weaponsmith', rating: 500 }],
        },
      ],
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(MOCK_API_KEY);
      if (key === 'accountData') return Promise.resolve(accountData);
      return Promise.resolve(null);
    });

    // Goal that needs Lump of Mithrillium
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-46735',
        value: JSON.stringify({ itemId: 46735, itemName: 'Deldrimor Steel Ingot' }),
      },
    ]);

    // Cached recipe
    mockGetCachedRecipes.mockResolvedValue(
      new Map([
        [
          '12345',
          {
            outputItemId: 46735,
            outputItemCount: 1,
            minRating: 450,
            disciplines: JSON.stringify(['Weaponsmith']),
            ingredients: JSON.stringify([
              { itemId: 46742, count: 1 },
              { itemId: 19684, count: 3 },
            ]),
            cachedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ])
    );

    // Cached items
    mockGetCachedItems.mockResolvedValue(
      new Map([
        [
          '46735',
          { name: 'Deldrimor Steel Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        [
          '46742',
          { name: 'Lump of Mithrillium', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        ['19684', { name: 'Mithril Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    // Only 1 Lump of Mithrillium - the goal needs 1, leaving 0 for profit crafting
    mockFetchInventory.mockResolvedValue(
      new Map<number, number>([
        [46742, 1],
        [19684, 15],
      ])
    );

    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['46735', { buyPrice: 0, sellPrice: 50000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46742', { buyPrice: 30000, sellPrice: 35000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19684', { buyPrice: 100, sellPrice: 120, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goalsCount).toBe(1);
    // Deldrimor should NOT appear because the Mithrillium is reserved for the goal
    const deldrimor = json.items.find((i: Record<string, unknown>) => i.itemId === 46735);
    expect(deldrimor).toBeUndefined();
  });

  it('excludes items in the exclusion list', async () => {
    const accountData = makeAccountData({
      knownRecipeIds: [12345],
      characters: [
        {
          name: 'TestChar',
          disciplines: [{ discipline: 'Weaponsmith', rating: 500 }],
        },
      ],
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(MOCK_API_KEY);
      if (key === 'accountData') return Promise.resolve(accountData);
      if (key === 'exclusionList') return Promise.resolve(JSON.stringify([46735]));
      return Promise.resolve(null);
    });

    // Cached recipe
    mockGetCachedRecipes.mockResolvedValue(
      new Map([
        [
          '12345',
          {
            outputItemId: 46735,
            outputItemCount: 1,
            minRating: 450,
            disciplines: JSON.stringify(['Weaponsmith']),
            ingredients: JSON.stringify([
              { itemId: 46742, count: 1 },
              { itemId: 19684, count: 3 },
            ]),
            cachedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ])
    );

    // Cached items
    mockGetCachedItems.mockResolvedValue(
      new Map([
        [
          '46735',
          { name: 'Deldrimor Steel Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        [
          '46742',
          { name: 'Lump of Mithrillium', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' },
        ],
        ['19684', { name: 'Mithril Ingot', flags: '[]', cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    mockFetchInventory.mockResolvedValue(
      new Map<number, number>([
        [46742, 5],
        [19684, 15],
        [19685, 90],
        [46741, 50],
      ])
    );

    mockGetCachedPrices.mockResolvedValue(
      new Map([['46735', { buyPrice: 0, sellPrice: 50000, cachedAt: '2026-01-01T00:00:00.000Z' }]])
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    const deldrimor = json.items.find((i: Record<string, unknown>) => i.itemId === 46735);
    expect(deldrimor).toBeUndefined();
  });
});
