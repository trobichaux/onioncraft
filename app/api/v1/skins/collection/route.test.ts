import { NextRequest } from 'next/server';
import { GET } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();
const mockGetCachedSkins = jest.fn();
const mockPutCachedSkins = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getCachedSkins: (...args: unknown[]) => mockGetCachedSkins(...args),
  putCachedSkins: (...args: unknown[]) => mockPutCachedSkins(...args),
}));

jest.mock('@/lib/auth', () => ({
  getRequestUser: () => ({ id: 'default', name: 'You' }),
}));

const mockGw2Get = jest.fn();
const mockGw2GetBulk = jest.fn();

jest.mock('@/lib/gw2Client', () => {
  const actual = jest.requireActual('@/lib/gw2Client');
  return {
    ...actual,
    Gw2Client: jest.fn().mockImplementation(() => ({
      get: mockGw2Get,
      getBulk: mockGw2GetBulk,
    })),
  };
});

jest.mock('@/data/skin-sources.json', () => ({
  lastVerified: '2026-03-22',
  skins: [
    { skinId: 6536, method: 'gem_store', notes: 'Outfit only available in Gem Store' },
  ],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/skins/collection', {
    method: 'GET',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/skins/collection', () => {
  it('returns 400 when no API key is configured', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('API key required');
  });

  it('returns unowned skins with acquisition methods', async () => {
    // API key stored
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') {
        return JSON.stringify({ key: 'TEST-KEY', permissions: [], validatedAt: '2024-01-01T00:00:00.000Z' });
      }
      return null; // no priority rules
    });

    // GW2 API responses
    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/skins') return Promise.resolve([1]);
      if (endpoint === '/skins') return Promise.resolve([1, 2, 3]);
      // commerce/prices — return empty for simplicity
      return Promise.resolve([]);
    });

    // Skin cache — return details for skin 2, leave 3 uncached
    mockGetCachedSkins.mockResolvedValue(
      new Map([
        ['2', { name: 'Beta Skin', type: 'Weapon', icon: 'https://img/2.png', cachedAt: '2024-01-01T00:00:00.000Z' }],
      ]),
    );

    // getBulk fetches uncached skins
    mockGw2GetBulk.mockResolvedValue([
      { id: 3, name: 'Gamma Skin', type: 'Back', icon: 'https://img/3.png' },
    ]);

    mockPutCachedSkins.mockResolvedValue(undefined);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.owned).toBe(1);
    expect(json.unowned).toHaveLength(2);
    expect(json.unowned.map((s: { name: string }) => s.name).sort()).toEqual([
      'Beta Skin',
      'Gamma Skin',
    ]);
    expect(json.lastUpdated).toBeDefined();
  });

  it('applies priority rules from settings', async () => {
    const rules = [
      { field: 'type', value: 'Back', weight: 90 },
    ];

    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') {
        return JSON.stringify({ key: 'TEST-KEY', permissions: [], validatedAt: '2024-01-01T00:00:00.000Z' });
      }
      if (key === 'priorityRules') {
        return JSON.stringify(rules);
      }
      return null;
    });

    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/skins') return Promise.resolve([]);
      if (endpoint === '/skins') return Promise.resolve([1, 2]);
      return Promise.resolve([]);
    });

    mockGetCachedSkins.mockResolvedValue(
      new Map([
        ['1', { name: 'Alpha', type: 'Armor', icon: 'https://img/1.png', cachedAt: '2024-01-01T00:00:00.000Z' }],
        ['2', { name: 'Beta', type: 'Back', icon: 'https://img/2.png', cachedAt: '2024-01-01T00:00:00.000Z' }],
      ]),
    );

    mockGw2GetBulk.mockResolvedValue([]);
    mockPutCachedSkins.mockResolvedValue(undefined);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    // Beta (Back, weight 90) should come before Alpha (Armor, weight 0)
    expect(json.unowned[0].name).toBe('Beta');
    expect(json.unowned[1].name).toBe('Alpha');
  });
});
