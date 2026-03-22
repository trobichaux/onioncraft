import { CircuitBreaker } from '@/lib/resilience/circuitBreaker';
import { retryWithBackoff } from '@/lib/resilience/retryWithBackoff';
import type { RetryOptions } from '@/lib/resilience/retryWithBackoff';
import { TokenBucketRateLimiter } from '@/lib/resilience/rateLimiter';

export { CircuitBreaker, CircuitOpenError } from '@/lib/resilience/circuitBreaker';
export { retryWithBackoff } from '@/lib/resilience/retryWithBackoff';
export type { RetryOptions } from '@/lib/resilience/retryWithBackoff';
export { TokenBucketRateLimiter } from '@/lib/resilience/rateLimiter';

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

/**
 * Categorise a GW2 API endpoint for circuit-breaker isolation.
 */
export function endpointCategory(endpoint: string): string {
  if (endpoint.startsWith('/commerce/prices') || endpoint.startsWith('/commerce/listings')) {
    return 'prices';
  }
  if (endpoint.startsWith('/account') || endpoint.startsWith('/characters')) {
    return 'account';
  }
  return 'general';
}

export interface Gw2ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  retryOptions?: RetryOptions;
  circuitBreaker?: CircuitBreaker;
  rateLimiter?: TokenBucketRateLimiter;
}

/**
 * GW2 API client with resilience patterns:
 * - Token-bucket rate limiter (600 req/min)
 * - Circuit Breaker (per endpoint category)
 * - Retry with exponential backoff (429/503)
 */
export class Gw2Client {
  private readonly baseUrl: string;
  private apiKey: string | undefined;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly retryOptions: RetryOptions;

  constructor(options: Gw2ClientOptions = {}) {
    this.baseUrl = options.baseUrl || GW2_API_BASE;
    this.apiKey = options.apiKey;
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
    this.rateLimiter = options.rateLimiter ?? new TokenBucketRateLimiter();
    this.retryOptions = options.retryOptions ?? {};
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  clearApiKey(): void {
    this.apiKey = undefined;
  }

  hasApiKey(): boolean {
    return this.apiKey !== undefined;
  }

  /**
   * Make an authenticated GET request to the GW2 API.
   * Pipeline: rateLimiter → circuitBreaker → retryWithBackoff → fetch.
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    await this.rateLimiter.acquire();

    const category = endpointCategory(endpoint);

    return this.circuitBreaker.execute(category, () =>
      retryWithBackoff(() => this.rawFetch<T>(endpoint, params), this.retryOptions)
    );
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

  // ---- private helpers ----

  private static readonly FETCH_TIMEOUT_MS = 15_000;

  private async rawFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    // Ensure baseUrl ends with / so relative endpoint resolution works
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
    // Strip leading / from endpoint to keep it relative to the base path
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = new URL(cleanEndpoint, base);
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

    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(Gw2Client.FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Gw2ApiError(response.status, `GW2 API error: ${response.statusText}`, endpoint);
    }

    return response.json() as Promise<T>;
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
