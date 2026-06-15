import { type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader.js";
import { Cap } from "../design/atoms.js";
import "../styles/landing.css";

/* ─── Inline primitives ─────────────────────────────────────────────── */

type StickerVariant = "purple" | "magenta" | "cobalt" | "yellow";

function StickerBadge({
  children,
  variant = "purple",
  style,
}: {
  children: ReactNode;
  variant?: StickerVariant;
  style?: CSSProperties;
}) {
  return (
    <span className={`lp-sticker lp-sticker-${variant}`} style={style}>
      {children}
    </span>
  );
}

function WindowPanel({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="lp-window" style={style}>
      <div className="lp-window-bar">
        <div className="lp-window-dots">
          <div className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
          <div className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
          <div className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
        </div>
        <span className="lp-window-title">{title}</span>
      </div>
      <div className="lp-window-body">{children}</div>
    </div>
  );
}

function PixelArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M2.5 6.5h8M7 2.5l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/* ─── Data ──────────────────────────────────────────────────────────── */

const PHASES = [
  {
    phase: "NOW",
    version: "v0.1 · Robinhood Chain",
    label: "SHIPPED",
    labelVariant: "healthy" as const,
    accent: "var(--lp-healthy)",
    sticker: "yellow" as StickerVariant,
    stickerText: "LIVE",
    description: "Hackathon demo on Robinhood Chain. Core diagnostic pipeline is running end-to-end with real chain data and live write-paths.",
    items: [
      { done: true,  text: "LP NFT resolution from Uniswap subgraph" },
      { done: true,  text: "IL reconstruction from tick range + sqrtPriceX96" },
      { done: true,  text: "Pool regime classification" },
      { done: true,  text: "V4 hook discovery + swap replay (1k swaps)" },
      { done: true,  text: "Migration preview with Permit2 bundle" },
      // TODO(arch): TEE — revise after backend redesign
      { done: true,  text: "Verdict synthesis inside TEE" },
      // TODO(arch): Storage — revise after backend redesign
      { done: true,  text: "Report upload to IPFS/Storage" },
      { done: true,  text: "On-chain anchor tx on Robinhood Chain" },
      { done: true,  text: "ERC-7857 iNFT — memoryRoot + reputation + counter" },
      { done: true,  text: "MCP server: 5 product tools + ping" },
      { done: true,  text: "Atlas wallet scanner + 6 demo wallets" },
      { done: true,  text: "Five verification paths from one rootHash" },
    ],
  },
  {
    phase: "NEXT",
    version: "v0.2 · Execution Expansion",
    label: "PLANNED",
    labelVariant: "cobalt" as const,
    accent: "var(--lp-cobalt)",
    sticker: "cobalt" as StickerVariant,
    stickerText: "Q3 2026",
    description: "The base mainnet stack is already live. The next phase adds real execution, richer coverage, and broader monetization on top of the Robinhood Chain deployment.",
    items: [
      { done: false, text: "Real Permit2 migration execution (not preview-only)" },
      { done: false, text: "Expanded V4 hook registry: 10+ hook families" },
      { done: false, text: "Batch diagnosis: scan full wallet in one run" },
      { done: false, text: "Range re-entry signals: alert when out-of-range positions can be rebalanced profitably" },
      { done: false, text: "mintLicense revenue live: 0.1 ETH / 24h with 80/20 split" },
      { done: false, text: "Expanded mainnet agent monetization + license flows" },
      { done: false, text: "Diagnose history: per-wallet report timeline" },
      { done: false, text: "IPFS pinning for all anchored reports" },
    ],
  },
  {
    phase: "FUTURE",
    version: "v1.0 · Agent Economy",
    label: "VISION",
    labelVariant: "purple" as const,
    accent: "var(--lp-purple)",
    sticker: "magenta" as StickerVariant,
    stickerText: "VISION",
    description: "Multi-protocol diagnostics, agent marketplace, and DAO-grade reporting. LP Guardian as infrastructure, not just a tool.",
    items: [
      { done: false, text: "Multi-protocol: Aerodrome, Orca, Ambient Finance" },
      { done: false, text: "Cross-chain: Arbitrum, Base, Optimism LP support" },
      { done: false, text: "Agent marketplace: other agents calling LP Guardian via MCP" },
      { done: false, text: "DAO reporting: batch reports for protocol treasuries" },
      { done: false, text: "Report subscriptions: daily / weekly LP health digest" },
      { done: false, text: "Reputation-gated reports: higher reputation = higher report trust tier" },
      { done: false, text: "Custom hook scoring: protocol teams register their own hooks" },
      { done: false, text: "On-chain voting: DAO can ratify migration proposals from LP Guardian reports" },
    ],
  },
];

type LabelVariant = "healthy" | "cobalt" | "purple";

const LABEL_STYLE: Record<LabelVariant, CSSProperties> = {
  healthy: {
    color: "var(--lp-healthy)",
    border: "1px solid var(--lp-healthy)",
    background: "color-mix(in oklch, var(--lp-healthy) 10%, transparent)",
  },
  cobalt: {
    color: "var(--lp-cobalt)",
    border: "1px solid var(--lp-cobalt)",
    background: "color-mix(in oklch, var(--lp-cobalt) 10%, transparent)",
  },
  purple: {
    color: "var(--lp-purple)",
    border: "1px solid var(--lp-purple)",
    background: "color-mix(in oklch, var(--lp-purple) 10%, transparent)",
  },
};

/* ─── Page ──────────────────────────────────────────────────────────── */

export function Roadmap() {
  return (
    <div className="landing-theme" style={{ minHeight: "100vh" }}>
      <div className="lp-grid-bg" />

      <AppHeader />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "64px 36px 56px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <Cap style={{ marginBottom: 12 }}>ROADMAP · THREE PHASES</Cap>
        <h1
          style={{
            margin: "0 0 20px",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2.8rem, 6vw, 5.6rem)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            lineHeight: 0.95,
            color: "var(--lp-ink)",
          }}
        >
          Now. Next.{" "}
          <span style={{ color: "var(--lp-purple)" }}>Future.</span>
        </h1>
        <p
          style={{
            maxWidth: "56ch",
            margin: 0,
            color: "var(--lp-ink-soft)",
            fontSize: 15,
            lineHeight: 1.65,
          }}
        >
          LP Guardian is hackathon-native, but not hackathon-shaped. Phase 1 ships the
          full diagnostic pipeline on Robinhood Chain. Phase 2 focuses on execution
          and richer automation on top of that base.
          Phase 3 turns LP Guardian into infrastructure for the agent economy.
        </p>
      </section>

      {/* ── Phase timeline ────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0 36px 100px",
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {PHASES.map((phase, pi) => (
          <div key={phase.phase} style={{ position: "relative" }}>
            {/* Connector line */}
            {pi < PHASES.length - 1 && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 28,
                  top: "100%",
                  width: 2,
                  height: 24,
                  background: "var(--lp-border-soft)",
                  zIndex: 0,
                }}
              />
            )}

            <WindowPanel title={`roadmap.phase · ${phase.version}`}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 0.6fr) 1fr",
                  gap: 32,
                  alignItems: "start",
                }}
                className="lp-roadmap-phase-grid"
              >
                {/* Left: phase identity */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "clamp(3rem, 6vw, 5rem)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: phase.accent,
                        lineHeight: 1,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {phase.phase}
                    </span>
                    <StickerBadge variant={phase.sticker} style={{ transform: `rotate(${pi % 2 === 0 ? "-2deg" : "2deg"})` }}>
                      {phase.stickerText}
                    </StickerBadge>
                  </div>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 8px",
                      borderRadius: 2,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                      ...LABEL_STYLE[phase.labelVariant],
                    }}
                  >
                    {phase.label}
                  </span>

                  <p style={{ margin: 0, fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.65 }}>
                    {phase.description}
                  </p>
                </div>

                {/* Right: item list */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {phase.items.map((item) => (
                    <div
                      key={item.text}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "7px 10px",
                        border: "1.5px solid var(--lp-border-soft)",
                        borderRadius: 2,
                        background: item.done
                          ? "color-mix(in oklch, var(--lp-healthy) 5%, var(--lp-base))"
                          : "var(--lp-base)",
                      }}
                    >
                      <span
                        style={{
                          marginTop: 1,
                          width: 14,
                          height: 14,
                          borderRadius: 1,
                          border: item.done ? "none" : "1.5px solid var(--lp-border-mid)",
                          background: item.done ? "var(--lp-healthy)" : "transparent",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          color: "oklch(0.15 0.042 288)",
                          fontWeight: 800,
                        }}
                      >
                        {item.done ? "✓" : ""}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: item.done ? "var(--lp-ink)" : "var(--lp-ink-faint)",
                          lineHeight: 1.5,
                        }}
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </WindowPanel>
          </div>
        ))}
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section
        style={{
          background: "var(--lp-base-deep)",
          borderTop: "2px solid var(--lp-border)",
          padding: "72px 36px",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Cap style={{ marginBottom: 16 }}>PHASE 1 IS LIVE RIGHT NOW</Cap>
        <h2
          style={{
            margin: "0 0 20px",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.8rem, 4vw, 3.4rem)",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--lp-ink)",
            lineHeight: 0.95,
            letterSpacing: "-0.01em",
          }}
        >
          Diagnose a real position.
        </h2>
        <p style={{ margin: "0 auto 32px", maxWidth: "42ch", fontSize: 14, color: "var(--lp-ink-soft)", lineHeight: 1.6 }}>
          {/* TODO(arch): Storage labels */}
          The full pipeline is running on Robinhood Chain. Paste a tokenId or pick
          a demo wallet.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          <Link
            to="/atlas"
            className="lp-btn-primary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Open the Atlas <PixelArrow />
          </Link>
          <Link
            to="/deck"
            className="lp-btn-ghost"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            View the Deck <PixelArrow />
          </Link>
        </div>
      </section>
    </div>
  );
}
