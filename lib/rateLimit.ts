export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp ms
}

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 60_000;

let nowFn: () => number = () => Date.now();

/** Override the clock source (for testing). */
export function setNowFn(fn: () => number): void {
  nowFn = fn;
}

/** Reset the clock source to real time. */
export function restoreNowFn(): void {
  nowFn = () => Date.now();
}

/** Clear all rate-limit state (for testing). */
export function resetRateLimits(): void {
  store.clear();
}

/**
 * Simple sliding-window rate limiter.
 * Default: 60 requests per minute per user.
 *
 * **Known limitation (serverless):** This rate limiter uses an in-memory Map.
 * In Azure SWA / Azure Functions Consumption plan:
 * - Each cold start creates a fresh, empty store.
 * - Concurrent function instances don't share state.
 * - Rate limits reset on every instance recycle.
 *
 * For production hardening, consider Azure Table Storage-backed rate limiting
 * or Azure API Management rate-limit policies. For a personal-use app,
 * the in-memory approach provides best-effort protection against accidental
 * abuse while keeping costs at zero.
 */
export function checkRateLimit(
  userId: string,
  options?: { maxRequests?: number; windowMs?: number }
): RateLimitResult {
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = nowFn();
  const windowStart = now - windowMs;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const resetAt = now + windowMs;

  if (entry.timestamps.length >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetAt,
  };
}

// Periodic cleanup of expired entries
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = nowFn();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > now - DEFAULT_WINDOW_MS);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is still running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

startCleanup();
