import { checkRateLimit, resetRateLimits, setNowFn, restoreNowFn } from '@/lib/rateLimit';

beforeEach(() => {
  resetRateLimits();
  restoreNowFn();
});

afterAll(() => {
  restoreNowFn();
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('user1');
    }
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns correct remaining count', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user1');
    }
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49); // 60 - 11
  });

  it('resets after window expires', () => {
    let now = 1_000_000;
    setNowFn(() => now);

    for (let i = 0; i < 60; i++) {
      checkRateLimit('user1');
    }
    expect(checkRateLimit('user1').allowed).toBe(false);

    // Advance past the 1-minute window
    now += 61_000;
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('tracks different users independently', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('user1');
    }
    expect(checkRateLimit('user1').allowed).toBe(false);

    const result = checkRateLimit('user2');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('respects custom maxRequests option', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user1', { maxRequests: 5 });
    }
    const result = checkRateLimit('user1', { maxRequests: 5 });
    expect(result.allowed).toBe(false);
  });

  it('respects custom windowMs option', () => {
    let now = 1_000_000;
    setNowFn(() => now);

    for (let i = 0; i < 60; i++) {
      checkRateLimit('user1', { windowMs: 5_000 });
    }
    expect(checkRateLimit('user1', { windowMs: 5_000 }).allowed).toBe(false);

    // Advance past the 5-second window
    now += 6_000;
    const result = checkRateLimit('user1', { windowMs: 5_000 });
    expect(result.allowed).toBe(true);
  });

  it('returns a resetAt timestamp in the future', () => {
    const before = Date.now();
    const result = checkRateLimit('user1');
    expect(result.resetAt).toBeGreaterThan(before);
  });
});
