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
  it('returns empty items when no goals exist', async () => {
    mockGetGoals.mockResolvedValue([]);
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toEqual([]);
  });

  it('returns profit data for goals with cached prices', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-100',
        value: JSON.stringify({ itemId: 100, itemName: 'Test Sword' }),
      },
    ]);
    mockGetSetting.mockResolvedValue(null);
    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['100', { buyPrice: 500, sellPrice: 1000, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ]),
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].itemId).toBe(100);
    expect(json.items[0].itemName).toBe('Test Sword');
    expect(json.items[0].sellPrice).toBe(1000);
    expect(json.items[0].listingFee).toBe(50);     // ceil(1000 * 0.05)
    expect(json.items[0].exchangeFee).toBe(100);    // ceil(1000 * 0.10)
  });

  it('filters out excluded items', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-100',
        value: JSON.stringify({ itemId: 100, itemName: 'Included Item' }),
      },
      {
        goalId: 'goal-200',
        value: JSON.stringify({ itemId: 200, itemName: 'Excluded Item' }),
      },
    ]);
    mockGetSetting.mockResolvedValue(JSON.stringify([200]));
    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['100', { buyPrice: 100, sellPrice: 500, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['200', { buyPrice: 200, sellPrice: 600, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ]),
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].itemId).toBe(100);
    expect(json.items[0].itemName).toBe('Included Item');
  });

  it('sorts results by profit descending', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-100',
        value: JSON.stringify({ itemId: 100, itemName: 'Low Profit' }),
      },
      {
        goalId: 'goal-200',
        value: JSON.stringify({ itemId: 200, itemName: 'High Profit' }),
      },
    ]);
    mockGetSetting.mockResolvedValue(null);
    mockGetCachedPrices.mockResolvedValue(
      new Map([
        ['100', { buyPrice: 100, sellPrice: 200, cachedAt: '2026-01-01T00:00:00.000Z' }],
        ['200', { buyPrice: 100, sellPrice: 2000, cachedAt: '2026-01-01T00:00:00.000Z' }],
      ]),
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(2);
    // Higher profit first
    expect(json.items[0].itemName).toBe('High Profit');
    expect(json.items[1].itemName).toBe('Low Profit');
  });

  it('handles goals with no cached prices', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-100',
        value: JSON.stringify({ itemId: 100, itemName: 'No Price Item' }),
      },
    ]);
    mockGetSetting.mockResolvedValue(null);
    mockGetCachedPrices.mockResolvedValue(new Map());

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].sellPrice).toBe(0);
    expect(json.items[0].profit).toBe(0);
  });
});
