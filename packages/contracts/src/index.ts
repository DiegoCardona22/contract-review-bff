import { z } from "zod";

/**
 * Shared domain contracts.
 *
 * These schemas are the boundary between services. Upstreams validate what they
 * emit; the BFF validates what it receives. A shape change upstream fails loudly
 * at the seam instead of silently corrupting a response three layers later.
 */

export const UserRole = z.enum(["counsel", "paralegal", "admin"]);
export type UserRole = z.infer<typeof UserRole>;

export const User = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: UserRole,
  avatarUrl: z.string().url().nullable(),
});
export type User = z.infer<typeof User>;

export const ContractStatus = z.enum([
  "draft",
  "in_review",
  "negotiating",
  "executed",
  "expired",
]);
export type ContractStatus = z.infer<typeof ContractStatus>;

export const Contract = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  counterparty: z.string().min(1),
  status: ContractStatus,
  ownerId: z.string().uuid(),
  valueUsd: z.number().nonnegative(),
  uploadedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type Contract = z.infer<typeof Contract>;

export const Severity = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  id: z.string().uuid(),
  clause: z.string().min(1),
  severity: Severity,
  summary: z.string().min(1),
});
export type Finding = z.infer<typeof Finding>;

export const AnalysisStatus = z.enum(["queued", "running", "complete", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const Analysis = z.object({
  contractId: z.string().uuid(),
  status: AnalysisStatus,
  /** 0–100. Null while the analysis has not finished. */
  riskScore: z.number().min(0).max(100).nullable(),
  findings: z.array(Finding),
  completedAt: z.string().datetime().nullable(),
});
export type Analysis = z.infer<typeof Analysis>;

/**
 * What the BFF composes and the web client consumes.
 *
 * `owner` and `analysis` are nullable on purpose: when an upstream is degraded
 * the BFF returns the contract without them rather than failing the whole
 * request. `degraded` tells the client which parts are missing so it can render
 * a partial view honestly instead of showing empty state as if it were data.
 */
export const ContractOverview = z.object({
  contract: Contract,
  owner: User.nullable(),
  analysis: Analysis.nullable(),
  degraded: z.array(z.enum(["users", "analysis"])),
});
export type ContractOverview = z.infer<typeof ContractOverview>;

export const ContractListItem = z.object({
  id: z.string().uuid(),
  title: z.string(),
  counterparty: z.string(),
  status: ContractStatus,
  valueUsd: z.number(),
  ownerName: z.string().nullable(),
  riskScore: z.number().nullable(),
});
export type ContractListItem = z.infer<typeof ContractListItem>;
