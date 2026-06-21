import { type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader.js";
import { Cap } from "../design/atoms.js";
import "../styles/landing.css";
import "../styles/deck.css";

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

function SlideStage({
  variant = "plain",
  children,
}: {
  variant?: "plain" | "band";
  children: ReactNode;
}) {
  return (
    <div className="deck-viewport">
      <div className={`deck-slide deck-slide--${variant}`}>
        <div className="deck-slide-frame">{children}</div>
      </div>
    </div>
  );
}

/* ─── Data ──────────────────────────────────────────────────────────── */

const PHASES = [
  { n: "01", name: "position.resolve",           label: "VERIFIED",  color: "var(--lp-cobalt)" },
  { n: "02", name: "swap.replay",                label: "COMPUTED",  color: "var(--lp-purple)" },
  { n: "03", name: "il.reconstruct",             label: "COMPUTED",  color: "var(--lp-purple)" },
  { n: "04", name: "regime.classify",            label: "ESTIMATED", color: "var(--lp-toxic)" },
  { n: "05", name: "correlation.matrix",         label: "COMPUTED",  color: "var(--lp-purple)" },
  { n: "06", name: "strategy.simulate",          label: "COMPUTED",  color: "var(--lp-purple)" },
  { n: "07", name: "proposal.preview",           label: "COMPUTED",  color: "var(--lp-purple)" },
  { n: "08", name: "report.publish (IPFS)",      label: "VERIFIED",  color: "var(--lp-cobalt)" },
  { n: "09", name: "anchor.mantle",              label: "VERIFIED",  color: "var(--lp-cobalt)" },
  { n: "10", name: "nitro.attest",               label: "VERIFIED",  color: "var(--lp-cobalt)" },
];

const STACK = [
  { name: "Mantle",        role: "L2 settlement, Turing registry, agent decisions, and report anchors", variant: "cobalt" as StickerVariant },
  { name: "Byreal Skills", role: "Scout, Strategist, Executor, Sentinel callable by agent wallets", variant: "yellow" as StickerVariant },
  { name: "ElizaOS",       role: "Agent orchestration, memory, characters, and action handlers", variant: "purple" as StickerVariant },
  { name: "AWS Nitro",     role: "Off-chain enclave attestation, signed back to Mantle", variant: "cobalt" as StickerVariant },
  { name: "FastAPI",       role: "Python portfolio math service for simulation and optimization", variant: "magenta" as StickerVariant },
  { name: "Merchant Moe",  role: "Primary Mantle LP source for positions, pools, and ticks", variant: "purple" as StickerVariant },
  { name: "Bybit + Chainlink", role: "Price feeds, trading signals, and oracle checks", variant: "cobalt" as StickerVariant },
  { name: "Solidity",      role: "LPGuardianTuringRegistry, Permit2Bundler, and TEEAnchor", variant: "magenta" as StickerVariant },
];

const INTEGRATIONS = [
  {
    index: "A",
    title: "IPFS report artifact",
    body: "Every diagnosis publishes a JSON report artifact. The returned CID is the first verification path — anyone can re-fetch it without LP Guardian's server.",
    color: "var(--lp-cobalt)",
  },
  {
    index: "B",
    title: "Mantle Turing anchor",
    body: "After publishing, the agent records decision and report hashes in LPGuardianTuringRegistry on Mantle. The tx hash becomes the second verification path.",
    color: "var(--lp-cobalt)",
  },
  {
    index: "C",
    title: "AWS Nitro attestation",
    body: "The verdict is synthesized inside AWS Nitro Enclaves. The enclave signs the report hash before the agent anchors the decision on Mantle.",
    color: "var(--lp-cobalt)",
  },
  {
    index: "D",
    title: "ERC-8004-style agent identity",
    body: "LP Guardian records agent decisions and outcomes on Mantle, creating a benchmark trail for Scout, Strategist, Executor, and Sentinel.",
    color: "var(--lp-magenta)",
  },
];

const VERIFY_PATHS = [
  { id: "A", label: "IPFS CID",        method: "Re-fetch report, hash the JSON, compare rootHash" },
  { id: "B", label: "Mantle anchor tx", method: "Read registry event, extract reportHash and scenarioHash" },
  { id: "C", label: "REST report cache",  method: "Fetch by rootHash from LP Guardian API and compare anchor fields" },
  { id: "D", label: "AWS Nitro quote",    method: "Verify enclave attestation against signed report hash" },
  { id: "E", label: "Turing outcome",     method: "Compare decisionId outcome score with report hash" },
];

/* ─── Page ──────────────────────────────────────────────────────────── */

export function Deck() {
  return (
    <div className="landing-theme deck-page">
      <AppHeader />

      <div className="deck-stack">
        <div className="lp-grid-bg" />

        {/* ── Slide 1: Hero ─────────────────────────────────────────────── */}
        <SlideStage variant="plain">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StickerBadge variant="yellow" style={{ transform: "rotate(-1.5deg)" }}>
              THE TURING TEST HACKATHON 2026
            </StickerBadge>
            <StickerBadge variant="cobalt">SUBMISSION DECK</StickerBadge>
          </div>

          <h1
            style={{
              margin: "0 0 24px",
              fontFamily: "var(--font-display)",
              fontSize: 144,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              lineHeight: 0.9,
              color: "var(--lp-ink)",
            }}
          >
            LP Guardian
          </h1>

          <p
            style={{
              maxWidth: "60ch",
              margin: "0 0 16px",
              color: "var(--lp-ink-soft)",
              fontSize: 22,
              lineHeight: 1.55,
              fontWeight: 400,
            }}
          >
            An AI quant agent for Mantle LP portfolios. It explains why yield is bleeding,
            simulates strategy actions across Merchant Moe, Agni, and Fluxion data,
            then publishes a verifiable decision trail anchored to Mantle.
          </p>

          <div className="lp-action-row" style={{ marginTop: 32 }}>
            <Link
              to="/atlas"
              className="lp-btn-primary"
              style={{ textDecoration: "none" }}
            >
              Try it live <PixelArrow />
            </Link>
            <Link
              to="/agent"
              className="lp-btn-ghost"
              style={{ textDecoration: "none" }}
            >
              View Agent <PixelArrow />
            </Link>
          </div>
        </SlideStage>

        {/* ── Slide 2: Problem ──────────────────────────────────────────── */}
        <SlideStage variant="band">
          <Cap style={{ marginBottom: 16 }}>THE PROBLEM</Cap>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {[
              {
                n: "01",
                heading: "LP positions bleed quietly.",
                body: "A Mantle LP portfolio can drift out of range, collect weak fees, and accumulate impermanent loss while every dashboard still shows it as \"active.\" The bleed is invisible without strategy-level inspection.",
                color: "var(--lp-bleed)",
              },
              {
                n: "02",
                heading: "Dashboards flatten the data.",
                body: "Portfolio dashboards aggregate — they do not decompose IL, reconstruct market regime, or compare LP yield against mETH, USDY, Bybit signals, and Chainlink data.",
                color: "var(--lp-toxic)",
              },
              {
                n: "03",
                heading: "Migration is guesswork.",
                body: "Rebalancing without a simulated decision trail means choosing blind. Most LPs cannot prove why an agent recommended hold, monitor, rebalance, or exit.",
                color: "var(--lp-purple)",
              },
            ].map((c) => (
              <div
                key={c.n}
                style={{
                  padding: "28px 24px",
                  border: "2px solid var(--lp-border)",
                  borderRadius: 3,
                  background: "var(--lp-base)",
                  boxShadow: "4px 4px 0 var(--lp-border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: c.color,
                    marginBottom: 12,
                    letterSpacing: "0.06em",
                  }}
                >
                  {c.n}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    marginBottom: 12,
                    lineHeight: 1.15,
                  }}
                >
                  {c.heading}
                </div>
                <p style={{ margin: 0, fontSize: 16, color: "var(--lp-ink-soft)", lineHeight: 1.6 }}>
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </SlideStage>

        {/* ── Slide 3: Solution ─────────────────────────────────────────── */}
        <SlideStage variant="plain">
          <Cap style={{ marginBottom: 16 }}>THE SOLUTION</Cap>
          <h2
            style={{
              margin: "0 0 48px",
              fontFamily: "var(--font-display)",
              fontSize: 64,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--lp-ink)",
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
            }}
          >
            Diagnose. Simulate.{" "}
            <span style={{ color: "var(--lp-purple)" }}>Anchor.</span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 2,
              border: "2px solid var(--lp-border)",
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: "5px 5px 0 var(--lp-border)",
            }}
            className="lp-solution-grid"
          >
            {[
              {
                n: "1",
                title: "Diagnose",
                body: "Resolve Mantle LP positions. Reconstruct IL and fees from pool state. Classify portfolio regime. Assign honesty labels — VERIFIED, COMPUTED, ESTIMATED — to every output.",
                color: "var(--lp-purple)",
              },
              {
                n: "2",
                title: "Simulate",
                body: "Run correlation, optimization, and scenario simulations through the Python service. Score projected fees, IL, risk concentration, and gas before recommending any action.",
                color: "var(--lp-magenta)",
              },
              {
                n: "3",
                title: "Anchor",
                body: "Sign the verdict inside AWS Nitro. Publish the report artifact. Anchor decision and outcome hashes on Mantle. Multiple independent verification paths, one rootHash.",
                color: "var(--lp-cobalt)",
              },
            ].map((c, i) => (
              <div
                key={c.n}
                style={{
                  padding: "40px 32px",
                  borderRight: i < 2 ? "2px solid var(--lp-border)" : "none",
                  background: i % 2 === 0
                    ? "var(--lp-base)"
                    : "var(--lp-base-deep)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 72,
                    fontWeight: 700,
                    color: c.color,
                    lineHeight: 1,
                    marginBottom: 20,
                    opacity: 0.25,
                  }}
                >
                  {c.n}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    marginBottom: 14,
                  }}
                >
                  {c.title}
                </div>
                <p style={{ margin: 0, fontSize: 16, color: "var(--lp-ink-soft)", lineHeight: 1.65 }}>
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </SlideStage>

        {/* ── Slide 4: How it works — phases ────────────────────────────── */}
        <SlideStage variant="band">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(340px, 1fr) minmax(480px, 1.4fr)",
              gap: 80,
              alignItems: "center",
            }}
            className="lp-how-grid"
          >
            <div>
              <Cap style={{ marginBottom: 14 }}>HOW IT WORKS · 10 PHASES</Cap>
              <h2
                style={{
                  margin: "0 0 20px",
                  fontFamily: "var(--font-display)",
                  fontSize: 48,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--lp-ink)",
                  lineHeight: 0.95,
                  letterSpacing: "-0.01em",
                }}
              >
                Every phase is visible. Every output is labeled.
              </h2>
              <p style={{ margin: 0, fontSize: 16, color: "var(--lp-ink-soft)", lineHeight: 1.6 }}>
                No black box. Each diagnostic phase is streamed live and tagged with an
                honesty label: VERIFIED (chain-sourced), COMPUTED (deterministic math),
                ESTIMATED (model-informed), EMULATED (simulation), or LABELED (human-tagged).
              </p>
            </div>

            <WindowPanel title="diagnostic.stream">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PHASES.map((p) => (
                  <div
                    key={p.n}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      padding: "4px 0",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--lp-ink-ghost)",
                        minWidth: 22,
                      }}
                    >
                      {p.n}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 14,
                        color: "var(--lp-ink-soft)",
                        flex: 1,
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: p.color,
                      }}
                    >
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
            </WindowPanel>
          </div>
        </SlideStage>

        {/* ── Slide 5: Tech stack ───────────────────────────────────────── */}
        <SlideStage variant="plain">
          <Cap style={{ marginBottom: 16 }}>TECH STACK</Cap>
          <h2
            style={{
              margin: "0 0 40px",
              fontFamily: "var(--font-display)",
              fontSize: 52,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--lp-ink)",
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
            }}
          >
            Eight instruments, one pipeline.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
            }}
          >
            {STACK.map((s) => (
              <div
                key={s.name}
                style={{
                  padding: "20px 20px",
                  border: "2px solid var(--lp-border)",
                  borderRadius: 3,
                  background: "var(--lp-base)",
                  boxShadow: "3px 3px 0 var(--lp-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <StickerBadge variant={s.variant}>{s.name}</StickerBadge>
                <p style={{ margin: 0, fontSize: 14, color: "var(--lp-ink-soft)", lineHeight: 1.5 }}>
                  {s.role}
                </p>
              </div>
            ))}
          </div>
        </SlideStage>

        {/* ── Slide 6: Integration Points ───────────────────────────────────────────── */}
        {/* TODO(arch): Revise integration points after backend redesign */}
        <SlideStage variant="band">
          <Cap style={{ marginBottom: 16 }}>WHY MANTLE · 4 INTEGRATION POINTS</Cap>
          <h2
            style={{
              margin: "0 0 36px",
              fontFamily: "var(--font-display)",
              fontSize: 48,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--lp-ink)",
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
            }}
          >
            Mantle is not a badge.{" "}
            <span style={{ color: "var(--lp-cobalt)" }}>It is the agent benchmark path.</span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            {INTEGRATIONS.map((g) => (
              <div
                key={g.index}
                style={{
                  padding: "24px 20px",
                  border: "2px solid var(--lp-border)",
                  borderRadius: 3,
                  background: "var(--lp-base)",
                  boxShadow: "4px 4px 0 var(--lp-border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: 700,
                    color: g.color,
                    marginBottom: 12,
                    letterSpacing: "0.06em",
                  }}
                >
                  {g.index}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    marginBottom: 10,
                    lineHeight: 1.2,
                  }}
                >
                  {g.title}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--lp-ink-soft)", lineHeight: 1.6 }}>
                  {g.body}
                </p>
              </div>
            ))}
          </div>
        </SlideStage>

        {/* ── Slide 7: Verification paths ───────────────────────────────── */}
        <SlideStage variant="plain">
          <Cap style={{ marginBottom: 16 }}>VERIFICATION · 5 PATHS, ONE ROOTHASH</Cap>
          <h2
            style={{
              margin: "0 0 36px",
              fontFamily: "var(--font-display)",
              fontSize: 52,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--lp-ink)",
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
            }}
          >
            No LP Guardian server in the trust path.
          </h2>
          <WindowPanel title="verification.matrix">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 2fr",
                fontFamily: "var(--font-mono)",
                fontSize: 14,
              }}
            >
              {["ID", "PATH", "METHOD"].map((h) => (
                <div
                  key={h}
                  style={{
                    padding: "10px 16px",
                    background: "var(--lp-base-deep)",
                    borderBottom: "1.5px solid var(--lp-border)",
                    fontSize: 11,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "var(--lp-ink-ghost)",
                    borderRight: h !== "METHOD" ? "1px solid var(--lp-border-soft)" : "none",
                  }}
                >
                  {h}
                </div>
              ))}
              {VERIFY_PATHS.map(({ id, label, method }, i) => (
                <>
                  <div
                    key={`id-${id}`}
                    style={{
                      padding: "14px 16px",
                      borderBottom: i < VERIFY_PATHS.length - 1 ? "1px solid var(--lp-border-soft)" : "none",
                      borderRight: "1px solid var(--lp-border-soft)",
                      fontWeight: 700,
                      color: "var(--lp-cobalt)",
                      background: i % 2 === 0 ? "transparent" : "color-mix(in oklch, var(--lp-purple) 2%, transparent)",
                    }}
                  >
                    {id}
                  </div>
                  <div
                    key={`label-${id}`}
                    style={{
                      padding: "14px 16px",
                      borderBottom: i < VERIFY_PATHS.length - 1 ? "1px solid var(--lp-border-soft)" : "none",
                      borderRight: "1px solid var(--lp-border-soft)",
                      color: "var(--lp-ink)",
                      background: i % 2 === 0 ? "transparent" : "color-mix(in oklch, var(--lp-purple) 2%, transparent)",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    key={`method-${id}`}
                    style={{
                      padding: "14px 16px",
                      borderBottom: i < VERIFY_PATHS.length - 1 ? "1px solid var(--lp-border-soft)" : "none",
                      color: "var(--lp-ink-faint)",
                      background: i % 2 === 0 ? "transparent" : "color-mix(in oklch, var(--lp-purple) 2%, transparent)",
                    }}
                  >
                    {method}
                  </div>
                </>
              ))}
            </div>
          </WindowPanel>
        </SlideStage>

        {/* ── Slide 8: CTA ──────────────────────────────────────────────── */}
        <SlideStage variant="band">
          <div style={{ textAlign: "center" }}>
            <StickerBadge variant="yellow" style={{ marginBottom: 24, transform: "rotate(-2deg)", display: "inline-block" }}>
              LIVE ON TESTNET
            </StickerBadge>
            <h2
              style={{
                margin: "0 0 20px",
                fontFamily: "var(--font-display)",
                fontSize: 72,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--lp-ink)",
                lineHeight: 0.95,
                letterSpacing: "-0.01em",
              }}
            >
              Run a real diagnosis.
            </h2>
            <p style={{ margin: "0 auto 32px", maxWidth: "48ch", fontSize: 18, color: "var(--lp-ink-soft)", lineHeight: 1.6 }}>
              Paste a Mantle LP wallet or use one of six curated demo portfolios.
              The interface follows the Turing Test stack even while backend migration continues.
            </p>
            <div className="lp-action-row" style={{ justifyContent: "center" }}>
              <Link
                to="/atlas"
                className="lp-btn-primary"
                style={{ textDecoration: "none" }}
              >
                Open the Atlas <PixelArrow />
              </Link>
              <Link
                to="/roadmap"
                className="lp-btn-ghost"
                style={{ textDecoration: "none" }}
              >
                View Roadmap <PixelArrow />
              </Link>
            </div>
          </div>
        </SlideStage>
      </div>
    </div>
  );
}
