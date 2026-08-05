import Fastify from "fastify";
import { Contract } from "@contract-review/contracts";
import { readChaosConfig, registerChaos } from "@contract-review/service-kit";
import { contracts } from "./seed.js";

const PORT = Number(process.env.PORT ?? 4001);

export function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // The BFF stamps every outbound call with a correlation id. Reusing it as
    // the Fastify request id means one trace spans client → BFF → upstream.
    genReqId: (req) => (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID(),
  });

  registerChaos(app, readChaosConfig());

  app.get("/health", async () => ({ status: "ok", service: "documents" }));

  app.get("/contracts", async (req) => {
    const { ids } = req.query as { ids?: string };

    // Batch endpoint. The BFF needs it to avoid N+1 when hydrating a list —
    // one call for many ids instead of one call per row.
    const result = ids
      ? contracts.filter((c) => ids.split(",").includes(c.id))
      : contracts;

    return { data: result.map((c) => Contract.parse(c)) };
  });

  app.get("/contracts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = contracts.find((c) => c.id === id);

    if (!found) {
      return reply.code(404).send({ error: "not_found", message: `No contract ${id}` });
    }
    return Contract.parse(found);
  });

  return app;
}

// Only listen when run directly, so tests can import buildServer() and use
// app.inject() without binding a port.
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
