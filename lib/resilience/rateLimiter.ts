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

const DEFAULT_DRAIN_INTERVAL_MS = 100;

export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly now: () => number;

  private tokens: number;
  private lastRefill: number;

  /** Waiters queued when bucket is empty. */
  private waiters: Array<() => void> = [];

  private drainTimer: ReturnType<typeof setInterval> | null = null;

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

  /**
   * Blocking: resolves when a token is available.
   * Times out after timeoutMs to prevent hanging requests (M2 fix).
   * Automatically starts a drain timer to refill and service waiters.
   */
  async acquire(timeoutMs = 10_000): Promise<void> {
    if (this.tryAcquire()) return;

    this.startDrainTimer();

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = this.waiters.indexOf(waiterResolve);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('Rate limiter timeout — too many concurrent requests'));
      }, timeoutMs);

      const waiterResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      this.waiters.push(waiterResolve);
    });
  }

  /** Start a periodic timer that refills tokens and drains waiters. */
  private startDrainTimer(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      this.drainWaiters();
      if (this.waiters.length === 0 && this.drainTimer) {
        clearInterval(this.drainTimer);
        this.drainTimer = null;
      }
    }, DEFAULT_DRAIN_INTERVAL_MS);
    if (this.drainTimer && typeof this.drainTimer === 'object' && 'unref' in this.drainTimer) {
      this.drainTimer.unref();
    }
  }

  /**
   * Drain waiting callers if tokens are now available.
   * Also callable in tests after advancing time.
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
