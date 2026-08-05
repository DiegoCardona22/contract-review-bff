import type { User } from "@contract-review/contracts";

/** Ids match services/documents/src/seed.ts — no shared DB, shared constants. */
export const users: User[] = [
  {
    id: "6f1a3c2e-1111-4a11-8a01-000000000001",
    name: "Ana Restrepo",
    email: "ana.restrepo@example.com",
    role: "counsel",
    avatarUrl: null,
  },
  {
    id: "6f1a3c2e-1111-4a11-8a01-000000000002",
    name: "Luis Betancur",
    email: "luis.betancur@example.com",
    role: "paralegal",
    avatarUrl: null,
  },
  {
    id: "6f1a3c2e-1111-4a11-8a01-000000000003",
    name: "Marta Ochoa",
    email: "marta.ochoa@example.com",
    role: "admin",
    avatarUrl: null,
  },
];
