import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { User } from "@contract-review/contracts";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { users } from "./seed.js";

describe("users service", () => {
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
    expect(res.json()).toEqual({ status: "ok", service: "users" });
  });

  it("emits users matching the shared schema", async () => {
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(() => res.json().data.map((u: unknown) => User.parse(u))).not.toThrow();
  });

  it("supports batch lookup, which is what lets the BFF avoid N+1", async () => {
    const ids = users.slice(0, 2).map((u) => u.id);
    const res = await app.inject({ method: "GET", url: `/users?ids=${ids.join(",")}` });
    expect(res.json().data).toHaveLength(2);
  });

  it("returns an empty batch rather than every user when ids match nothing", async () => {
    // Guards a nasty failure mode: an empty filter silently leaking the full table.
    const res = await app.inject({
      method: "GET",
      url: "/users?ids=00000000-0000-4000-8000-000000000000",
    });
    expect(res.json().data).toEqual([]);
  });

  it("404s on an unknown user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/users/00000000-0000-4000-8000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});
