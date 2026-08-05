import { CircuitBreaker, CircuitOpenError, type CircuitBreakerOptions } from "./circuit-breaker.js";

/**
 * The single path every outbound call takes.
 *
 * Order matters and is deliberate:
 *
 *   breaker → [ retry → timeout → fetch ]
 *
 * The breaker sits *outside* the retry loop. Inverting them is the classic
 * mistake: a breaker inside would see one logical call as N failures and trip
 * on a single flaky request, while the retries would keep hammering an upstream
 * that is already known to be down. Outside, one exhausted retry chain counts
 * as exactly one failure, and once the circuit opens the retries stop happening
 * at all.
 */

export interface RetryOptions {
  /** Attempts *after* the first. 2 means up to 3 calls total. */
  maxRetries: number;
  /** Delay before the first retry; doubles each attempt. */
  baseDelayMs: number;
  /** Ceiling for the backoff, so a long chain cannot stall a request. */
  maxDelayMs: number;
}

export interface ResilientClientOptions {
  name: string;
  baseUrl: string;
  /** Per-attempt budget, not for the whole chain. */
  timeoutMs: number;
  retry: RetryOptions;
  breaker?: Partial<CircuitBreakerOptions>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  random?: () => number;
}

export class UpstreamError extends Error {
  constructor(
    readonly upstream: string,
    readonly kind: "timeout" | "network" | "http" | "circuit_open",
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? `${upstream}: ${kind}${status ? ` ${status}` : ""}`);
    this.name = "UpstreamError";
  }
}

/** 4xx means we asked wrong; repeating the same question gets the same answer. */
function isRetryable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ResilientClient {
  private readonly breaker: CircuitBreaker;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly options: ResilientClientOptions) {
    this.breaker = new CircuitBreaker(options.name, {
      failureThreshold: 5,
      windowMs: 10_000,
      resetTimeoutMs: 15_000,
      successThreshold: 2,
      ...options.breaker,
    });
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleepImpl ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  getCircuitState() {
    return this.breaker.getState();
  }

  /**
   * @param path       path relative to baseUrl, e.g. `/users?ids=a,b`
   * @param correlationId forwarded so one id spans client → BFF → upstream logs
   */
  async get<T>(path: string, correlationId: string): Promise<T> {
    try {
      return await this.breaker.execute(() => this.withRetries<T>(path, correlationId));
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        throw new UpstreamError(this.options.name, "circuit_open", undefined, error.message);
      }
      throw error;
    }
  }

  private async withRetries<T>(path: string, correlationId: string): Promise<T> {
    const { maxRetries } = this.options.retry;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.attempt<T>(path, correlationId);
      } catch (error) {
        lastError = error;

        const retryable =
          error instanceof UpstreamError &&
          (error.kind === "timeout" ||
            error.kind === "network" ||
            (error.kind === "http" && isRetryable(error.status ?? 0)));

        if (!retryable || attempt === maxRetries) throw error;

        await this.sleep(this.backoffFor(attempt));
      }
    }

    throw lastError;
  }

  /**
   * Exponential backoff with full jitter.
   *
   * Without jitter, every caller that failed at the same instant retries at the
   * same instant — the retry storm lands as one synchronised wave and knocks
   * the recovering upstream straight back over. Randomising across the whole
   * window spreads the load flat.
   */
  private backoffFor(attempt: number): number {
    const { baseDelayMs, maxDelayMs } = this.options.retry;
    const ceiling = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
    return Math.floor(this.random() * ceiling);
  }

  private async attempt<T>(path: string, correlationId: string): Promise<T> {
    const url = `${this.options.baseUrl}${path}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.options.timeoutMs),
        headers: {
          accept: "application/json",
          "x-correlation-id": correlationId,
        },
      });
    } catch (error) {
      // AbortSignal.timeout rejects with a TimeoutError; everything else here
      // is DNS, connection refused, socket reset and friends.
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      throw new UpstreamError(
        this.options.name,
        isTimeout ? "timeout" : "network",
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      throw new UpstreamError(this.options.name, "http", response.status);
    }

    return (await response.json()) as T;
  }
}
