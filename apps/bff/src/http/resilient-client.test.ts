import { describe, expect, it, vi } from "vitest";
import { ResilientClient, UpstreamError } from "./resilient-client.js";

/** Backoff sleeps are stubbed out; these tests assert ordering, not wall clock. */
const instantSleep = () => Promise.resolve();

function makeClient(fetchImpl: typeof fetch, overrides = {}) {
  return new ResilientClient({
    name: "users",
    baseUrl: "http://users",
    timeoutMs: 100,
    retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 },
    fetchImpl,
    sleepImpl: instantSleep,
    random: () => 0.5,
    ...overrides,
  });
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ResilientClient", () => {
  it("returns the parsed body on success", async () => {
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse({ data: [1, 2] })) as never);

    await expect(client.get("/users", "corr")).resolves.toEqual({ data: [1, 2] });
  });

  it("forwards the correlation id so traces span services", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await makeClient(fetchImpl as never).get("/users", "corr-99");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://users/users",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-correlation-id": "corr-99" }),
      }),
    );
  });

  it("retries a 503 and succeeds on a later attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(makeClient(fetchImpl as never).get("/users", "c")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404, because the answer will not change", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 404));

    await expect(makeClient(fetchImpl as never).get("/users/x", "c")).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429, which is transient by definition", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(makeClient(fetchImpl as never).get("/users", "c")).resolves.toEqual({ ok: true });
  });

  it("gives up after maxRetries and surfaces the last error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));

    await expect(makeClient(fetchImpl as never).get("/users", "c")).rejects.toBeInstanceOf(
      UpstreamError,
    );
    // 1 initial attempt + 2 retries
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("classifies an aborted request as a timeout, not a network error", async () => {
    const timeoutError = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);

    await expect(makeClient(fetchImpl as never).get("/users", "c")).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("opens the circuit after repeated failures and stops calling the upstream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = makeClient(fetchImpl as never, {
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      breaker: { failureThreshold: 3 },
    });

    for (let i = 0; i < 3; i++) {
      await expect(client.get("/users", "c")).rejects.toThrow();
    }
    expect(client.getCircuitState()).toBe("open");

    const callsBefore = fetchImpl.mock.calls.length;
    await expect(client.get("/users", "c")).rejects.toMatchObject({ kind: "circuit_open" });

    // The point of the breaker: no further load reaches a known-bad upstream.
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  it("counts one exhausted retry chain as a single breaker failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = makeClient(fetchImpl as never, {
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      breaker: { failureThreshold: 3 },
    });

    // One logical call — three HTTP attempts. If the breaker sat inside the
    // retry loop this alone would trip it, which is the bug this guards.
    await expect(client.get("/users", "c")).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(client.getCircuitState()).toBe("closed");
  });
});
