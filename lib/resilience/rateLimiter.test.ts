import { TokenBucketRateLimiter } from './rateLimiter';

describe('TokenBucketRateLimiter', () => {
  it('acquire succeeds when tokens are available', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 5 });
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it('tryAcquire returns false when bucket is empty', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, now: () => 0 });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('refills tokens over time', () => {
    let clock = 0;
    const limiter = new TokenBucketRateLimiter({
      capacity: 10,
      refillRate: 10,
      now: () => clock,
    });

    // Drain all tokens.
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryAcquire()).toBe(true);
    }
    expect(limiter.tryAcquire()).toBe(false);

    // Advance 500ms → 5 tokens refilled.
    clock += 500;
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('resolves waiting acquires when tokens refill', async () => {
    let clock = 0;
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillRate: 10,
      now: () => clock,
    });

    limiter.tryAcquire(); // empty the bucket

    let resolved = false;
    const waiting = limiter.acquire().then(() => {
      resolved = true;
    });

    // Still empty.
    expect(resolved).toBe(false);

    // Advance time and drain waiters.
    clock += 200;
    limiter.drainWaiters();

    await waiting;
    expect(resolved).toBe(true);
  });

  it('handles concurrent acquires', async () => {
    let clock = 0;
    const limiter = new TokenBucketRateLimiter({
      capacity: 2,
      refillRate: 10,
      now: () => clock,
    });

    // Drain bucket.
    limiter.tryAcquire();
    limiter.tryAcquire();

    const results: number[] = [];
    const p1 = limiter.acquire().then(() => results.push(1));
    const p2 = limiter.acquire().then(() => results.push(2));

    // Advance 1 second → 10 tokens.
    clock += 1000;
    limiter.drainWaiters();

    await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
  });
});
