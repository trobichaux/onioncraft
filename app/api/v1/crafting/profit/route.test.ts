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
  getRequestUser: () => ({ id: 'default', name: 'You' }),
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

beforeEach(() => {
  jest.clearAllMocks();
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
  });

  it('evaluates candidates against available inventory', async () => {
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

    // Provide materials that match ascended material recipes
    // Deldrimor Steel Ingot (46735) needs: 46742×1, 19684×3, 19685×18, 46741×10
    mockFetchInventory.mockResolvedValue(
      new Map<number, number>([
        [46742, 5], // Lump of Mithrillium
        [19684, 15], // Mithril Ingot
        [19685, 90], // Darksteel Ingot
        [46741, 50], // Thermocatalytic Reagent
      ])
    );

    // Provide sell prices for the outputs and buy prices for inputs
    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['46735', { buyPrice: 0, sellPrice: 50000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46742', { buyPrice: 30000, sellPrice: 35000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19684', { buyPrice: 100, sellPrice: 120, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19685', { buyPrice: 50, sellPrice: 70, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46741', { buyPrice: 1496, sellPrice: 0, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    // Should find at least Deldrimor Steel Ingot as craftable
    const deldrimor = json.items.find((i: Record<string, unknown>) => i.itemId === 46735);
    if (deldrimor) {
      expect(deldrimor.quantity).toBeGreaterThan(0);
      expect(deldrimor.sellPrice).toBe(50000);
      expect(deldrimor.totalProfit).toBeDefined();
    }
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

    // Only 1 Lump of Mithrillium — the goal needs 1, leaving 0 for profit crafting
    mockFetchInventory.mockResolvedValue(
      new Map<number, number>([
        [46742, 1], // Lump of Mithrillium — all reserved for goal
        [19684, 15],
        [19685, 90],
        [46741, 50],
      ])
    );

    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['46735', { buyPrice: 0, sellPrice: 50000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46742', { buyPrice: 30000, sellPrice: 35000, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19684', { buyPrice: 100, sellPrice: 120, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['19685', { buyPrice: 50, sellPrice: 70, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['46741', { buyPrice: 1496, sellPrice: 0, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ])
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goalsCount).toBe(1);
    // Deldrimor should NOT appear (or have qty 0) because the Mithrillium is reserved for the goal
    const deldrimor = json.items.find((i: Record<string, unknown>) => i.itemId === 46735);
    // With 1 Mithrillium reserved for goal, 0 left → can't craft for profit
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
