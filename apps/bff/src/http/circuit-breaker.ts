/**
 * A circuit breaker per upstream.
 *
 * The problem it solves: when `analysis` goes down, every incoming request
 * still pays the full timeout waiting for it. Under load those waits pile up,
 * exhaust the BFF's own connection pool, and an outage in one upstream takes
 * the whole BFF with it. The breaker makes failure cheap — once an upstream is
 * known bad, calls fail immediately instead of hanging.
 *
 * States:
 *   closed    → traffic flows; failures are counted in a sliding window
 *   open      → calls rejected immediately; after `resetTimeoutMs`, try again
 *   half_open → a single probe is allowed through; it decides the next state
 *
 * The half-open state matters: without it, recovery is a thundering herd —
 * every waiting request hits a just-recovered upstream at once and knocks it
 * back down.
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Failures within the window before the circuit opens. */
  failureThreshold: number;
  /** Sliding window for counting failures, in ms. */
  windowMs: number;
  /** How long to stay open before allowing a probe, in ms. */
  resetTimeoutMs: number;
  /** Consecutive probe successes needed to close again. */
  successThreshold: number;
}

export const DEFAULT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  windowMs: 10_000,
  resetTimeoutMs: 15_000,
  successThreshold: 2,
};

export class CircuitOpenError extends Error {
  readonly code = "circuit_open";
  constructor(readonly upstream: string, readonly retryAfterMs: number) {
    super(`Circuit for "${upstream}" is open; retry in ${retryAfterMs}ms`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  /** Timestamps of recent failures, pruned to the sliding window. */
  private failures: number[] = [];
  private consecutiveProbeSuccesses = 0;
  private openedAt = 0;
  /** Set while a half-open probe is in flight, so only one gets through. */
  private probeInFlight = false;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = DEFAULT_BREAKER_OPTIONS,
    /** Injectable clock keeps tests deterministic — no sleeping in unit tests. */
    private readonly now: () => number = Date.now,
  ) {}

  getState(): CircuitState {
    // Reading the state also advances open → half_open when the cooldown has
    // elapsed, so callers never observe a stale "open".
    if (this.state === "open" && this.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.state = "half_open";
      this.consecutiveProbeSuccesses = 0;
      this.probeInFlight = false;
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === "open") {
      throw new CircuitOpenError(
        this.name,
        this.options.resetTimeoutMs - (this.now() - this.openedAt),
      );
    }

    if (state === "half_open") {
      if (this.probeInFlight) {
        // Another request is already probing. Rejecting here rather than
        // queueing keeps the recovery path to exactly one in-flight call.
        throw new CircuitOpenError(this.name, 0);
      }
      this.probeInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      this.probeInFlight = false;
      this.consecutiveProbeSuccesses += 1;

      if (this.consecutiveProbeSuccesses >= this.options.successThreshold) {
        this.state = "closed";
        this.failures = [];
        this.consecutiveProbeSuccesses = 0;
      }
      return;
    }
    // A success in the closed state is evidence the upstream is healthy, but
    // it does not erase the window — a flapping upstream should still trip.
    this.pruneFailures();
  }

  private onFailure(): void {
    const now = this.now();

    if (this.state === "half_open") {
      // The probe failed: straight back to open, cooldown restarts.
      this.trip(now);
      return;
    }

    this.failures.push(now);
    this.pruneFailures();

    if (this.failures.length >= this.options.failureThreshold) {
      this.trip(now);
    }
  }

  private trip(now: number): void {
    this.state = "open";
    this.openedAt = now;
    this.failures = [];
    this.consecutiveProbeSuccesses = 0;
    this.probeInFlight = false;
  }

  private pruneFailures(): void {
    const cutoff = this.now() - this.options.windowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
