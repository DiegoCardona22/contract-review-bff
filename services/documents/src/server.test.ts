import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Contract } from "@contract-review/contracts";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { CONTRACT_IDS } from "./seed.js";

/**
 * Contract tests: they assert this service still emits what the BFF's schemas
 * expect. If someone renames a field here, this fails in the owning repo's CI
 * rather than as a runtime surprise inside the BFF.
 *
 * `app.inject()` exercises the real routing and serialisation stack without
 * binding a port, so the tests stay fast and parallel-safe.
 */
describe("documents service", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports health without touching the data layer", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "documents" });
  });

  it("returns every contract in the shape the BFF validates against", async () => {
    const res = await app.inject({ method: "GET", url: "/contracts" });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.length).toBeGreaterThan(0);
    // Parsing with the shared schema is the assertion: any drift throws.
    expect(() => data.map((c: unknown) => Contract.parse(c))).not.toThrow();
  });

  it("filters to the requested ids so the BFF can batch instead of N+1", async () => {
    const ids = [CONTRACT_IDS.msaAcme, CONTRACT_IDS.ndaGlobex];
    const res = await app.inject({ method: "GET", url: `/contracts?ids=${ids.join(",")}` });

    const { data } = res.json();
    expect(data).toHaveLength(2);
    expect(data.map((c: Contract) => c.id).sort()).toEqual([...ids].sort());
  });

  it("ignores unknown ids in a batch rather than failing the whole call", async () => {
    // One bad id in a batch of many must not cost the caller the good rows.
    const res = await app.inject({
      method: "GET",
      url: `/contracts?ids=${CONTRACT_IDS.msaAcme},00000000-0000-4000-8000-000000000000`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("returns a single contract by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/contracts/${CONTRACT_IDS.slaInitech}`,
    });

    expect(res.statusCode).toBe(200);
    expect(Contract.parse(res.json()).counterparty).toBe("Initech LLC");
  });

  it("404s on an unknown id with a typed error body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/contracts/00000000-0000-4000-8000-000000000000",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
