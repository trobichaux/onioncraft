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
  return new NextRequest('http://localhost:3000/api/v1/settings/character-filter', init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/settings/character-filter', () => {
  it('returns default filter when no setting exists', async () => {
    mockGetSetting.mockResolvedValue(null);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ enabled: false, characters: [] });
  });

  it('returns stored filter when setting exists', async () => {
    const filter = { enabled: true, characters: ['Warrior Main', 'Mesmer Alt'] };
    mockGetSetting.mockResolvedValue(JSON.stringify(filter));

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(filter);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/v1/settings/character-filter', () => {
  it('validates and stores a valid filter', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const filter = { enabled: true, characters: ['My Character'] };
    const res = await PUT(makeRequest('PUT', filter));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mockPutSetting).toHaveBeenCalledWith(
      'default',
      'characterFilter',
      JSON.stringify(filter),
    );
  });

  it('accepts disabled filter with empty characters', async () => {
    mockPutSetting.mockResolvedValue(undefined);

    const filter = { enabled: false, characters: [] };
    const res = await PUT(makeRequest('PUT', filter));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });

  it('rejects missing enabled field', async () => {
    const res = await PUT(makeRequest('PUT', { characters: ['test'] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects missing characters field', async () => {
    const res = await PUT(makeRequest('PUT', { enabled: true }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-boolean enabled', async () => {
    const res = await PUT(makeRequest('PUT', { enabled: 'yes', characters: [] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-string characters', async () => {
    const res = await PUT(makeRequest('PUT', { enabled: true, characters: [123] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-object body', async () => {
    const res = await PUT(makeRequest('PUT', 'not an object'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});
