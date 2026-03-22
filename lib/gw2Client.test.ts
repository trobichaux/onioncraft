import { Gw2Client, Gw2ApiError, REQUIRED_PERMISSIONS } from './gw2Client';

describe('Gw2Client', () => {
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
    // No error thrown means success
    expect(client).toBeDefined();
  });

  it('returns empty array for getBulk with no IDs', async () => {
    const client = new Gw2Client();
    const results = await client.getBulk('/items', []);
    expect(results).toEqual([]);
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
