import { describe, expect, it, vi } from "vitest";
import type { Analysis, Contract, User } from "@contract-review/contracts";
import { ContractComposer } from "./contract-composer.js";
import type { UpstreamClients } from "../upstream/clients.js";

const OWNER_ID = "6f1a3c2e-1111-4a11-8a01-000000000001";
const CONTRACT_ID = "9b2d4e6f-2222-4b22-9b02-000000000001";

const contract: Contract = {
  id: CONTRACT_ID,
  title: "Master Services Agreement",
  counterparty: "Acme Corporation",
  status: "in_review",
  ownerId: OWNER_ID,
  valueUsd: 1_250_000,
  uploadedAt: "2026-05-14T09:12:00.000Z",
  expiresAt: null,
};

const owner: User = {
  id: OWNER_ID,
  name: "Ana Restrepo",
  email: "ana.restrepo@example.com",
  role: "counsel",
  avatarUrl: null,
};

const analysis: Analysis = {
  contractId: CONTRACT_ID,
  status: "complete",
  riskScore: 72,
  completedAt: "2026-05-15T10:03:00.000Z",
  findings: [],
};

/** Builds an upstream double; each call can be overridden per test. */
function makeUpstream(overrides: Partial<Record<keyof UpstreamClients, unknown>> = {}) {
  return {
    documents: {
      listContracts: vi.fn().mockResolvedValue([contract]),
      getContract: vi.fn().mockResolvedValue(contract),
    },
    users: {
      getUsers: vi.fn().mockResolvedValue(new Map([[OWNER_ID, owner]])),
    },
    analysis: {
      getAnalysis: vi.fn().mockResolvedValue(analysis),
      getAnalyses: vi.fn().mockResolvedValue(new Map([[CONTRACT_ID, analysis]])),
    },
    ...overrides,
  } as unknown as UpstreamClients;
}

describe("ContractComposer.getOverview", () => {
  it("composes contract, owner and analysis when every upstream is healthy", async () => {
    const composer = new ContractComposer(makeUpstream());

    const result = await composer.getOverview(CONTRACT_ID, "corr-1");

    expect(result).toMatchObject({
      contract: { id: CONTRACT_ID },
      owner: { name: "Ana Restrepo" },
      analysis: { riskScore: 72 },
      degraded: [],
    });
  });

  it("returns null when the contract itself does not exist", async () => {
    const upstream = makeUpstream({
      documents: {
        listContracts: vi.fn(),
        getContract: vi.fn().mockResolvedValue(null),
      },
    });

    // Missing contract is a 404, not a degraded 200 — the caller must be able
    // to tell "no such thing" from "partially unavailable".
    await expect(new ContractComposer(upstream).getOverview(CONTRACT_ID, "c")).resolves.toBeNull();
  });

  it("still returns the contract when the users upstream fails", async () => {
    const upstream = makeUpstream({
      users: { getUsers: vi.fn().mockRejectedValue(new Error("users is down")) },
    });

    const result = await new ContractComposer(upstream).getOverview(CONTRACT_ID, "c");

    expect(result?.contract.id).toBe(CONTRACT_ID);
    expect(result?.owner).toBeNull();
    expect(result?.analysis).not.toBeNull();
    expect(result?.degraded).toEqual(["users"]);
  });

  it("still returns the contract when the analysis upstream fails", async () => {
    const upstream = makeUpstream({
      analysis: {
        getAnalysis: vi.fn().mockRejectedValue(new Error("analysis is down")),
        getAnalyses: vi.fn(),
      },
    });

    const result = await new ContractComposer(upstream).getOverview(CONTRACT_ID, "c");

    expect(result?.analysis).toBeNull();
    expect(result?.owner).not.toBeNull();
    expect(result?.degraded).toEqual(["analysis"]);
  });

  it("reports both upstreams when both fail, and still serves the contract", async () => {
    const upstream = makeUpstream({
      users: { getUsers: vi.fn().mockRejectedValue(new Error("down")) },
      analysis: {
        getAnalysis: vi.fn().mockRejectedValue(new Error("down")),
        getAnalyses: vi.fn(),
      },
    });

    const result = await new ContractComposer(upstream).getOverview(CONTRACT_ID, "c");

    expect(result?.contract).toBeDefined();
    expect(result?.degraded).toEqual(["users", "analysis"]);
  });

  it("distinguishes a missing analysis from a failing analysis service", async () => {
    // Upstream answered "there is none" — that is data, so nothing is degraded.
    const upstream = makeUpstream({
      analysis: { getAnalysis: vi.fn().mockResolvedValue(null), getAnalyses: vi.fn() },
    });

    const result = await new ContractComposer(upstream).getOverview(CONTRACT_ID, "c");

    expect(result?.analysis).toBeNull();
    expect(result?.degraded).toEqual([]);
  });

  it("fans out to owner and analysis concurrently, not in sequence", async () => {
    const order: string[] = [];
    const upstream = makeUpstream({
      users: {
        getUsers: vi.fn(async () => {
          order.push("users:start");
          await new Promise((r) => setTimeout(r, 20));
          order.push("users:end");
          return new Map([[OWNER_ID, owner]]);
        }),
      },
      analysis: {
        getAnalysis: vi.fn(async () => {
          order.push("analysis:start");
          return analysis;
        }),
        getAnalyses: vi.fn(),
      },
    });

    await new ContractComposer(upstream).getOverview(CONTRACT_ID, "c");

    // analysis must start before users finishes, or the calls were serialised.
    expect(order.indexOf("analysis:start")).toBeLessThan(order.indexOf("users:end"));
  });

  it("logs the correlation id and upstream when it degrades", async () => {
    const warn = vi.fn();
    const upstream = makeUpstream({
      users: { getUsers: vi.fn().mockRejectedValue(new Error("boom")) },
    });

    await new ContractComposer(upstream, { warn }).getOverview(CONTRACT_ID, "corr-42");

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr-42", upstream: "users" }),
      expect.stringContaining("degraded"),
    );
  });
});

describe("ContractComposer.listContracts", () => {
  it("hydrates rows with owner name and risk score", async () => {
    const result = await new ContractComposer(makeUpstream()).listContracts("c");

    expect(result).toEqual([
      expect.objectContaining({ ownerName: "Ana Restrepo", riskScore: 72 }),
    ]);
  });

  it("issues one batch call per upstream regardless of row count", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...contract,
      id: `9b2d4e6f-2222-4b22-9b02-0000000${String(i).padStart(5, "0")}`,
    }));
    const upstream = makeUpstream({
      documents: {
        listContracts: vi.fn().mockResolvedValue(many),
        getContract: vi.fn(),
      },
    });

    await new ContractComposer(upstream).listContracts("c");

    // The N+1 guard: 25 rows must still cost exactly one call to each upstream.
    expect(upstream.users.getUsers).toHaveBeenCalledTimes(1);
    expect(upstream.analysis.getAnalyses).toHaveBeenCalledTimes(1);
  });

  it("renders rows with null columns when a batch upstream fails", async () => {
    const upstream = makeUpstream({
      analysis: {
        getAnalyses: vi.fn().mockRejectedValue(new Error("analysis is down")),
        getAnalysis: vi.fn(),
      },
    });

    const result = await new ContractComposer(upstream).listContracts("c");

    expect(result[0]).toMatchObject({ ownerName: "Ana Restrepo", riskScore: null });
  });

  it("skips upstream calls entirely when there are no contracts", async () => {
    const upstream = makeUpstream({
      documents: { listContracts: vi.fn().mockResolvedValue([]), getContract: vi.fn() },
    });

    await expect(new ContractComposer(upstream).listContracts("c")).resolves.toEqual([]);
    expect(upstream.users.getUsers).not.toHaveBeenCalled();
  });
});
