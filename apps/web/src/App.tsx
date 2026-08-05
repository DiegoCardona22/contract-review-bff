import { useEffect, useState } from "react";
import type { ContractListItem, ContractOverview } from "@contract-review/contracts";
import { ApiError, fetchContracts, fetchOverview } from "./api.js";
import { OverviewPanel } from "./OverviewPanel.js";

/**
 * Two screens, both fed by one BFF call each. The interesting behaviour is in
 * OverviewPanel: how the UI reads `degraded[]` and tells the user the truth.
 */
export function App() {
  const [contracts, setContracts] = useState<ContractListItem[] | null>(null);
  // Selection lives in the URL so a contract can be linked, bookmarked and
  // shared. It is also what makes the nginx SPA fallback meaningful.
  const [selected, setSelected] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("contract"),
  );
  const [overview, setOverview] = useState<ContractOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContracts()
      .then(setContracts)
      .catch((e: unknown) => setError(describe(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setOverview(null);
    fetchOverview(selected)
      .then(setOverview)
      .catch((e: unknown) => setError(describe(e)));
  }, [selected]);

  if (error) return <p className="error">{error}</p>;
  if (!contracts) return <p className="muted">Loading contracts…</p>;

  return (
    <div className="layout">
      <section>
        <h2>Contracts</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Counterparty</th>
              <th>Owner</th>
              <th className="right">Value</th>
              <th className="right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("contract", c.id);
                  window.history.pushState({}, "", url);
                }}
                className={c.id === selected ? "selected" : undefined}
              >
                <td>{c.title}</td>
                <td>{c.counterparty}</td>
                {/* A null owner name means the users upstream did not answer.
                    Rendering an em dash is honest; rendering "" would look
                    like a contract nobody owns. */}
                <td>{c.ownerName ?? <span className="muted">—</span>}</td>
                <td className="right">{formatUsd(c.valueUsd)}</td>
                <td className="right">
                  {c.riskScore === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <RiskPill score={c.riskScore} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selected && <OverviewPanel overview={overview} />}
    </div>
  );
}

export function RiskPill({ score }: { score: number }) {
  const band = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return <span className={`pill pill-${band}`}>{score}</span>;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return error.correlationId
      ? `${error.message} (trace ${error.correlationId})`
      : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
