import type { PortfolioRisk, V3PositionRaw } from "../lib/api.js";
import { LabelBadge } from "./LabelBadge.js";

interface Props {
  portfolioRisk: PortfolioRisk;
  positions: V3PositionRaw[];
}

interface Action {
  priority: "high" | "medium" | "low";
  label: string;
  detail: string;
  tone: string;
}

function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

function priorityDot(p: Action["priority"]): string {
  if (p === "high")   return "var(--lp-bleed)";
  if (p === "medium") return "var(--lp-toxic)";
  return "var(--lp-healthy)";
}

function deriveActions(risk: PortfolioRisk, positions: V3PositionRaw[]): Action[] {
  const { outOfRangePositions, dustPositions, concentrationBps, correlatedExposureBps } = risk.metrics;
  const actions: Action[] = [];

  if (outOfRangePositions > 0) {
    const pools = positions
      .filter((p) => {
        const tick = p.pool.tick ? Number(p.pool.tick) : null;
        if (tick === null) return false;
        const lower = Number(p.tickLower.tickIdx);
        const upper = Number(p.tickUpper.tickIdx);
        return tick < lower || tick >= upper;
      })
      .slice(0, 3)
      .map((p) => `${p.pool.token0.symbol}/${p.pool.token1.symbol}`)
      .filter((v, i, a) => a.indexOf(v) === i);
    actions.push({
      priority: "high",
      label: `Migrate ${outOfRangePositions} out-of-range position${outOfRangePositions > 1 ? "s" : ""} → V4`,
      detail: pools.length
        ? `${pools.join(", ")} — fees have stopped accruing. V4 hook can auto-rebalance the range.`
        : "Positions outside tick range earn zero fees. Migrate to a V4 hook pool to resume compounding.",
      tone: "var(--lp-bleed)",
    });
  }

  if (dustPositions > 0) {
    actions.push({
      priority: "high",
      label: `Consolidate ${dustPositions} dust position${dustPositions > 1 ? "s" : ""}`,
      detail: `${dustPositions} position${dustPositions > 1 ? "s" : ""} below the $100 dust threshold. Gas cost to manage each exceeds earnings. Close and consolidate into one V4 position.`,
      tone: "var(--lp-bleed)",
    });
  }

  if (concentrationBps > 6000) {
    actions.push({
      priority: concentrationBps > 8000 ? "high" : "medium",
      label: `Reduce concentration (${fmtBps(concentrationBps)} in largest position)`,
      detail: "Liquidity is heavily weighted in a single position. A sharp price move can cause outsized IL. Spread across two tighter ranges.",
      tone: concentrationBps > 8000 ? "var(--lp-bleed)" : "var(--lp-toxic)",
    });
  }

  if (correlatedExposureBps > 7000) {
    actions.push({
      priority: "medium",
      label: `Diversify ETH-correlated cluster (${fmtBps(correlatedExposureBps)} exposure)`,
      detail: "Most positions share ETH price risk. A single ETH drawdown affects the whole portfolio simultaneously.",
      tone: "var(--lp-toxic)",
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: "low",
      label: "Portfolio looks healthy",
      detail: "No immediate rebalance needed. Monitor weekly — tick drift or market moves may change this.",
      tone: "var(--lp-healthy)",
    });
  }

  return actions;
}

export function RebalanceProposal({ portfolioRisk, positions }: Props) {
  const actions = deriveActions(portfolioRisk, positions);
  const riskLabel = portfolioRisk.riskTier >= 3 ? "URGENT" : portfolioRisk.riskTier >= 2 ? "REBALANCE" : portfolioRisk.riskTier >= 1 ? "WATCH" : "HEALTHY";

  return (
    <section className="atlas-scoreboard lp-window" aria-label="Rebalance Proposal">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <span className="lp-window-title">REBALANCE PROPOSAL</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: portfolioRisk.riskTier >= 2 ? "var(--lp-bleed)" : portfolioRisk.riskTier >= 1 ? "var(--lp-toxic)" : "var(--lp-healthy)",
              letterSpacing: "0.05em",
            }}>
              {riskLabel}
            </span>
            <LabelBadge label="COMPUTED" />
          </div>
        </div>
      </div>

      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 16px", color: "var(--lp-ink-soft)", fontSize: 13, lineHeight: 1.5 }}>
              Risk score: <strong style={{ color: "var(--lp-ink)", fontFamily: "var(--font-mono)" }}>
                {(portfolioRisk.riskScoreBps / 100).toFixed(0)}/100
              </strong> — {actions.length} action{actions.length !== 1 ? "s" : ""} recommended.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {actions.map((action, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--lp-base-deep)",
                    borderRadius: 4,
                    padding: "12px 14px",
                    border: `1px solid var(--lp-border)`,
                    borderLeft: `3px solid ${action.tone}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityDot(action.priority), flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--lp-ink)" }}>{action.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.5, paddingLeft: 14 }}>
                    {action.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: "180px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
            <button
              className="lp-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "10px", color: "var(--lp-ink-hard)", fontSize: 12 }}
              onClick={() => alert("Permit2 bundle preview:\n\nThis will generate an EIP-712 gasless signature payload to execute the rebalance actions above.\n\nBundle execution via Permit2 is in active development.")}
            >
              Preview Permit2 Bundle
            </button>
            <span style={{ fontSize: 10, color: "var(--lp-ink-ghost)", textAlign: "center", lineHeight: 1.4 }}>
              Generates a gasless signature payload. You keep custody.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
