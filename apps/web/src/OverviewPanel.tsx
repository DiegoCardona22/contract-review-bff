import type { ContractOverview } from "@contract-review/contracts";
import { RiskPill } from "./App.js";

/**
 * Where the whole design pays off.
 *
 * `analysis: null` on its own is ambiguous — it could mean "nobody has reviewed
 * this contract" or "the analysis service is down". Those demand opposite
 * reactions from a lawyer: the first is a task to assign, the second is a
 * screen to reload in five minutes. `degraded[]` is what lets the UI tell them
 * apart, so it does.
 *
 * The failure mode this avoids is the common one: an empty state rendered as
 * if it were data. A contract showing no findings looks *safer* than one
 * showing three, which is exactly backwards when the truth is that nothing
 * was checked.
 */
export function OverviewPanel({ overview }: { overview: ContractOverview | null }) {
  if (!overview) return <aside className="panel muted">Loading…</aside>;

  const { contract, owner, analysis, degraded } = overview;
  const analysisUnavailable = degraded.includes("analysis");
  const ownerUnavailable = degraded.includes("users");

  return (
    <aside className="panel">
      <h2>{contract.title}</h2>
      <p className="muted">
        {contract.counterparty} · {contract.status.replace("_", " ")}
      </p>

      <dl>
        <dt>Owner</dt>
        <dd>
          {owner ? (
            <>
              {owner.name} <span className="muted">({owner.role})</span>
            </>
          ) : ownerUnavailable ? (
            <Unavailable service="user directory" />
          ) : (
            <span className="muted">Unassigned</span>
          )}
        </dd>

        <dt>Uploaded</dt>
        <dd>{new Date(contract.uploadedAt).toLocaleDateString()}</dd>
      </dl>

      <h3>Risk analysis</h3>

      {analysisUnavailable ? (
        // Degraded: we do not know the risk. Say so, and do not imply zero.
        <Unavailable service="analysis service" retryable />
      ) : !analysis ? (
        <p className="muted">This contract has not been analysed yet.</p>
      ) : analysis.status !== "complete" ? (
        <p className="muted">Analysis {analysis.status}…</p>
      ) : (
        <>
          <p className="score-row">
            Risk score: {analysis.riskScore !== null && <RiskPill score={analysis.riskScore} />}
          </p>
          {analysis.findings.length === 0 ? (
            // Genuinely zero findings, which is information — unlike the
            // degraded case above, this "nothing" was actually verified.
            <p className="muted">No issues found.</p>
          ) : (
            <ul className="findings">
              {analysis.findings.map((f) => (
                <li key={f.id}>
                  <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                  <strong>{f.clause}</strong>
                  <p>{f.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}

function Unavailable({ service, retryable }: { service: string; retryable?: boolean }) {
  return (
    <div className="degraded" role="status">
      <strong>Currently unavailable.</strong>
      <p>
        The {service} is not responding, so this section is missing — it is not empty.
      </p>
      {retryable && (
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      )}
    </div>
  );
}
