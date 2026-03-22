/**
 * Token-bucket rate limiter.
 *
 * Defaults: 600 tokens capacity, refilled at 10 tokens/second.
 */

export interface TokenBucketOptions {
  capacity?: number;
  refillRate?: number; // tokens per second
  now?: () => number;
}

export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly now: () => number;

  private tokens: number;
  private lastRefill: number;

  /** Waiters queued when bucket is empty. */
  private waiters: Array<() => void> = [];

  constructor(options: TokenBucketOptions = {}) {
    this.capacity = options.capacity ?? 600;
    this.refillRate = options.refillRate ?? 10;
    this.now = options.now ?? (() => Date.now());
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /** Refill tokens based on elapsed time. */
  private refill(): void {
    const currentTime = this.now();
    const elapsed = (currentTime - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    if (newTokens > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = currentTime;
    }
  }

  /** Non-blocking: returns true if a token was consumed, false otherwise. */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Blocking: resolves when a token is available. */
  async acquire(): Promise<void> {
    if (this.tryAcquire()) return;

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Drain waiting callers if tokens are now available.
   * Call this after advancing time in tests.
   */
  drainWaiters(): void {
    this.refill();
    while (this.waiters.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const next = this.waiters.shift();
      next?.();
    }
  }
}
