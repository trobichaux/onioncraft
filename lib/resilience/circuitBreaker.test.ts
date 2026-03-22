import { CircuitBreaker, CircuitOpenError, CircuitState } from './circuitBreaker';

function makeBreaker(
  opts: { failureThreshold?: number; cooldownMs?: number; now?: () => number } = {}
) {
  let clock = 0;
  const now = opts.now ?? (() => clock);
  const breaker = new CircuitBreaker({
    failureThreshold: opts.failureThreshold ?? 3,
    cooldownMs: opts.cooldownMs ?? 1000,
    now,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { breaker, advance };
}

const fail = () => Promise.reject(new Error('boom'));
const succeed = () => Promise.resolve('ok');

describe('CircuitBreaker', () => {
  it('starts in CLOSED state', () => {
    const { breaker } = makeBreaker();
    expect(breaker.getState('prices')).toBe(CircuitState.CLOSED);
  });

  it('transitions CLOSED → OPEN after N failures', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute('prices', fail)).rejects.toThrow('boom');
    }

    expect(breaker.getState('prices')).toBe(CircuitState.OPEN);
  });

  it('throws CircuitOpenError when OPEN', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 1 });
    await expect(breaker.execute('prices', fail)).rejects.toThrow('boom');

    await expect(breaker.execute('prices', succeed)).rejects.toThrow(CircuitOpenError);
  });

  it('transitions OPEN → HALF_OPEN after cooldown', async () => {
    const { breaker, advance } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute('prices', fail)).rejects.toThrow();

    expect(breaker.getState('prices')).toBe(CircuitState.OPEN);

    advance(1000);
    expect(breaker.getState('prices')).toBe(CircuitState.HALF_OPEN);
  });

  it('transitions HALF_OPEN → CLOSED on success', async () => {
    const { breaker, advance } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    advance(1000);

    await expect(breaker.execute('prices', succeed)).resolves.toBe('ok');
    expect(breaker.getState('prices')).toBe(CircuitState.CLOSED);
  });

  it('transitions HALF_OPEN → OPEN on failure', async () => {
    const { breaker, advance } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    advance(1000);

    expect(breaker.getState('prices')).toBe(CircuitState.HALF_OPEN);
    await expect(breaker.execute('prices', fail)).rejects.toThrow('boom');
    expect(breaker.getState('prices')).toBe(CircuitState.OPEN);
  });

  it('keeps categories independent', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 1 });

    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    expect(breaker.getState('prices')).toBe(CircuitState.OPEN);
    expect(breaker.getState('account')).toBe(CircuitState.CLOSED);

    await expect(breaker.execute('account', succeed)).resolves.toBe('ok');
  });

  it('resets failure count on success', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 3 });

    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    await expect(breaker.execute('prices', succeed)).resolves.toBe('ok');

    // Two more failures should not open — count was reset.
    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    await expect(breaker.execute('prices', fail)).rejects.toThrow();
    expect(breaker.getState('prices')).toBe(CircuitState.CLOSED);
  });
});
