import { Link } from "react-router-dom";
import type { V3PositionRaw } from "../lib/api.js";
import { classifyHealth, type Health } from "../lib/health.js";
import { Cap, Mono, fmt } from "../design/atoms.js";
import { TokenPair } from "../design/TokenPair.js";

interface Props {
  position: V3PositionRaw;
}

const HEALTH_TO_STATUS: Record<Health, "healthy" | "drift" | "bleeding"> = {
  green: "healthy",
  amber: "drift",
  red:   "bleeding",
};

const STICKER_LABEL: Record<"healthy" | "drift" | "bleeding", string> = {
  healthy:  "Healthy",
  drift:    "Drifting",
  bleeding: "Bleeding",
};

const TIER_LABEL: Record<string, string> = {
  "100":   "0.01%",
  "500":   "0.05%",
  "3000":  "0.30%",
  "10000": "1.00%",
};

function feeTierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? `${(parseInt(tier, 10) / 10_000).toFixed(2)}%`;
}

function formatLiquidity(liq: string): string {
  try {
    BigInt(liq);
    if (liq.length > 12) {
      const head = liq.slice(0, 4);
      return `${head[0]}.${head.slice(1)}e${liq.length - 1}`;
    }
    return fmt.num(Number(liq));
  } catch {
    return liq;
  }
}

function rangeFill(status: "healthy" | "drift" | "bleeding"): string {
  if (status === "healthy")  return "68%";
  if (status === "drift")    return "38%";
  return "100%";
}

function isDustPosition(dep0: number, dep1: number): boolean {
  // Heuristic for frontend demo: if both deposited amounts are extremely small,
  // classify as "dust". In production, backend portfolioMetrics checks USD value < $100.
  return dep0 < 0.0001 && dep1 < 0.0001;
}

function diagnoseHref(position: V3PositionRaw): string {
  const params = new URLSearchParams();
  params.set("walletAddress", position.owner);
  if (position.protocol) params.set("protocol", position.protocol);

  return `/diagnose/${position.id}?${params.toString()}`;
}

export function PositionCard({ position }: Props) {
  const health = classifyHealth(position);
  const status = HEALTH_TO_STATUS[health];

  const { pool, tickLower, tickUpper } = position;
  const tickRange = `${tickLower.tickIdx} → ${tickUpper.tickIdx}`;

  const dep0 = parseFloat(position.depositedToken0);
  const dep1 = parseFloat(position.depositedToken1);
  const fee0 = parseFloat(position.collectedFeesToken0);
  const fee1 = parseFloat(position.collectedFeesToken1);
  const totalDeposited = dep0 + dep1;
  const totalFees = fee0 + fee1;

  const isDust = isDustPosition(dep0, dep1);

  return (
    <Link
      to={diagnoseHref(position)}
      className="atlas-card"
      aria-label={`Diagnose ${pool.token0.symbol}/${pool.token1.symbol} position ${position.id}`}
    >
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">LP POSITION · TOKEN {position.id}</span>
      </div>

      <div className="atlas-card-body">
        {/* Sticker row: health status left, fee tier right */}
        <div className="atlas-card-stickers">
          <div style={{ display: "flex", gap: 6 }}>
            <span className={`lp-sticker atlas-sticker-${status}`}>
              {STICKER_LABEL[status]}
            </span>
            {isDust && (
              <span className="lp-sticker atlas-sticker-drift">
                DUST
              </span>
            )}
          </div>
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--lp-ink-ghost)", letterSpacing: "0.04em" }}
          >
            {feeTierLabel(pool.feeTier)}
          </span>
        </div>

        {/* Pool name */}
        <div className="atlas-card-head">
          <div className="atlas-pair-block">
            <TokenPair t0={pool.token0.symbol} t1={pool.token1.symbol} />
            <div>
              <div className="atlas-pool-name">
                {pool.token0.symbol} / {pool.token1.symbol}
              </div>
              <span className="mono atlas-pool-sub">tokenId {position.id}</span>
            </div>
          </div>
        </div>

        {/* Range bar */}
        <div className="atlas-range-wrap">
          <div className="atlas-range-meta">
            <Cap>RANGE</Cap>
            <span className={`mono atlas-range-label${status === "bleeding" ? " atlas-range-label--out" : ""}`}>
              {tickRange}
            </span>
          </div>
          <div className={`atlas-range-track${status === "bleeding" ? " atlas-range-track--out" : ""}`} aria-hidden>
            <div
              className={`atlas-range-fill atlas-range-fill--${status}`}
              style={{ width: rangeFill(status) }}
            />
          </div>
        </div>

        {/* Stat grid */}
        <div className="atlas-card-stat-grid atlas-stat-divider">
          <Metric label="DEPOSITED" value={fmt.num(totalDeposited)} />
          <Metric
            label="FEES"
            value={fmt.num(totalFees)}
            tone={totalFees > 0 ? "var(--lp-healthy)" : undefined}
          />
          <Metric label="LIQUIDITY" value={formatLiquidity(position.liquidity)} />
          <Metric label="FEE TIER"  value={feeTierLabel(pool.feeTier)} />
        </div>

        {/* Footer */}
        <div className="atlas-card-footer atlas-stat-divider">
          <span className="atlas-diagnose-btn">
            Diagnose
            <PixelArrow />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <Cap>{label}</Cap>
      <span className="mono atlas-metric-value" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}

function PixelArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
