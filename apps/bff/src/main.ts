import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";

/**
 * Fastify adapter rather than Express: the upstreams are Fastify too, so the
 * whole system shares one HTTP stack, one logger shape, and one set of
 * performance characteristics to reason about.
 */
export async function bootstrap(): Promise<NestFastifyApplication> {
  const config = loadConfig();

  const adapter = new FastifyAdapter({
    logger: { level: config.logLevel },
    // Reuse an inbound correlation id when the caller supplies one, so a trace
    // that starts in the browser keeps the same id all the way down.
    genReqId: (req: { headers: Record<string, unknown> }) =>
      (req.headers["x-correlation-id"] as string) ?? randomUUID(),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.enableCors({ origin: true });

  // Echo the id back so a user reporting a bug can quote one string that finds
  // the whole trace across four services.
  app.getHttpAdapter().getInstance().addHook("onSend", async (req, reply) => {
    reply.header("x-correlation-id", req.id);
  });

  // Containers get SIGTERM on `docker compose down`; without this, in-flight
  // requests are cut instead of drained.
  app.enableShutdownHooks();

  await app.listen(config.port, "0.0.0.0");
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    console.error("BFF failed to start:", error);
    process.exit(1);
  });
}
