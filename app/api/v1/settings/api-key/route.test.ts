import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSetting = jest.fn();
const mockPutSetting = jest.fn();
const mockDeleteSetting = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  putSetting: (...args: unknown[]) => mockPutSetting(...args),
  deleteSetting: (...args: unknown[]) => mockDeleteSetting(...args),
}));

jest.mock('@/lib/auth', () => ({
  requireUser: () => ({ id: 'default', name: 'You' }),
  isUser: () => true,
}));

const mockGw2Get = jest.fn();

jest.mock('@/lib/gw2Client', () => {
  const actual = jest.requireActual('@/lib/gw2Client');
  return {
    ...actual,
    Gw2Client: jest.fn().mockImplementation(() => ({
      get: mockGw2Get,
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: object): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest('http://localhost:3000/api/v1/settings/api-key', init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/v1/settings/api-key', () => {
  it('validates and stores a valid API key', async () => {
    mockGw2Get.mockResolvedValue({
      id: 'token-id',
      name: 'test-key',
      permissions: ['account', 'inventories', 'wallet', 'unlocks', 'characters'],
    });
    mockPutSetting.mockResolvedValue(undefined);

    const res = await POST(makeRequest('POST', { key: 'ABCD-1234' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.permissions).toEqual(
      expect.arrayContaining(['account', 'inventories', 'wallet', 'unlocks', 'characters'])
    );
    // Key must NOT be returned
    expect(json.key).toBeUndefined();

    // Verify stored value
    expect(mockPutSetting).toHaveBeenCalledWith('default', 'apiKey', expect.any(String));
    const storedValue = JSON.parse(mockPutSetting.mock.calls[0][2]);
    expect(storedValue.key).toBe('ABCD-1234');
    expect(storedValue.permissions).toEqual(
      expect.arrayContaining(['account', 'inventories', 'wallet', 'unlocks', 'characters'])
    );
    expect(storedValue.validatedAt).toBeDefined();
  });

  it('returns 400 for invalid API key (401 from GW2)', async () => {
    const { Gw2ApiError } = jest.requireActual('@/lib/gw2Client');
    mockGw2Get.mockRejectedValue(new Gw2ApiError(401, 'Unauthorized', '/tokeninfo'));

    const res = await POST(makeRequest('POST', { key: 'bad-key' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid API key');
  });

  it('returns 400 for invalid API key (403 from GW2)', async () => {
    const { Gw2ApiError } = jest.requireActual('@/lib/gw2Client');
    mockGw2Get.mockRejectedValue(new Gw2ApiError(403, 'Forbidden', '/tokeninfo'));

    const res = await POST(makeRequest('POST', { key: 'bad-key' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid API key');
  });

  it('returns 400 when permissions are missing', async () => {
    mockGw2Get.mockResolvedValue({
      id: 'token-id',
      name: 'limited-key',
      permissions: ['account', 'wallet'],
    });

    const res = await POST(makeRequest('POST', { key: 'limited-key' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Missing permissions');
    expect(json.missingPermissions).toEqual(
      expect.arrayContaining(['inventories', 'unlocks', 'characters'])
    );
  });

  it('returns 400 when key is empty', async () => {
    const res = await POST(makeRequest('POST', { key: '' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when body is missing key field', async () => {
    const res = await POST(makeRequest('POST', {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 500 when GW2 API has unexpected error', async () => {
    mockGw2Get.mockRejectedValue(new Error('Network error'));

    const res = await POST(makeRequest('POST', { key: 'some-key' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to validate API key');
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/settings/api-key', () => {
  it('returns hasKey: false when no key is stored', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ hasKey: false });
  });

  it('returns key status without the key value', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({
        key: 'SECRET-KEY',
        permissions: ['account', 'inventories', 'wallet', 'unlocks', 'characters'],
        validatedAt: '2024-01-01T00:00:00.000Z',
      })
    );

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hasKey).toBe(true);
    expect(json.permissions).toEqual(['account', 'inventories', 'wallet', 'unlocks', 'characters']);
    expect(json.validatedAt).toBe('2024-01-01T00:00:00.000Z');
    // Key must NOT be returned
    expect(json.key).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('SECRET-KEY');
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/settings/api-key', () => {
  it('deletes the API key and returns success', async () => {
    mockDeleteSetting.mockResolvedValue(undefined);

    const res = await DELETE(makeRequest('DELETE'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mockDeleteSetting).toHaveBeenCalledWith('default', 'apiKey');
  });
});
