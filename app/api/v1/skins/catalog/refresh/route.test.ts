import { NextRequest } from 'next/server';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();
const mockPutCachedSkins = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/skins/catalog/refresh', {
    method: 'POST',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/skins/catalog/refresh', () => {
  it('returns 400 when no API key is configured', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('API key required');
  });

  it('refreshes and caches all skins', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({ key: 'TEST-KEY', permissions: [], validatedAt: '2024-01-01T00:00:00.000Z' })
    );

    mockGw2Get.mockResolvedValue([1, 2, 3]);
    mockGw2GetBulk.mockResolvedValue([
      { id: 1, name: 'Skin A', type: 'Armor', icon: 'https://img/a.png' },
      { id: 2, name: 'Skin B', type: 'Weapon', icon: 'https://img/b.png' },
      { id: 3, name: 'Skin C', type: 'Back', icon: 'https://img/c.png' },
    ]);
    mockPutCachedSkins.mockResolvedValue(undefined);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.refreshed).toBe(3);
    expect(json.cachedAt).toBeDefined();

    // Verify putCachedSkins was called with correct data
    expect(mockPutCachedSkins).toHaveBeenCalledTimes(1);
    const cached = mockPutCachedSkins.mock.calls[0][0];
    expect(cached).toHaveLength(3);
    expect(cached[0].skinId).toBe('1');
    expect(cached[0].name).toBe('Skin A');
  });
});
