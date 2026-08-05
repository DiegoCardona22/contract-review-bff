import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Fault injection for the fake upstreams.
 *
 * Resilience patterns are only credible if you can watch them work. Every
 * upstream reads these env vars, so a reviewer can make `users` time out and
 * see the BFF return a degraded overview instead of a 500:
 *
 *   CHAOS_LATENCY_MS=3000 docker compose up users
 *
 * Defaults are all off, so a plain `docker compose up` behaves normally.
 */
export interface ChaosConfig {
  /** Artificial delay added to every response, in ms. */
  latencyMs: number;
  /** Probability (0–1) that a request fails with a 503. */
  failureRate: number;
  /** When true, every request fails. Simulates a hard outage. */
  down: boolean;
}

export function readChaosConfig(env: NodeJS.ProcessEnv = process.env): ChaosConfig {
  return {
    latencyMs: Number(env.CHAOS_LATENCY_MS ?? 0),
    failureRate: Number(env.CHAOS_FAILURE_RATE ?? 0),
    down: env.CHAOS_DOWN === "true",
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function registerChaos(app: FastifyInstance, config: ChaosConfig): void {
  if (config.latencyMs === 0 && config.failureRate === 0 && !config.down) return;

  app.log.warn({ chaos: config }, "fault injection enabled — not a production default");

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Health checks stay honest so the container orchestrator is not misled
    // into cycling a service that is behaving exactly as instructed.
    if (req.url === "/health") return;

    if (config.latencyMs > 0) await sleep(config.latencyMs);

    if (config.down || Math.random() < config.failureRate) {
      return reply.code(503).send({
        error: "service_unavailable",
        message: "Injected failure (CHAOS_* env vars are set)",
      });
    }
  });
}
