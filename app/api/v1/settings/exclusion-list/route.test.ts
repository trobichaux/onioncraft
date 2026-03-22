import { NextRequest } from 'next/server';
import { GET, PUT } from './route';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest('http://localhost:3000/api/v1/settings/exclusion-list', init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/settings/exclusion-list', () => {
  it('returns empty array when no setting exists', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ items: [] });
  });

  it('returns parsed array when setting exists', async () => {
    mockGetSetting.mockResolvedValue(JSON.stringify([101, 202, 303]));

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ items: [101, 202, 303] });
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/v1/settings/exclusion-list', () => {
  it('validates and stores a valid exclusion list', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', [1, 2, 3]));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mockPutSetting).toHaveBeenCalledWith(
      'default',
      'exclusionList',
      JSON.stringify([1, 2, 3]),
    );
  });

  it('accepts an empty array', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', []));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });

  it('rejects negative IDs', async () => {
    const res = await PUT(makeRequest('PUT', [-1, 2, 3]));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-integer IDs', async () => {
    const res = await PUT(makeRequest('PUT', [1.5, 2.7]));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects zero', async () => {
    const res = await PUT(makeRequest('PUT', [0, 1]));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-array body', async () => {
    const res = await PUT(makeRequest('PUT', { items: [1, 2] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects strings in array', async () => {
    const res = await PUT(makeRequest('PUT', ['abc', 'def']));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});
