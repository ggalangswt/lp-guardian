import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount } from "wagmi";
import { AppHeader } from "../components/AppHeader.js";
import { AggStat } from "../components/AggStat.js";
import { PositionCard } from "../components/PositionCard.js";
import { CorrelationMatrix } from "../components/CorrelationMatrix.js";
import { RebalanceProposal } from "../components/RebalanceProposal.js";
import { Mono } from "../design/atoms.js";
import { shortAddr } from "../design/atoms.js";
import { fetchPositions, type V3PositionRaw, type PortfolioRisk } from "../lib/api.js";
import { classifyHealth } from "../lib/health.js";
import "../styles/atlas.css";

interface DemoWallet {
  slot: "portfolio" | "bleeding" | "mixed" | "whale" | "healthy" | "drifting";
  label: string;
  address: string;
  hint: string;
}

const CURATED_DEMO_WALLETS: DemoWallet[] = [
  {
    slot: "portfolio",
    label: "portfolio · 30+",
    address: "0xfd235968e65b0990584585763f837a5b5330e6de",
    hint: "30 LP positions across 27 pools on Mantle. Diverse pro LP wallet.",
  },
  {
    slot: "bleeding",
    label: "bleeding · 10 out",
    address: "0x8f4daa33706d70677fd69e4e0d47e595bc820e95",
    hint: "10 USDY/mETH positions. All out-of-range. Around $600k stuck.",
  },
  {
    slot: "mixed",
    label: "mixed · 5 trapped",
    address: "0x4d3e3d1a38505185ba86a1b1f3084195d556bc2a",
    hint: "5 USDY/mETH positions. Price climbed past the range.",
  },
  {
    slot: "whale",
    label: "whale · $20m",
    address: "0x4b296808f414ab3775889fa2863e1d73f958a58e",
    hint: "$20.9m USDY plus 5,893 mETH. Mature LP, fees above deposits.",
  },
  {
    slot: "healthy",
    label: "healthy · in-range",
    address: "0x90deceec188094f6f6c1ef446d843f70abfc92cb",
    hint: "Single USDY/mETH 0.05% position. In-range at 46%.",
  },
  {
    slot: "drifting",
    label: "drifting · edge",
    address: "0x7c6ef14f6890d0fda17fb8e4fb6f649f0355c3be",
    hint: "USDY/mETH 0.05%. Still in-range, but near the edge.",
  },
];

const SLOT_TONE: Record<DemoWallet["slot"], string> = {
  portfolio: "var(--lp-purple)",
  bleeding:  "var(--lp-bleed)",
  mixed:     "var(--lp-toxic)",
  whale:     "var(--lp-cobalt)",
  healthy:   "var(--lp-healthy)",
  drifting:  "var(--lp-toxic)",
};

function aggregate(positions: V3PositionRaw[]) {
  let totalDeposited = 0;
  let totalFees = 0;
  let totalNet = 0;
  let bleeding = 0;
  let drift = 0;
  let healthy = 0;

  for (const p of positions) {
    const deposited = parseFloat(p.depositedToken0) + parseFloat(p.depositedToken1);
    const fees = parseFloat(p.collectedFeesToken0) + parseFloat(p.collectedFeesToken1);
    totalDeposited += deposited;
    totalFees += fees;
    totalNet += fees - deposited;
    const h = classifyHealth(p);
    if (h === "red") bleeding++;
    else if (h === "amber") drift++;
    else healthy++;
  }

  return { totalDeposited, totalFees, totalNet, bleeding, drift, healthy };
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtRawDelta(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}m`
    : abs >= 1_000
      ? `${(abs / 1_000).toFixed(1)}k`
      : abs.toFixed(2);
  return `${n < 0 ? "-" : "+"}${formatted}`;
}

function fmtPctBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

function riskTierLabel(risk?: PortfolioRisk): string {
  if (!risk) return "—";
  if (risk.riskTier >= 2) return "Bleeding";
  if (risk.riskTier >= 1) return "Drifting";
  return "Healthy";
}

function riskTierTone(risk?: PortfolioRisk): "pos" | "toxic" | "bleed" | undefined {
  if (!risk) return undefined;
  if (risk.riskTier >= 2) return "bleed";
  if (risk.riskTier >= 1) return "toxic";
  return "pos";
}

function recommendedActionLabel(action?: number): string {
  switch (action) {
    case 2: return "Migrate / rebalance";
    case 1: return "Review soon";
    default: return "Hold / monitor";
  }
}

export function Atlas() {
  const { address: connectedAddress } = useAccount();
  const [address, setAddress]   = useState(connectedAddress ?? "");
  const [submitted, setSubmitted] = useState<string | null>(connectedAddress ?? null);
  const [activeSlot, setActiveSlot] = useState<DemoWallet["slot"] | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["positions", submitted],
    queryFn:  () => fetchPositions(submitted!),
    enabled:  !!submitted,
  });

  const positions  = data?.positions ?? [];
  const stats      = aggregate(positions);
  const hasResults = !!(submitted && !isLoading && !error && positions.length > 0);

  function handleScan(addr: string) {
    const next = addr.trim();
    if (!next) return;
    setActiveSlot(null);
    setSubmitted(next);
  }

  return (
    <div className="atlas-theme">
      <AppHeader />

      <div className="atlas-shell">

        {/* ── Scan bar ── */}
        <section className="atlas-scan-bar">
          <div className="atlas-scan-eyebrow">
            <span className="lp-sticker lp-sticker-lime">ATLAS · WALLET SCANNER</span>
          </div>

          <form
            className="atlas-scan-form"
            onSubmit={(e) => { e.preventDefault(); handleScan(address); }}
          >
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x... wallet address or ENS"
              className="atlas-scan-input"
              spellCheck={false}
              autoComplete="off"
              aria-label="Wallet address"
            />
            <button
              type="submit"
              disabled={!address.trim()}
              className="atlas-scan-submit"
            >
              Scan
            </button>
          </form>

          <div className="atlas-demo-meta">
            <span className="atlas-demo-kicker">Demo wallets</span>
            <div className="atlas-demo-copy-wrap">
              <div className="atlas-demo-headline">Pick a preset health state.</div>
              <span className="atlas-demo-copy">Curated wallets that auto-fill and run Atlas instantly.</span>
            </div>
          </div>

          <div className="atlas-demo-row" role="group" aria-label="Preset demo wallets">
            {CURATED_DEMO_WALLETS.map((w) => (
              <button
                key={w.slot}
                type="button"
                title={w.hint}
                onClick={() => {
                  setActiveSlot(w.slot);
                  setAddress(w.address);
                  setSubmitted(w.address);
                }}
                className={`atlas-demo-chip${activeSlot === w.slot ? " atlas-demo-chip--active" : ""}`}
              >
                <span
                  className="atlas-demo-chip-dot"
                  style={{ background: SLOT_TONE[w.slot] }}
                  aria-hidden
                />
                {w.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Scoreboard (results only) ── */}
        {hasResults && (
          <>
            {data?.portfolioRisk && (
              <section className="atlas-scoreboard lp-window" aria-label="Portfolio risk summary">
                <div className="lp-window-bar">
                  <div className="lp-window-dots" aria-hidden>
                    <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
                    <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
                    <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", flex: 1, alignItems: "center" }}>
                    <span className="lp-window-title">
                      PORTFOLIO HEALTH · {submitted ? shortAddr(submitted) : ""}
                    </span>
                    <button
                      className="lp-btn-primary"
                      style={{ padding: "4px 10px", fontSize: 10 }}
                      title="Portfolio-level SSE diagnosis — triggers scan → correlate → simulate pipeline across all positions"
                      onClick={() => alert(`Portfolio-level diagnosis for ${positions.length} positions:\n\nThis triggers the full 6-agent pipeline:\n  Scan → Correlate → Simulate → Optimize → Execute\n\nPortfolio-wide SSE stream is in active development.`)}
                    >
                      Diagnose Entire Portfolio
                    </button>
                  </div>
                </div>
                <div className="atlas-score-strip">
                  <AggStat label="RISK TIER" value={riskTierLabel(data.portfolioRisk)} sub={recommendedActionLabel(data.portfolioRisk.recommendedAction)} tone={riskTierTone(data.portfolioRisk)} />
                  <AggStat label="FEE GAP" value={fmtRawDelta(stats.totalNet)} sub="fees - deposits (raw token sum)" tone={stats.totalNet >= 0 ? "pos" : "bleed"} />
                  <AggStat label="CORRELATED" value={fmtPctBps(data.portfolioRisk.metrics.correlatedExposureBps)} sub="ETH cluster exposure" tone="toxic" />
                  <AggStat label="CONCENTRATION" value={fmtPctBps(data.portfolioRisk.metrics.concentrationBps)} sub="largest position share" tone="toxic" />
                  <AggStat label="DUST" value={String(data.portfolioRisk.metrics.dustPositions)} sub="positions under threshold" tone={data.portfolioRisk.metrics.dustPositions > 0 ? "toxic" : "pos"} isLast />
                </div>
              </section>
            )}

            <section className="atlas-scoreboard lp-window" aria-label="Wallet health scoreboard">
              <div className="lp-window-bar">
                <div className="lp-window-dots" aria-hidden>
                  <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
                  <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
                  <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
                </div>
                <span className="lp-window-title">
                  POSITION MIX · {submitted ? shortAddr(submitted) : ""}
                </span>
              </div>
              <div className="atlas-score-strip">
                <AggStat label="DEPOSITED"    value={fmtUsd(stats.totalDeposited)} sub="token0 + token1" />
                <AggStat label="FEES"         value={fmtUsd(stats.totalFees)}      sub="lifetime collected" tone={stats.totalFees > 0 ? "pos" : undefined} />
                <AggStat label="HEALTHY"      value={String(stats.healthy)}        sub="in-range positions" tone="pos" />
                <AggStat label="DRIFTING"     value={String(stats.drift)}          sub="needs review"       tone="toxic" />
                <AggStat label="BLEEDING"     value={String(stats.bleeding)}       sub="recommend migrate"  tone="bleed" isLast />
              </div>
            </section>

            {/* Correlation matrix + rebalance proposal (real data from portfolioRisk) */}
            {data?.portfolioRisk && data.portfolioRisk.metrics.totalPositions > 1 && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 0.8fr) 1fr", gap: 16 }}>
                <CorrelationMatrix positions={positions} />
                <RebalanceProposal portfolioRisk={data.portfolioRisk} positions={positions} />
              </div>
            )}
          </>
        )}

        {/* ── State branch ── */}
        {!submitted ? (
          <AtlasIdlePanel />
        ) : isLoading ? (
          <AtlasLoadingPanel submitted={submitted} />
        ) : error ? (
          <AtlasErrorPanel
            message={(error as Error).message}
            onRetry={() => void refetch()}
          />
        ) : positions.length === 0 ? (
          <AtlasEmptyPanel />
        ) : (
          <>
            <div className="atlas-results-head">
              <h2 className="atlas-results-title">
                {positions.length} Position{positions.length === 1 ? "" : "s"}
              </h2>
              <span className="atlas-results-note">
                click any card to stream Diagnose for that tokenId
              </span>
            </div>
            <section className="atlas-position-grid" aria-label="Liquidity positions">
              {positions.map((p) => (
                <PositionCard key={p.id} position={p} />
              ))}
            </section>
          </>
        )}

      </div>
    </div>
  );
}

/* ── Mascot PNG ──────────────────────────────────────────────────── */
function Mascot({ n, size = 140, bob = false }: { n: number; size?: number; bob?: boolean }) {
  return (
    <img
      src={`/mascots/mascot${n}.webp`}
      width={size}
      height={size}
      className={bob ? "lp-mascot-bob" : undefined}
      style={{ display: "block", objectFit: "contain" }}
      role="presentation"
      aria-hidden
    />
  );
}

/* ── State panels ────────────────────────────────────────────────── */
function AtlasIdlePanel() {
  return (
    <div className="lp-window" aria-label="Awaiting wallet">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">ATLAS OUTPUT</span>
      </div>
      <div className="lp-window-body atlas-state-panel">
        <div className="atlas-state-mascot-row">
          <Mascot n={2} size={140} bob />
          <div className="lp-speech-bubble atlas-speech-bubble" data-tail="tl" style={{ maxWidth: 300 }}>
            <p>Paste a wallet.<br />I'll find the bleed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AtlasLoadingPanel({ submitted }: { submitted: string }) {
  return (
    <div className="lp-window" aria-label="Loading positions">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">QUERYING SUBGRAPH</span>
      </div>
      <div className="lp-window-body atlas-state-panel">
        <div className="atlas-state-mascot-row">
          <Mascot n={5} size={140} bob />
          <div className="lp-speech-bubble atlas-speech-bubble" data-tail="tl" style={{ maxWidth: 320 }}>
            <p>Scanning <Mono>{shortAddr(submitted)}</Mono>…</p>
          </div>
        </div>
        <div className="atlas-skeleton-grid" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function AtlasErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="lp-window" aria-label="Error">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">SCANNER FAILED</span>
      </div>
      <div className="lp-window-body atlas-state-panel">
        <div className="atlas-state-mascot-row">
          <Mascot n={8} size={140} />
          <div className="lp-speech-bubble atlas-speech-bubble" data-tail="tl" style={{ maxWidth: 360 }}>
            <p>Lookup failed: <Mono>{message}</Mono></p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="lp-btn-ghost"
          style={{ padding: "10px 22px", fontSize: 12 }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function AtlasEmptyPanel() {
  return (
    <div className="lp-window" aria-label="No positions found">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">ATLAS OUTPUT</span>
      </div>
      <div className="lp-window-body atlas-state-panel">
        <div className="atlas-state-mascot-row">
          <Mascot n={7} size={140} />
          <div className="lp-speech-bubble atlas-speech-bubble" data-tail="tl" style={{ maxWidth: 300 }}>
            <p>Nothing staked yet.<br />Try a demo wallet above.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
