import {
  Gw2Client,
  Gw2ApiError,
  REQUIRED_PERMISSIONS,
  endpointCategory,
  CircuitBreaker,
  TokenBucketRateLimiter,
} from './gw2Client';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mockFetchOk(data: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function mockFetchFail(status: number, statusText: string) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
  } as unknown as Response);
}

function makeClient() {
  const rateLimiter = new TokenBucketRateLimiter({ capacity: 100 });
  const circuitBreaker = new CircuitBreaker({ failureThreshold: 3 });
  return new Gw2Client({
    baseUrl: 'https://api.guildwars2.com/v2',
    rateLimiter,
    circuitBreaker,
    retryOptions: { delayFn: () => Promise.resolve() },
  });
}

/* ------------------------------------------------------------------ */
/*  Original tests                                                     */
/* ------------------------------------------------------------------ */

describe('Gw2Client', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('constructs with default base URL', () => {
    const client = new Gw2Client();
    expect(client).toBeDefined();
  });

  it('constructs with custom base URL', () => {
    const client = new Gw2Client({ baseUrl: 'https://custom.api/v2' });
    expect(client).toBeDefined();
  });

  it('sets and clears API key', () => {
    const client = new Gw2Client();
    client.setApiKey('test-key');
    client.clearApiKey();
    expect(client).toBeDefined();
  });

  it('returns empty array for getBulk with no IDs', async () => {
    const client = new Gw2Client();
    const results = await client.getBulk('/items', []);
    expect(results).toEqual([]);
  });

  it('hasApiKey returns correct state', () => {
    const client = new Gw2Client();
    expect(client.hasApiKey()).toBe(false);
    client.setApiKey('key');
    expect(client.hasApiKey()).toBe(true);
    client.clearApiKey();
    expect(client.hasApiKey()).toBe(false);
  });

  it('get() returns data on successful fetch', async () => {
    global.fetch = mockFetchOk({ id: 1, name: 'Sword' });
    const client = makeClient();
    const result = await client.get<{ id: number; name: string }>('/items');
    expect(result).toEqual({ id: 1, name: 'Sword' });
  });

  it('get() retries on 429 and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    global.fetch = fn as unknown as typeof fetch;

    const client = makeClient();
    const result = await client.get<{ id: number }>('/items');
    expect(result).toEqual({ id: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('get() opens circuit after consecutive failures', async () => {
    global.fetch = mockFetchFail(500, 'Internal Server Error');

    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const client = new Gw2Client({
      baseUrl: 'https://api.guildwars2.com/v2',
      circuitBreaker: breaker,
      rateLimiter: new TokenBucketRateLimiter({ capacity: 100 }),
      retryOptions: { maxRetries: 0 },
    });

    await expect(client.get('/items')).rejects.toThrow();
    await expect(client.get('/items')).rejects.toThrow();

    // Third call should be circuit-open.
    await expect(client.get('/items')).rejects.toThrow('Circuit open');
  });
});

describe('Gw2ApiError', () => {
  it('includes status and endpoint', () => {
    const error = new Gw2ApiError(429, 'Too Many Requests', '/v2/items');
    expect(error.status).toBe(429);
    expect(error.endpoint).toBe('/v2/items');
    expect(error.name).toBe('Gw2ApiError');
    expect(error.message).toBe('Too Many Requests');
  });
});

describe('REQUIRED_PERMISSIONS', () => {
  it('includes all 5 required GW2 API key permissions', () => {
    expect(REQUIRED_PERMISSIONS).toContain('account');
    expect(REQUIRED_PERMISSIONS).toContain('inventories');
    expect(REQUIRED_PERMISSIONS).toContain('wallet');
    expect(REQUIRED_PERMISSIONS).toContain('unlocks');
    expect(REQUIRED_PERMISSIONS).toContain('characters');
    expect(REQUIRED_PERMISSIONS).toHaveLength(5);
  });
});

describe('endpointCategory', () => {
  it('maps /commerce/prices to "prices"', () => {
    expect(endpointCategory('/commerce/prices')).toBe('prices');
  });

  it('maps /commerce/listings to "prices"', () => {
    expect(endpointCategory('/commerce/listings')).toBe('prices');
  });

  it('maps /account/... to "account"', () => {
    expect(endpointCategory('/account/wallet')).toBe('account');
  });

  it('maps /characters/... to "account"', () => {
    expect(endpointCategory('/characters/My%20Char')).toBe('account');
  });

  it('maps unknown endpoints to "general"', () => {
    expect(endpointCategory('/items')).toBe('general');
    expect(endpointCategory('/skills')).toBe('general');
  });
});
