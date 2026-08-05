import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerOptions,
} from "./circuit-breaker.js";

const options: CircuitBreakerOptions = {
  failureThreshold: 3,
  windowMs: 1_000,
  resetTimeoutMs: 5_000,
  successThreshold: 2,
};

/** Controllable clock: the breaker is time-dependent, the tests are not. */
function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const fail = () => Promise.reject(new Error("upstream exploded"));
const ok = () => Promise.resolve("value");

async function tripBreaker(breaker: CircuitBreaker, times = options.failureThreshold) {
  for (let i = 0; i < times; i++) {
    await expect(breaker.execute(fail)).rejects.toThrow("upstream exploded");
  }
}

describe("CircuitBreaker", () => {
  it("stays closed and passes results through while calls succeed", async () => {
    const breaker = new CircuitBreaker("users", options, fakeClock().now);

    await expect(breaker.execute(ok)).resolves.toBe("value");
    expect(breaker.getState()).toBe("closed");
  });

  it("opens once failures reach the threshold within the window", async () => {
    const breaker = new CircuitBreaker("users", options, fakeClock().now);

    await tripBreaker(breaker);

    expect(breaker.getState()).toBe("open");
  });

  it("rejects immediately when open, without invoking the upstream", async () => {
    const breaker = new CircuitBreaker("users", options, fakeClock().now);
    await tripBreaker(breaker);

    let invoked = false;
    const spy = async () => {
      invoked = true;
      return "value";
    };

    await expect(breaker.execute(spy)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(invoked).toBe(false);
  });

  it("does not open when failures are spread beyond the sliding window", async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker("users", options, clock.now);

    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
      clock.advance(options.windowMs + 1);
    }

    // Each failure aged out before the next arrived, so the count never
    // accumulated. A slow trickle of errors is not an outage.
    expect(breaker.getState()).toBe("closed");
  });

  it("moves to half_open after the reset timeout", async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker("users", options, clock.now);
    await tripBreaker(breaker);

    clock.advance(options.resetTimeoutMs);

    expect(breaker.getState()).toBe("half_open");
  });

  it("closes again after enough consecutive probe successes", async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker("users", options, clock.now);
    await tripBreaker(breaker);
    clock.advance(options.resetTimeoutMs);

    for (let i = 0; i < options.successThreshold; i++) {
      await expect(breaker.execute(ok)).resolves.toBe("value");
    }

    expect(breaker.getState()).toBe("closed");
  });

  it("reopens immediately when a probe fails, restarting the cooldown", async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker("users", options, clock.now);
    await tripBreaker(breaker);
    clock.advance(options.resetTimeoutMs);
    expect(breaker.getState()).toBe("half_open");

    await expect(breaker.execute(fail)).rejects.toThrow("upstream exploded");

    expect(breaker.getState()).toBe("open");
    // One failed probe must not immediately allow another.
    clock.advance(options.resetTimeoutMs - 1);
    expect(breaker.getState()).toBe("open");
  });

  it("lets only one probe through while half_open", async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker("users", options, clock.now);
    await tripBreaker(breaker);
    clock.advance(options.resetTimeoutMs);

    // A probe that never settles holds the half-open slot.
    const pending = breaker.execute(() => new Promise<string>(() => {}));

    await expect(breaker.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(pending).toBeInstanceOf(Promise);
  });

  it("reports which upstream tripped, so logs point at the culprit", async () => {
    const breaker = new CircuitBreaker("analysis", options, fakeClock().now);
    await tripBreaker(breaker);

    await expect(breaker.execute(ok)).rejects.toMatchObject({
      code: "circuit_open",
      upstream: "analysis",
    });
  });
});
