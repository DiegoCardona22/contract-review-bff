import type {
  Analysis,
  Contract,
  ContractListItem,
  ContractOverview,
  User,
} from "@contract-review/contracts";
import type { UpstreamClients } from "../upstream/clients.js";

/**
 * The composition layer.
 *
 * Two rules govern everything here:
 *
 *  1. **Fan out concurrently.** Independent upstream calls are issued together.
 *     Sequential awaits would make the screen as slow as the sum of its parts.
 *
 *  2. **Degrade per field, never per request.** The contract itself is the only
 *     required piece. If `users` or `analysis` fails, the response is still a
 *     200 with that field null and the upstream named in `degraded[]`. The
 *     client can then render "risk unavailable" instead of an error page for a
 *     contract that is perfectly readable.
 *
 * The second rule is why `Promise.allSettled` is used rather than `Promise.all`.
 * `all` rejects on the first failure and discards the results that did arrive —
 * exactly the behaviour we are trying to avoid.
 */

export interface Logger {
  warn(context: Record<string, unknown>, message: string): void;
}

const noopLogger: Logger = { warn: () => {} };

export class ContractComposer {
  constructor(
    private readonly upstream: UpstreamClients,
    private readonly logger: Logger = noopLogger,
  ) {}

  /**
   * One contract, fully hydrated. Returns null when the contract itself does
   * not exist — that is a 404, not a degraded 200.
   */
  async getOverview(
    contractId: string,
    correlationId: string,
  ): Promise<ContractOverview | null> {
    const contract = await this.upstream.documents.getContract(contractId, correlationId);
    if (!contract) return null;

    // Owner and analysis are independent of each other, so they go out together.
    // Both are optional, so neither can fail the request.
    const [ownerResult, analysisResult] = await Promise.allSettled([
      this.upstream.users.getUsers([contract.ownerId], correlationId),
      this.upstream.analysis.getAnalysis(contractId, correlationId),
    ]);

    const degraded: ContractOverview["degraded"] = [];

    let owner: User | null = null;
    if (ownerResult.status === "fulfilled") {
      owner = ownerResult.value.get(contract.ownerId) ?? null;
    } else {
      degraded.push("users");
      this.logger.warn(
        { correlationId, upstream: "users", contractId, reason: describe(ownerResult.reason) },
        "degraded: owner omitted from overview",
      );
    }

    let analysis: Analysis | null = null;
    if (analysisResult.status === "fulfilled") {
      analysis = analysisResult.value;
    } else {
      degraded.push("analysis");
      this.logger.warn(
        {
          correlationId,
          upstream: "analysis",
          contractId,
          reason: describe(analysisResult.reason),
        },
        "degraded: analysis omitted from overview",
      );
    }

    return { contract, owner, analysis, degraded };
  }

  /**
   * The list screen. This is where N+1 would bite: five contracts naively means
   * five owner lookups plus five analysis lookups, eleven round trips for one
   * screen. Collecting the ids first and issuing exactly one batch call per
   * upstream makes it three, regardless of page size.
   */
  async listContracts(correlationId: string): Promise<ContractListItem[]> {
    const contracts = await this.upstream.documents.listContracts(correlationId);
    if (contracts.length === 0) return [];

    const ownerIds = contracts.map((c) => c.ownerId);
    const contractIds = contracts.map((c) => c.id);

    const [ownersResult, analysesResult] = await Promise.allSettled([
      this.upstream.users.getUsers(ownerIds, correlationId),
      this.upstream.analysis.getAnalyses(contractIds, correlationId),
    ]);

    const owners = unwrapOrEmpty(ownersResult, "users", correlationId, this.logger);
    const analyses = unwrapOrEmpty(analysesResult, "analysis", correlationId, this.logger);

    return contracts.map((contract) => toListItem(contract, owners, analyses));
  }
}

function toListItem(
  contract: Contract,
  owners: Map<string, User>,
  analyses: Map<string, Analysis>,
): ContractListItem {
  return {
    id: contract.id,
    title: contract.title,
    counterparty: contract.counterparty,
    status: contract.status,
    valueUsd: contract.valueUsd,
    ownerName: owners.get(contract.ownerId)?.name ?? null,
    // `?? null` rather than `?? 0`: a missing score and a score of zero mean
    // opposite things to a lawyer reading this table.
    riskScore: analyses.get(contract.id)?.riskScore ?? null,
  };
}

/**
 * A failed batch degrades the whole column to null rather than failing the
 * list. Every row still renders with the data that did arrive.
 */
function unwrapOrEmpty<K, V>(
  result: PromiseSettledResult<Map<K, V>>,
  upstream: string,
  correlationId: string,
  logger: Logger,
): Map<K, V> {
  if (result.status === "fulfilled") return result.value;

  logger.warn(
    { correlationId, upstream, reason: describe(result.reason) },
    "degraded: batch lookup failed, column rendered empty",
  );
  return new Map();
}

function describe(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}
