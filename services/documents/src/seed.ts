import type { Contract } from "@contract-review/contracts";

/**
 * Fixed UUIDs so every service agrees on who owns what without a shared
 * database, and so tests can assert on stable ids.
 */
export const USER_IDS = {
  ana: "6f1a3c2e-1111-4a11-8a01-000000000001",
  luis: "6f1a3c2e-1111-4a11-8a01-000000000002",
  marta: "6f1a3c2e-1111-4a11-8a01-000000000003",
} as const;

export const CONTRACT_IDS = {
  msaAcme: "9b2d4e6f-2222-4b22-9b02-000000000001",
  ndaGlobex: "9b2d4e6f-2222-4b22-9b02-000000000002",
  slaInitech: "9b2d4e6f-2222-4b22-9b02-000000000003",
  leaseUmbrella: "9b2d4e6f-2222-4b22-9b02-000000000004",
  saasHooli: "9b2d4e6f-2222-4b22-9b02-000000000005",
} as const;

export const contracts: Contract[] = [
  {
    id: CONTRACT_IDS.msaAcme,
    title: "Master Services Agreement",
    counterparty: "Acme Corporation",
    status: "in_review",
    ownerId: USER_IDS.ana,
    valueUsd: 1_250_000,
    uploadedAt: "2026-05-14T09:12:00.000Z",
    expiresAt: "2028-05-14T00:00:00.000Z",
  },
  {
    id: CONTRACT_IDS.ndaGlobex,
    title: "Mutual Non-Disclosure Agreement",
    counterparty: "Globex Industries",
    status: "executed",
    ownerId: USER_IDS.luis,
    valueUsd: 0,
    uploadedAt: "2026-02-03T14:40:00.000Z",
    expiresAt: "2029-02-03T00:00:00.000Z",
  },
  {
    id: CONTRACT_IDS.slaInitech,
    title: "Service Level Agreement",
    counterparty: "Initech LLC",
    status: "negotiating",
    ownerId: USER_IDS.ana,
    valueUsd: 480_000,
    uploadedAt: "2026-06-28T11:05:00.000Z",
    expiresAt: null,
  },
  {
    id: CONTRACT_IDS.leaseUmbrella,
    title: "Commercial Lease",
    counterparty: "Umbrella Holdings",
    status: "expired",
    ownerId: USER_IDS.marta,
    valueUsd: 96_000,
    uploadedAt: "2024-01-19T08:00:00.000Z",
    expiresAt: "2026-01-19T00:00:00.000Z",
  },
  {
    id: CONTRACT_IDS.saasHooli,
    title: "SaaS Subscription Agreement",
    counterparty: "Hooli Inc.",
    status: "draft",
    ownerId: USER_IDS.marta,
    valueUsd: 210_000,
    uploadedAt: "2026-07-30T16:22:00.000Z",
    expiresAt: null,
  },
];
