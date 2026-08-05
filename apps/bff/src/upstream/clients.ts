import { z } from "zod";
import { Analysis, Contract, User } from "@contract-review/contracts";
import { ResilientClient, UpstreamError } from "../http/resilient-client.js";

/**
 * Thin, typed wrappers over the resilient transport.
 *
 * Every response is parsed with the shared schema before it leaves this layer.
 * That is the whole point of validating at the seam: if `users` starts sending
 * `full_name` instead of `name`, the failure surfaces here — attributed to the
 * upstream that broke — instead of as `undefined` rendered into the UI.
 */

const listOf = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) });

export interface UpstreamClients {
  documents: DocumentsClient;
  users: UsersClient;
  analysis: AnalysisClient;
}

export class DocumentsClient {
  constructor(private readonly http: ResilientClient) {}

  async listContracts(correlationId: string): Promise<Contract[]> {
    const body = await this.http.get<unknown>("/contracts", correlationId);
    return listOf(Contract).parse(body).data;
  }

  async getContract(id: string, correlationId: string): Promise<Contract | null> {
    try {
      return Contract.parse(await this.http.get<unknown>(`/contracts/${id}`, correlationId));
    } catch (error) {
      // A 404 is an answer, not a failure: this contract does not exist. It
      // must not count against the circuit breaker or trigger retries.
      if (error instanceof UpstreamError && error.status === 404) return null;
      throw error;
    }
  }
}

export class UsersClient {
  constructor(private readonly http: ResilientClient) {}

  /**
   * Batch by design. Callers never fetch users one at a time — see
   * `batchLoad` in the composer for how a list request collapses into one call.
   */
  async getUsers(ids: readonly string[], correlationId: string): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();

    const unique = [...new Set(ids)];
    const body = await this.http.get<unknown>(`/users?ids=${unique.join(",")}`, correlationId);
    const { data } = listOf(User).parse(body);

    return new Map(data.map((user) => [user.id, user]));
  }
}

export class AnalysisClient {
  constructor(private readonly http: ResilientClient) {}

  async getAnalyses(
    contractIds: readonly string[],
    correlationId: string,
  ): Promise<Map<string, Analysis>> {
    if (contractIds.length === 0) return new Map();

    const unique = [...new Set(contractIds)];
    const body = await this.http.get<unknown>(
      `/analyses?contractIds=${unique.join(",")}`,
      correlationId,
    );
    const { data } = listOf(Analysis).parse(body);

    return new Map(data.map((analysis) => [analysis.contractId, analysis]));
  }

  async getAnalysis(contractId: string, correlationId: string): Promise<Analysis | null> {
    try {
      return Analysis.parse(
        await this.http.get<unknown>(`/analyses/${contractId}`, correlationId),
      );
    } catch (error) {
      // No analysis for this contract is a legitimate state — several contracts
      // in the seed data have none. Distinct from "analysis service is down".
      if (error instanceof UpstreamError && error.status === 404) return null;
      throw error;
    }
  }
}
