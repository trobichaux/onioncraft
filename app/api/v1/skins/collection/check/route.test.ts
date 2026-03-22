import { NextRequest } from 'next/server';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();
const mockPutSetting = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  putSetting: (...args: unknown[]) => mockPutSetting(...args),
}));

jest.mock('@/lib/auth', () => ({
  getRequestUser: () => ({ id: 'default', name: 'You' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGw2Get = jest.fn();

jest.mock('@/lib/gw2Client', () => ({
  Gw2Client: jest.fn().mockImplementation(() => ({
    get: mockGw2Get,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/skins/collection/check', {
    method: 'POST',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/skins/collection/check', () => {
  it('returns 400 when no API key is configured', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('API key required');
  });

  it('returns changed=false when counts match', async () => {
    const meta = { total: 90000, ownedCount: 5000, lastRefreshed: '2026-03-22T12:00:00.000Z' };

    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return JSON.stringify({ key: 'TEST-KEY' });
      if (key === 'collectionMeta') return JSON.stringify(meta);
      return null;
    });

    mockGw2Get.mockResolvedValue(Array.from({ length: 5000 }, (_, i) => i + 1));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(false);
    expect(json.currentCount).toBe(5000);
    expect(json.previousCount).toBe(5000);
  });

  it('returns changed=true when counts differ', async () => {
    const meta = { total: 90000, ownedCount: 5000, lastRefreshed: '2026-03-22T12:00:00.000Z' };

    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return JSON.stringify({ key: 'TEST-KEY' });
      if (key === 'collectionMeta') return JSON.stringify(meta);
      return null;
    });

    // User unlocked 3 new skins
    mockGw2Get.mockResolvedValue(Array.from({ length: 5003 }, (_, i) => i + 1));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(true);
    expect(json.currentCount).toBe(5003);
    expect(json.previousCount).toBe(5000);
  });

  it('returns changed=true when no persisted data exists', async () => {
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') return JSON.stringify({ key: 'TEST-KEY' });
      return null;
    });

    mockGw2Get.mockResolvedValue([1, 2, 3]);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(true);
    expect(json.currentCount).toBe(3);
    expect(json.previousCount).toBe(0);
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetSetting.mockRejectedValue(new Error('Storage unavailable'));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to check for collection changes');
  });
});
