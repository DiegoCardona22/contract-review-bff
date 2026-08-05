import type { Analysis } from "@contract-review/contracts";

const CONTRACT = {
  msaAcme: "9b2d4e6f-2222-4b22-9b02-000000000001",
  ndaGlobex: "9b2d4e6f-2222-4b22-9b02-000000000002",
  slaInitech: "9b2d4e6f-2222-4b22-9b02-000000000003",
  leaseUmbrella: "9b2d4e6f-2222-4b22-9b02-000000000004",
  saasHooli: "9b2d4e6f-2222-4b22-9b02-000000000005",
} as const;

/**
 * Note the deliberate gaps: `saasHooli` is still queued and has no score, and
 * no analysis exists for `leaseUmbrella` at all. The BFF has to represent
 * "not analysed yet" and "analysis missing" as different states rather than
 * collapsing both into a zero.
 */
export const analyses: Analysis[] = [
  {
    contractId: CONTRACT.msaAcme,
    status: "complete",
    riskScore: 72,
    completedAt: "2026-05-15T10:03:00.000Z",
    findings: [
      {
        id: "c3d5e7f9-3333-4c33-ac03-000000000001",
        clause: "Limitation of Liability",
        severity: "high",
        summary: "Liability cap is uncapped for data breach claims.",
      },
      {
        id: "c3d5e7f9-3333-4c33-ac03-000000000002",
        clause: "Indemnification",
        severity: "medium",
        summary: "Indemnity runs one way in favour of the counterparty.",
      },
    ],
  },
  {
    contractId: CONTRACT.ndaGlobex,
    status: "complete",
    riskScore: 18,
    completedAt: "2026-02-03T15:20:00.000Z",
    findings: [
      {
        id: "c3d5e7f9-3333-4c33-ac03-000000000003",
        clause: "Term",
        severity: "low",
        summary: "Three-year term is longer than the two-year standard.",
      },
    ],
  },
  {
    contractId: CONTRACT.slaInitech,
    status: "complete",
    riskScore: 91,
    completedAt: "2026-06-29T08:45:00.000Z",
    findings: [
      {
        id: "c3d5e7f9-3333-4c33-ac03-000000000004",
        clause: "Service Credits",
        severity: "critical",
        summary: "No service credits owed below 95% uptime.",
      },
      {
        id: "c3d5e7f9-3333-4c33-ac03-000000000005",
        clause: "Termination",
        severity: "high",
        summary: "Counterparty may terminate for convenience on 15 days notice.",
      },
    ],
  },
  {
    contractId: CONTRACT.saasHooli,
    status: "queued",
    riskScore: null,
    completedAt: null,
    findings: [],
  },
];
