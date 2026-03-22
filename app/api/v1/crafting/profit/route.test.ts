import { NextRequest } from 'next/server';
import { GET } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetGoals = jest.fn();
const mockGetSetting = jest.fn();
const mockGetCachedPrices = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getGoals: (...args: unknown[]) => mockGetGoals(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getCachedPrices: (...args: unknown[]) => mockGetCachedPrices(...args),
}));

jest.mock('@/lib/auth', () => ({
  requireUser: () => ({ id: 'default', name: 'You' }),
  isUser: () => true,
}));

const mockFetchInventory = jest.fn();
jest.mock('@/lib/inventory', () => ({
  fetchInventory: (...args: unknown[]) => mockFetchInventory(...args),
}));

const mockGw2Get = jest.fn();
const mockGw2GetBulk = jest.fn();

jest.mock('@/lib/gw2Client', () => ({
  Gw2Client: jest.fn().mockImplementation(() => ({
    get: mockGw2Get,
    getBulk: mockGw2GetBulk,
  })),
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

beforeEach(() => {
  jest.clearAllMocks();
  // Default GW2 API mocks
  mockGw2Get.mockImplementation((endpoint: string) => {
    if (endpoint === '/account/recipes') return Promise.resolve([]);
    if (endpoint === '/characters') return Promise.resolve(['TestChar']);
    if (endpoint.includes('/crafting')) {
      return Promise.resolve([
        { discipline: 'Weaponsmith', rating: 500, active: true },
        { discipline: 'Armorsmith', rating: 500, active: true },
        { discipline: 'Artificer', rating: 500, active: true },
        { discipline: 'Huntsman', rating: 500, active: true },
        { discipline: 'Tailor', rating: 500, active: true },
        { discipline: 'Leatherworker', rating: 500, active: true },
        { discipline: 'Chef', rating: 400, active: false },
        { discipline: 'Jeweler', rating: 400, active: false },
      ]);
    }
    return Promise.resolve([]);
  });
  mockGw2GetBulk.mockImplementation((endpoint: string) => {
    if (endpoint === '/recipes') return Promise.resolve([]);
    if (endpoint === '/items') return Promise.resolve([]);
    return Promise.resolve([]);
  });
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

  it('returns items array when API key is configured', async () => {
    const apiKey = JSON.stringify({
      key: 'test-key',
      permissions: [],
      validatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(apiKey);
      return Promise.resolve(null);
    });
    mockGetGoals.mockResolvedValue([]);
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
  });

  it('evaluates known recipes against available inventory', async () => {
    const apiKey = JSON.stringify({
      key: 'test-key',
      permissions: [],
      validatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(apiKey);
      return Promise.resolve(null);
    });
    mockGetGoals.mockResolvedValue([]);

    // GW2 API: user knows recipe 12345 which outputs item 46735 (Deldrimor Steel Ingot)
    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/recipes') return Promise.resolve([12345]);
      if (endpoint === '/characters') return Promise.resolve(['TestChar']);
      if (endpoint.includes('/crafting')) {
        return Promise.resolve([{ discipline: 'Weaponsmith', rating: 500, active: true }]);
      }
      return Promise.resolve([]);
    });

    mockGw2GetBulk.mockImplementation((endpoint: string) => {
      if (endpoint === '/recipes') {
        return Promise.resolve([
          {
            id: 12345,
            type: 'Refinement',
            output_item_id: 46735,
            output_item_count: 1,
            min_rating: 450,
            disciplines: ['Weaponsmith'],
            ingredients: [
              { item_id: 46742, count: 1 },
              { item_id: 19684, count: 3 },
            ],
          },
        ]);
      }
      if (endpoint === '/items') {
        return Promise.resolve([
          { id: 46735, name: 'Deldrimor Steel Ingot', flags: [] },
          { id: 46742, name: 'Lump of Mithrillium', flags: [] },
          { id: 19684, name: 'Mithril Ingot', flags: [] },
        ]);
      }
      return Promise.resolve([]);
    });

    // Provide materials
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
    const apiKey = JSON.stringify({
      key: 'test-key',
      permissions: [],
      validatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(apiKey);
      return Promise.resolve(null);
    });

    // Goal that needs Lump of Mithrillium
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-46735',
        value: JSON.stringify({ itemId: 46735, itemName: 'Deldrimor Steel Ingot' }),
      },
    ]);

    // User knows recipe for Deldrimor
    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/recipes') return Promise.resolve([12345]);
      if (endpoint === '/characters') return Promise.resolve(['TestChar']);
      if (endpoint.includes('/crafting')) {
        return Promise.resolve([{ discipline: 'Weaponsmith', rating: 500, active: true }]);
      }
      return Promise.resolve([]);
    });

    mockGw2GetBulk.mockImplementation((endpoint: string) => {
      if (endpoint === '/recipes') {
        return Promise.resolve([
          {
            id: 12345,
            type: 'Refinement',
            output_item_id: 46735,
            output_item_count: 1,
            min_rating: 450,
            disciplines: ['Weaponsmith'],
            ingredients: [
              { item_id: 46742, count: 1 },
              { item_id: 19684, count: 3 },
            ],
          },
        ]);
      }
      if (endpoint === '/items') {
        return Promise.resolve([
          { id: 46735, name: 'Deldrimor Steel Ingot', flags: [] },
          { id: 46742, name: 'Lump of Mithrillium', flags: [] },
          { id: 19684, name: 'Mithril Ingot', flags: [] },
        ]);
      }
      return Promise.resolve([]);
    });

    // Only 1 Lump of Mithrillium — the goal needs 1, leaving 0 for profit crafting
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
    const apiKey = JSON.stringify({
      key: 'test-key',
      permissions: [],
      validatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return Promise.resolve(apiKey);
      if (key === 'exclusionList') return Promise.resolve(JSON.stringify([46735]));
      return Promise.resolve(null);
    });
    mockGetGoals.mockResolvedValue([]);

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
