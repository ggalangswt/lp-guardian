import type { V3PositionRaw } from "../lib/api.js";
import { LabelBadge } from "./LabelBadge.js";

interface Props {
  positions: V3PositionRaw[];
}

type AssetClass = "ETH" | "BTC" | "STABLE" | "L2" | "OTHER";

const ETH_TOKENS   = new Set(["WETH","ETH","WSTETH","STETH","RETH","CBETH","WEETH","EZETH","PUFETH"]);
const BTC_TOKENS   = new Set(["WBTC","TBTC","CBBTC","BTCB"]);
const STABLE_TOKENS= new Set(["USDC","USDT","DAI","FRAX","LUSD","USDE","USDBC","CRVUSD","MKUSD","GHO","SUSD","TUSD","BUSD","GUSD"]);
const L2_TOKENS    = new Set(["ARB","OP","MATIC","AVAX","SOL","GMX","GNS","RDNT","PENDLE"]);

function assetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/^W/, "W"); // keep as-is, set handles it
  if (ETH_TOKENS.has(s)) return "ETH";
  if (BTC_TOKENS.has(s)) return "BTC";
  if (STABLE_TOKENS.has(s)) return "STABLE";
  if (L2_TOKENS.has(s)) return "L2";
  return "OTHER";
}

function pairCorrelation(a: AssetClass, b: AssetClass): number {
  if (a === b) return a === "STABLE" ? 0.97 : 0.84;
  const pair = [a, b].sort().join("-");
  switch (pair) {
    case "ETH-L2":     return 0.68;
    case "BTC-ETH":    return 0.48;
    case "BTC-L2":     return 0.42;
    case "ETH-OTHER":  return 0.38;
    case "L2-OTHER":   return 0.32;
    case "BTC-OTHER":  return 0.28;
    case "OTHER-OTHER":return 0.25;
    default:           return 0.06; // anything vs STABLE
  }
}

function heatColor(val: number, isDiagonal: boolean): string {
  if (isDiagonal) return "var(--lp-base)";
  if (val > 0.80) return "color-mix(in oklch, var(--lp-bleed) 55%, transparent)";
  if (val > 0.60) return "color-mix(in oklch, var(--lp-toxic) 55%, transparent)";
  if (val > 0.30) return "color-mix(in oklch, var(--lp-healthy) 28%, transparent)";
  return "color-mix(in oklch, var(--lp-base-deep) 45%, transparent)";
}

export function CorrelationMatrix({ positions }: Props) {
  // Collect unique token symbols from the portfolio (cap at 6 for display)
  const symbolSet = new Set<string>();
  for (const p of positions) {
    symbolSet.add(p.pool.token0.symbol);
    symbolSet.add(p.pool.token1.symbol);
  }
  const assets = [...symbolSet].slice(0, 6);

  if (assets.length < 2) {
    return (
      <section className="atlas-scoreboard lp-window" aria-label="Correlation Matrix">
        <div className="lp-window-bar">
          <div className="lp-window-dots" aria-hidden>
            <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
            <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
            <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
          </div>
          <span className="lp-window-title">TOKEN CORRELATION</span>
        </div>
        <div style={{ padding: "20px", color: "var(--lp-ink-soft)", fontSize: 13 }}>
          Need ≥ 2 distinct tokens to compute correlation.
        </div>
      </section>
    );
  }

  const classes = assets.map(assetClass);

  return (
    <section className="atlas-scoreboard lp-window" aria-label="Correlation Matrix">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden>
          <span className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <span className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <span className="lp-window-title">TOKEN CORRELATION</span>
          <LabelBadge label="ESTIMATED" />
        </div>
      </div>

      <div style={{ padding: "20px" }}>
        <p style={{ margin: "0 0 16px", color: "var(--lp-ink-soft)", fontSize: 13, lineHeight: 1.5 }}>
          Asset-class correlation for the {assets.length} tokens in this portfolio.
          High correlation (&gt;0.8) means concentrated exposure to one market regime.
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: `44px repeat(${assets.length}, 1fr)`,
          gap: 3,
        }}>
          {/* Header row */}
          <div />
          {assets.map((a) => (
            <div
              key={a}
              style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--lp-ink-ghost)", paddingBottom: 2 }}
            >
              {a.length > 5 ? a.slice(0, 5) : a}
            </div>
          ))}

          {/* Matrix rows */}
          {assets.map((rowAsset, i) => (
            <div key={rowAsset} style={{ display: "contents" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 10, fontWeight: 600, color: "var(--lp-ink-ghost)" }}>
                {rowAsset.length > 5 ? rowAsset.slice(0, 5) : rowAsset}
              </div>
              {assets.map((_, j) => {
                const val = i === j ? 1 : pairCorrelation(classes[i], classes[j]);
                return (
                  <div
                    key={`${i}-${j}`}
                    title={`${assets[i]} / ${assets[j]}: ${val.toFixed(2)}`}
                    style={{
                      background: heatColor(val, i === j),
                      border: "1px solid var(--lp-border-soft)",
                      borderRadius: 3,
                      padding: "8px 4px",
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: i === j ? "var(--lp-ink-faint)" : "var(--lp-ink)",
                    }}
                  >
                    {val.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <p style={{ marginTop: 12, fontSize: 10, color: "var(--lp-ink-ghost)", lineHeight: 1.4 }}>
          Correlation derived from asset-class heuristics (ETH / BTC / Stable / L2).
        </p>
      </div>
    </section>
  );
}
