import Fastify from "fastify";
import { Analysis } from "@contract-review/contracts";
import { readChaosConfig, registerChaos } from "@contract-review/service-kit";
import { analyses } from "./seed.js";

const PORT = Number(process.env.PORT ?? 4003);

export function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID(),
  });

  registerChaos(app, readChaosConfig());

  app.get("/health", async () => ({ status: "ok", service: "analysis" }));

  app.get("/analyses", async (req) => {
    const { contractIds } = req.query as { contractIds?: string };
    const wanted = contractIds?.split(",").filter(Boolean);

    const result = wanted
      ? analyses.filter((a) => wanted.includes(a.contractId))
      : analyses;

    return { data: result.map((a) => Analysis.parse(a)) };
  });

  /**
   * Deliberately slower than its siblings. Risk analysis is the expensive call
   * in this domain, which makes it the natural one to time out first and the
   * best demonstration of why the overview endpoint degrades instead of failing.
   */
  app.get("/analyses/:contractId", async (req, reply) => {
    const { contractId } = req.params as { contractId: string };
    const found = analyses.find((a) => a.contractId === contractId);

    if (!found) {
      return reply
        .code(404)
        .send({ error: "not_found", message: `No analysis for ${contractId}` });
    }
    return Analysis.parse(found);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
