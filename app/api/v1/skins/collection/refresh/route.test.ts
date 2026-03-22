import { NextRequest } from 'next/server';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();
const mockPutSetting = jest.fn();
const mockGetCachedSkins = jest.fn();
const mockPutCachedSkins = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  putSetting: (...args: unknown[]) => mockPutSetting(...args),
  getCachedSkins: (...args: unknown[]) => mockGetCachedSkins(...args),
  putCachedSkins: (...args: unknown[]) => mockPutCachedSkins(...args),
}));

jest.mock('@/lib/auth', () => ({
  getRequestUser: () => ({ id: 'default', name: 'You' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGw2Get = jest.fn();
const mockGw2GetBulk = jest.fn();

jest.mock('@/lib/gw2Client', () => ({
  Gw2Client: jest.fn().mockImplementation(() => ({
    get: mockGw2Get,
    getBulk: mockGw2GetBulk,
  })),
}));

jest.mock('@/data/skin-sources.json', () => ({
  lastVerified: '2026-03-22',
  skins: [{ skinId: 3, method: 'gem_store', notes: 'Test gem store skin' }],
}));

jest.mock('@/data/skin-acquisition.json', () => ({
  lastVerified: '2026-03-22',
  vendorGroups: [],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/skins/collection/refresh', {
    method: 'POST',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/skins/collection/refresh', () => {
  it('returns 400 when no API key is configured', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('API key required');
  });

  it('performs full refresh and persists owned IDs + metadata', async () => {
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') {
        return JSON.stringify({
          key: 'TEST-KEY',
          permissions: [],
          validatedAt: '2024-01-01T00:00:00.000Z',
        });
      }
      return null;
    });
    mockPutSetting.mockResolvedValue(undefined);

    // GW2 API: user owns skin 1, skins 1-3 exist
    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/skins') return Promise.resolve([1]);
      if (endpoint === '/skins') return Promise.resolve([1, 2, 3]);
      return Promise.resolve([]);
    });

    // Skin cache: skin 2 is cached, skin 3 is not
    mockGetCachedSkins.mockResolvedValue(
      new Map([
        [
          '2',
          {
            name: 'Beta',
            type: 'Weapon',
            icon: 'https://img/2.png',
            cachedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      ])
    );

    mockGw2GetBulk.mockResolvedValue([
      { id: 3, name: 'Gamma', type: 'Back', icon: 'https://img/3.png' },
    ]);

    mockPutCachedSkins.mockResolvedValue(undefined);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.owned).toBe(1);
    expect(json.unowned).toHaveLength(2);
    expect(json.lastRefreshed).toBeDefined();

    // Verify owned IDs were persisted
    expect(mockPutSetting).toHaveBeenCalledWith('default', 'ownedSkinIds', JSON.stringify([1]));

    // Verify collection metadata was persisted
    const metaCall = mockPutSetting.mock.calls.find(
      (call: unknown[]) => call[1] === 'collectionMeta'
    );
    expect(metaCall).toBeDefined();
    const meta = JSON.parse(metaCall![2] as string);
    expect(meta.total).toBe(3);
    expect(meta.ownedCount).toBe(1);
    expect(meta.lastRefreshed).toBeDefined();
  });

  it('applies priority rules when sorting unowned skins', async () => {
    const rules = [{ field: 'type', value: 'Back', weight: 90 }];

    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return JSON.stringify({ key: 'TEST-KEY' });
      if (key === 'priorityRules') return JSON.stringify(rules);
      return null;
    });
    mockPutSetting.mockResolvedValue(undefined);

    mockGw2Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/account/skins') return Promise.resolve([]);
      if (endpoint === '/skins') return Promise.resolve([1, 2]);
      return Promise.resolve([]);
    });

    mockGetCachedSkins.mockResolvedValue(
      new Map([
        [
          '1',
          {
            name: 'Alpha',
            type: 'Armor',
            icon: 'https://img/1.png',
            cachedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        [
          '2',
          {
            name: 'Beta',
            type: 'Back',
            icon: 'https://img/2.png',
            cachedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      ])
    );

    mockGw2GetBulk.mockResolvedValue([]);
    mockPutCachedSkins.mockResolvedValue(undefined);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    // Beta (Back, weight 90) should come before Alpha (Armor, weight 0)
    expect(json.unowned[0].name).toBe('Beta');
    expect(json.unowned[1].name).toBe('Alpha');
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetSetting.mockRejectedValue(new Error('Storage unavailable'));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to refresh skin collection');
  });
});
