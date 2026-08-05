import { ContractListItem, ContractOverview } from "@contract-review/contracts";
import { z } from "zod";

/**
 * The client parses what the BFF sends with the same schemas the BFF used to
 * build it. Sharing the package means a breaking change to the payload fails
 * the web build, not a user's screen.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Echoed by the BFF; quoting it in a bug report finds the whole trace. */
    readonly correlationId: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const correlationId = response.headers.get("x-correlation-id");

  if (!response.ok) {
    throw new ApiError(response.status, correlationId, `Request to ${path} failed`);
  }

  return schema.parse(await response.json());
}

const ListResponse = z.object({ data: z.array(ContractListItem) });

export function fetchContracts(): Promise<ContractListItem[]> {
  return request("/api/contracts", ListResponse).then((r) => r.data);
}

export function fetchOverview(id: string): Promise<ContractOverview> {
  return request(`/api/contracts/${id}/overview`, ContractOverview);
}
