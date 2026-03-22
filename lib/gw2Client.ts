const GW2_API_BASE = process.env.GW2_API_BASE_URL || 'https://api.guildwars2.com/v2';

/** Required API key permissions for OnionCraft functionality. */
export const REQUIRED_PERMISSIONS = [
  'account',
  'inventories',
  'wallet',
  'unlocks',
  'characters',
] as const;

/** Maximum IDs per batch request to GW2 bulk endpoints. */
const BATCH_SIZE = 200;

/** Maximum concurrent requests to GW2 API. */
const MAX_CONCURRENT = 5;

export interface Gw2ClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Low-level GW2 API client skeleton.
 *
 * Phase 1 will add resilience patterns:
 * - Circuit Breaker (per endpoint category)
 * - Retry with exponential backoff (429/503)
 * - Token bucket rate limiter (600 req/min)
 * - Bulkhead (separate pools for price vs. account queries)
 */
export class Gw2Client {
  private readonly baseUrl: string;
  private apiKey: string | undefined;

  constructor(options: Gw2ClientOptions = {}) {
    this.baseUrl = options.baseUrl || GW2_API_BASE;
    this.apiKey = options.apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  clearApiKey(): void {
    this.apiKey = undefined;
  }

  /**
   * Make an authenticated GET request to the GW2 API.
   * Throws if the request fails (resilience layer added in Phase 1).
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Gw2ApiError(response.status, `GW2 API error: ${response.statusText}`, endpoint);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch items in batches of 200 IDs from a bulk endpoint.
   * Returns a flat array of all results.
   */
  async getBulk<T>(endpoint: string, ids: number[]): Promise<T[]> {
    if (ids.length === 0) return [];

    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    const results: T[] = [];

    // Process in chunks of MAX_CONCURRENT
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
      const chunk = batches.slice(i, i + MAX_CONCURRENT);
      const chunkResults = await Promise.all(
        chunk.map((batch) => this.get<T[]>(endpoint, { ids: batch.join(',') }))
      );
      for (const r of chunkResults) {
        results.push(...r);
      }
    }

    return results;
  }
}

export class Gw2ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = 'Gw2ApiError';
  }
}
