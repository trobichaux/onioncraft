/**
 * Circuit Breaker pattern — tracks failures per category and short-circuits
 * requests when a backend is unhealthy.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED (or back to OPEN).
 */

export class CircuitOpenError extends Error {
  constructor(public readonly category: string) {
    super(`Circuit open for category "${category}"`);
    this.name = 'CircuitOpenError';
  }
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CategoryState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly categories = new Map<string, CategoryState>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  getState(category: string): CircuitState {
    const cat = this.categories.get(category);
    if (!cat) return CircuitState.CLOSED;

    if (cat.state === CircuitState.OPEN) {
      if (this.now() - cat.lastFailureTime >= this.cooldownMs) {
        cat.state = CircuitState.HALF_OPEN;
      }
    }
    return cat.state;
  }

  async execute<T>(category: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(category);

    if (state === CircuitState.OPEN) {
      throw new CircuitOpenError(category);
    }

    try {
      const result = await fn();
      this.onSuccess(category);
      return result;
    } catch (err) {
      this.onFailure(category);
      throw err;
    }
  }

  private getOrCreate(category: string): CategoryState {
    let cat = this.categories.get(category);
    if (!cat) {
      cat = { state: CircuitState.CLOSED, failures: 0, lastFailureTime: 0 };
      this.categories.set(category, cat);
    }
    return cat;
  }

  private onSuccess(category: string): void {
    const cat = this.getOrCreate(category);
    cat.failures = 0;
    cat.state = CircuitState.CLOSED;
  }

  private onFailure(category: string): void {
    const cat = this.getOrCreate(category);
    cat.failures += 1;
    cat.lastFailureTime = this.now();

    if (cat.state === CircuitState.HALF_OPEN) {
      cat.state = CircuitState.OPEN;
    } else if (cat.failures >= this.failureThreshold) {
      cat.state = CircuitState.OPEN;
    }
  }
}
