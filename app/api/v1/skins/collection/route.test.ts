import { NextRequest } from 'next/server';
import { GET } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}));

jest.mock('@/lib/auth', () => ({
  getRequestUser: () => ({ id: 'default', name: 'You' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
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

  it('returns needsRefresh when no persisted data exists', async () => {
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

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.needsRefresh).toBe(true);
  });

  it('returns persisted collection metadata when available', async () => {
    const meta = {
      total: 90000,
      ownedCount: 5000,
      lastRefreshed: '2026-03-22T12:00:00.000Z',
    };

    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') {
        return JSON.stringify({
          key: 'TEST-KEY',
          permissions: [],
          validatedAt: '2024-01-01T00:00:00.000Z',
        });
      }
      if (key === 'collectionMeta') {
        return JSON.stringify(meta);
      }
      return null;
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(90000);
    expect(json.owned).toBe(5000);
    expect(json.lastRefreshed).toBe('2026-03-22T12:00:00.000Z');
    expect(json.needsRefresh).toBe(false);
  });

  it('returns needsRefresh when persisted metadata is invalid', async () => {
    mockGetSetting.mockImplementation((_userId: string, key: string) => {
      if (key === 'apiKey') {
        return JSON.stringify({
          key: 'TEST-KEY',
          permissions: [],
          validatedAt: '2024-01-01T00:00:00.000Z',
        });
      }
      if (key === 'collectionMeta') {
        return JSON.stringify({ garbage: true });
      }
      return null;
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.needsRefresh).toBe(true);
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetSetting.mockRejectedValue(new Error('Table Storage unavailable'));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to load collection data');
  });
});
