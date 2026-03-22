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
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest('http://localhost:3000/api/v1/settings/priority-rules', init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/settings/priority-rules', () => {
  it('returns empty array when no setting exists', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ rules: [] });
  });

  it('returns parsed rules when setting exists', async () => {
    const rules = [
      { field: 'rarity', value: 'Exotic', weight: 50 },
      { field: 'type', value: 'Weapon', weight: 30 },
    ];
    mockGetSetting.mockResolvedValue(JSON.stringify(rules));

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ rules });
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/v1/settings/priority-rules', () => {
  it('validates and stores valid rules', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const rules = [
      { field: 'rarity', value: 'Exotic', weight: 50 },
      { field: 'method', value: 'Mystic Forge', weight: 80 },
    ];
    const res = await PUT(makeRequest('PUT', rules));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mockPutSetting).toHaveBeenCalledWith(
      'default',
      'priorityRules',
      JSON.stringify(rules),
    );
  });

  it('accepts an empty array', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', []));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });

  it('rejects invalid field value', async () => {
    const rules = [{ field: 'invalid', value: 'test', weight: 50 }];
    const res = await PUT(makeRequest('PUT', rules));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects weight out of range', async () => {
    const rules = [{ field: 'rarity', value: 'Exotic', weight: 150 }];
    const res = await PUT(makeRequest('PUT', rules));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects negative weight', async () => {
    const rules = [{ field: 'rarity', value: 'Exotic', weight: -1 }];
    const res = await PUT(makeRequest('PUT', rules));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-array body', async () => {
    const res = await PUT(makeRequest('PUT', { rules: [] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects missing required fields', async () => {
    const rules = [{ field: 'rarity', weight: 50 }];
    const res = await PUT(makeRequest('PUT', rules));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});
