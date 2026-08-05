import Fastify from "fastify";
import { User } from "@contract-review/contracts";
import { readChaosConfig, registerChaos } from "@contract-review/service-kit";
import { users } from "./seed.js";

const PORT = Number(process.env.PORT ?? 4002);

export function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID(),
  });

  registerChaos(app, readChaosConfig());

  app.get("/health", async () => ({ status: "ok", service: "users" }));

  /**
   * Batch lookup. Without this the BFF would issue one request per contract
   * owner when rendering a list — the N+1 problem, just over HTTP instead of
   * SQL. The BFF's DataLoader collapses a tick's worth of lookups into one
   * call here.
   */
  app.get("/users", async (req) => {
    const { ids } = req.query as { ids?: string };
    const wanted = ids?.split(",").filter(Boolean);

    const result = wanted ? users.filter((u) => wanted.includes(u.id)) : users;
    return { data: result.map((u) => User.parse(u)) };
  });

  app.get("/users/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = users.find((u) => u.id === id);

    if (!found) {
      return reply.code(404).send({ error: "not_found", message: `No user ${id}` });
    }
    return User.parse(found);
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
