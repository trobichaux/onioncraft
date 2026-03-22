/**
 * Exponential-backoff retry — only retries on 429 (rate-limited) and 503
 * (service unavailable).  All other errors propagate immediately.
 */

import { Gw2ApiError } from '@/lib/gw2Client';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  jitter?: boolean;
  delayFn?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 503]);

function isRetryable(err: unknown): boolean {
  return err instanceof Gw2ApiError && RETRYABLE_STATUS.has(err.status);
}

const realDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const jitter = options.jitter ?? false;
  const delayFn = options.delayFn ?? realDelay;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries || !isRetryable(err)) {
        throw err;
      }

      let delay = baseDelayMs * Math.pow(2, attempt);
      if (jitter) {
        delay += Math.random() * delay * 0.5;
      }
      await delayFn(delay);
    }
  }

  // Unreachable — the loop always either returns or throws.
  throw lastError;
}
