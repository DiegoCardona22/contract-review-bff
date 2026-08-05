import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Analysis } from "@contract-review/contracts";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";

const SAAS_HOOLI = "9b2d4e6f-2222-4b22-9b02-000000000005";
const LEASE_UMBRELLA = "9b2d4e6f-2222-4b22-9b02-000000000004";

describe("analysis service", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ status: "ok", service: "analysis" });
  });

  it("emits analyses matching the shared schema", async () => {
    const res = await app.inject({ method: "GET", url: "/analyses" });
    expect(() => res.json().data.map((a: unknown) => Analysis.parse(a))).not.toThrow();
  });

  it("represents a queued analysis with a null score, not a zero", async () => {
    // A zero risk score means "we looked and it is safe". Null means "we have
    // not looked yet". Collapsing them would be a lie the UI cannot detect.
    const res = await app.inject({ method: "GET", url: `/analyses/${SAAS_HOOLI}` });
    const analysis = Analysis.parse(res.json());

    expect(analysis.status).toBe("queued");
    expect(analysis.riskScore).toBeNull();
    expect(analysis.findings).toEqual([]);
  });

  it("404s for a contract that has no analysis at all", async () => {
    const res = await app.inject({ method: "GET", url: `/analyses/${LEASE_UMBRELLA}` });
    expect(res.statusCode).toBe(404);
  });
});
