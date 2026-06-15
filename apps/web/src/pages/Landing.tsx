import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader.js";
import { Cap, Mono } from "../design/atoms.js";
import "../styles/landing.css";

/* ── Live-stream phases shown in the hero window ──────────────────── */
const HERO_STREAM: { n: string; name: string; label: string }[] = [
  { n: "01", name: "position.resolve",          label: "VERIFIED" },
  { n: "02", name: "swap.replay",               label: "COMPUTED" },
  { n: "03", name: "il.reconstruct",            label: "COMPUTED" },
  { n: "04", name: "regime.classify",           label: "ESTIMATED" },
  { n: "05", name: "hooks.discover",            label: "LABELED" },
  { n: "06", name: "hook.replay (1k swaps)",    label: "COMPUTED" },
];

/* ── All 10 phases shown in the HOW section ───────────────────────── */
const ALL_PHASES: { n: string; name: string; label: string }[] = [
  { n: "01", name: "position.resolve",                   label: "VERIFIED" },
  { n: "02", name: "swap.replay",                        label: "COMPUTED" },
  { n: "03", name: "il.reconstruct",                     label: "COMPUTED" },
  { n: "04", name: "regime.classify",                    label: "ESTIMATED" },
  { n: "05", name: "hooks.discover",                     label: "LABELED" },
  { n: "06", name: "hook.replay (1k swaps)",             label: "COMPUTED" },
  { n: "07", name: "migration.preview",                  label: "COMPUTED" },
  { n: "08", name: "report.upload (IPFS)",               label: "VERIFIED" },
  { n: "09", name: "anchor.robinhood-chain",             label: "VERIFIED" },
  { n: "10", name: "verdict.synthesize (TEE)",           label: "VERIFIED" },
];

export function Landing() {
  const nav = useNavigate();

  return (
    <div className="landing-theme" style={{ minHeight: "100vh" }}>

      {/* ── 1 · Hero — centered poster ───────────────────────────────── */}
      <section className="lp-hero-section">
        <div className="lp-grid-bg" />
        <AppHeader />

        <div className="lp-hero-poster">
          {/* Event chip */}
          <div className="lp-hero-eyebrow">
            <StickerBadge variant="lime" style={{ transform: "rotate(-1.5deg)" }}>
              ARBITRUM OPEN HOUSE · LONDON · ROBINHOOD CHAIN
            </StickerBadge>
          </div>

          {/* Giant headline */}
          <h1 className="lp-hero-h1">
            LP<br />GUARDIAN
          </h1>

          {/* Speech bubble tagline */}
          <div className="lp-hero-bubble-row">
            <div className="lp-speech-bubble" data-tail="bl" style={{ maxWidth: 420 }}>
              <p style={{ margin: 0 }}>Guard your LP before it guards itself.</p>
            </div>
          </div>

          {/* Sub copy */}
          <p className="lp-hero-sub">
            Reads your Uniswap V3/V4 position, reconstructs IL, scores every V4 hook
            against the last 1&nbsp;000 mainnet swaps. 30 seconds. TEE&#8209;attested.
          </p>

          {/* CTAs */}
          <div className="lp-hero-ctas">
            <button className="lp-btn-primary" onClick={() => nav("/atlas")}>
              Open the Atlas <PixelArrow />
            </button>
            <button className="lp-btn-ghost" onClick={() => nav("/diagnose/605311")}>
              <PlayIcon /> Watch live
            </button>
          </div>

          {/* Product preview window below CTAs */}
          <div style={{ marginTop: 52, width: "100%", maxWidth: 540 }}>
            <LiveStreamWindow />
          </div>
        </div>

        {/* Side mascots — absolute gutters, hidden <1024px via lp-mascot-side CSS */}
        <div className="lp-mascot-side lp-mascot-side-left">
          <Mascot n={2} size={180} bob />
        </div>
        <div className="lp-mascot-side lp-mascot-side-right">
          <Mascot n={3} size={180} />
        </div>

      </section>

      {/* ── 2 · Claims strip — three numbers, no card boxes ─────────── */}
      <section className="lp-claims-strip">
        <div className="lp-claims-inner">
          {[
            { big: "1 000", label: "swaps replayed", sub: "0 bps drift vs on-chain post-swap state" },
            { big: "5", label: "verification paths", sub: "no LP Guardian server in the trust" },
            { big: "0", label: "keys in custody", sub: "user signs, agent never executes" },
          ].map((c) => (
            <div key={c.big} className="lp-claim-item">
              <span className="lp-claim-big">{c.big}</span>
              <span className="lp-claim-label">{c.label}</span>
              <span className="lp-claim-sub">{c.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2b · Powered-by marquee ───────────────────────────────────── */}
      <section
        style={{
          borderBottom: "2px solid var(--lp-border)",
          background: "var(--lp-base-deep)",
          padding: "18px 0",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div
            style={{
              flexShrink: 0,
              padding: "0 28px 0 36px",
              borderRight: "2px solid var(--lp-border-mid)",
              marginRight: 0,
            }}
          >
            <StickerBadge variant="outline">Built on</StickerBadge>
          </div>
          <div className="lp-marquee-wrap" style={{ flex: 1 }}>
            <div className="lp-marquee-track">
              {/* TODO(arch): tech stack labels */}
              {[
                { name: "Stylus", sub: "Rust-based smart contracts" },
                { name: "Uniswap Foundation", sub: "V3+V4 subgraphs, Trading API, Permit2" },
                { name: "Robinhood Chain", sub: "Arbitrum Orbit L3 execution" },
                { name: "ERC-7857", sub: "iNFT standard for embedded intelligence" },
                { name: "MCP", sub: "@modelcontextprotocol/sdk — agent-callable tools" },
                { name: "Arbitrum", sub: "Arbitrum Open House London Buildathon" },
                { name: "TEE", sub: "Secure enclave execution" },
                { name: "Uniswap Foundation", sub: "V3+V4 subgraphs, Trading API, Permit2" },
                { name: "Robinhood Chain", sub: "Arbitrum Orbit L3 execution" },
                { name: "ERC-7857", sub: "iNFT standard for embedded intelligence" },
                { name: "MCP", sub: "@modelcontextprotocol/sdk — agent-callable tools" },
                { name: "Arbitrum", sub: "Arbitrum Open House London Buildathon" },
              ].map((p, i) => (
                <MarqueeItem key={i} name={p.name} sub={p.sub} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 · Three product surfaces — asymmetric grid ─────────────── */}
      <section style={{ padding: "100px 36px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ marginBottom: 56 }}>
            <Cap>THREE SURFACES, ONE AGENT</Cap>
            <h2
              style={{
                margin: "10px 0 14px",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.2rem, 5vw, 4rem)",
                textTransform: "uppercase",
                lineHeight: 1.0,
                textWrap: "balance",
                color: "var(--lp-ink)",
              }}
            >
              Browse positions. Diagnose live. Hire the agent.
            </h2>
            <p style={{ margin: 0, maxWidth: 640, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65 }}>
              Each surface routes to the same on-chain agent — same iNFT, same
              verifiable reports, same MCP server.
            </p>
          </div>

          <div className="lp-products-asymmetric">
            {/* Atlas — large left card */}
            <WindowPanel title="atlas.exe" onClick={() => nav("/atlas")} style={{ height: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%", minHeight: 280 }}>
                <StickerBadge variant="purple">ATLAS</StickerBadge>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)",
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    lineHeight: 1.1,
                  }}
                >
                  See every LP at a glance.
                </h3>
                <p style={{ margin: 0, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.6, textWrap: "pretty" }}>
                  Paste any wallet — V3&nbsp;+&nbsp;V4 positions classified live by the
                  agent. Six curated demo wallets pin the green&nbsp;/&nbsp;amber&nbsp;/&nbsp;red&nbsp;/&nbsp;portfolio
                  narratives.
                </p>
                <div style={{ marginTop: "auto", paddingTop: 20 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-cobalt)", display: "flex", alignItems: "center", gap: 6 }}>
                    Open Atlas <PixelArrow />
                  </span>
                </div>
              </div>
            </WindowPanel>

            {/* Agent + Developers — stacked right column */}
            <div className="lp-products-right-stack">
              <WindowPanel title="agent.exe" onClick={() => nav("/agent")}>
                <StickerBadge variant="magenta" style={{ marginBottom: 14 }}>AGENT</StickerBadge>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    lineHeight: 1.1,
                  }}
                >
                  The iNFT, in real time.
                </h3>
                <p style={{ margin: 0, color: "var(--lp-ink-soft)", fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>
                  LP&nbsp;Guardian/01 — ERC-7857 with live memoryRoot, reputation counter,
                  migrationsTriggered, license terms — all read direct from chain every 30&nbsp;s.
                </p>
                <div style={{ marginTop: 14 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-cobalt)", display: "flex", alignItems: "center", gap: 6 }}>
                    Open /agent <PixelArrow />
                  </span>
                </div>
              </WindowPanel>

              <WindowPanel title="developers.exe" onClick={() => nav("/developers")}>
                <StickerBadge variant="cobalt" style={{ marginBottom: 14 }}>DEVELOPERS</StickerBadge>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
                    textTransform: "uppercase",
                    color: "var(--lp-ink)",
                    lineHeight: 1.1,
                  }}
                >
                  Hire LP Guardian from any agent.
                </h3>
                <p style={{ margin: 0, color: "var(--lp-ink-soft)", fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>
                  MCP server, 5 tools. Two free verifiers, three gated by mintLicense
                  (0.1&nbsp;ETH&nbsp;/&nbsp;24&nbsp;h, 80/20 royalty split). cast-send snippets included.
                </p>
                <div style={{ marginTop: 14 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-cobalt)", display: "flex", alignItems: "center", gap: 6 }}>
                    Open /developers <PixelArrow />
                  </span>
                </div>
              </WindowPanel>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4 · How the agent works — phase stream ───────────────────── */}
      <section
        style={{
          padding: "100px 36px",
          background: "var(--lp-base-deep)",
          borderTop: "2px solid var(--lp-border)",
          borderBottom: "2px solid var(--lp-border)",
        }}
      >
        <div
          className="lp-how-grid"
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(260px, 1fr) minmax(340px, 1.5fr)",
            gap: 60,
            alignItems: "center",
          }}
        >
          <div>
            <Cap>HOW IT WORKS</Cap>
            <h2
              style={{
                margin: "10px 0 16px",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                textTransform: "uppercase",
                lineHeight: 1.0,
                textWrap: "balance",
                color: "var(--lp-ink)",
              }}
            >
              Nine phases. Streamed live over SSE.
            </h2>
            <p style={{ margin: 0, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65, maxWidth: "55ch" }}>
              No spinner, no black box. Every phase emits a typed event the user
              watches in real time — position resolution, IL math, regime
              classification, hook discovery, swap-by-swap replay, migration
              preview, TEE verdict synthesis with hallucination guard, Storage
              upload, and on-chain anchoring with agent memory updates.
            </p>
            <div style={{ marginTop: 32 }}>
              <Mascot n={5} size={130} />
            </div>
          </div>

          <WindowPanel title="diagnose.stream">
            <ScrollPhasePanel phases={ALL_PHASES} />
          </WindowPanel>
        </div>
      </section>

      {/* ── 5 · Four-path verification ────────────────────────────────── */}
      <section style={{ padding: "100px 36px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <Cap>VERIFICATION MATRIX</Cap>
            <h2
              style={{
                margin: "10px 0 16px",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                textTransform: "uppercase",
                lineHeight: 1.0,
                textWrap: "balance",
                color: "var(--lp-ink)",
              }}
            >
              Four paths, one rootHash, no LP Guardian server in the trust.
            </h2>
            <p
              style={{
                margin: "0 auto",
                maxWidth: 760,
                color: "var(--lp-ink-soft)",
                fontSize: 15,
                lineHeight: 1.75,
                textWrap: "pretty",
              }}
            >
              The same rootHash is recoverable through four independent surfaces:
              the LP Guardian report API, the Robinhood Chain registry, the agent&apos;s
              onchain memory cursor, and the Storage blob itself. The AT-4
              hallucination guard fires <em>before</em> anchoring, so unsupported
              model claims never reach any of them.
            </p>
          </div>

          {/* rootHash hub */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                border: "2px solid var(--lp-border)",
                borderRadius: 2,
                background: "var(--lp-ink-hard)",
                boxShadow: "var(--lp-shadow)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--lp-yellow)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                rootHash
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--lp-ink-ghost)" }}>
                0x7ac4f6e2…b812
              </span>
            </div>
          </div>

          {/* connector line */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 0 }}>
            <div style={{ width: 1, height: 28, background: "var(--lp-border-mid)" }} />
          </div>

          <VerificationPaths />
        </div>
      </section>

      {/* ── 6 · Agent economy ─────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 36px",
          background: "var(--lp-base-deep)",
          borderTop: "2px solid var(--lp-border)",
          borderBottom: "2px solid var(--lp-border)",
        }}
      >
        <div
          className="lp-agent-grid"
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          <div>
            <Cap style={{ marginBottom: 20 }}>AGENT ECONOMY</Cap>
            <blockquote
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 5vw, 4rem)",
                textTransform: "uppercase",
                lineHeight: 1.0,
                color: "var(--lp-ink)",
              }}
            >
              The intelligence is in the cursor{" "}
              <span style={{ color: "var(--lp-purple)" }}>— and the cursor is rentable.</span>
            </blockquote>
            <p style={{ marginTop: 24, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65, maxWidth: "52ch" }}>
              Three counters that move on chain per agent action, plus a
              licensing primitive that splits revenue automatically.
            </p>
            <div style={{ marginTop: 32 }}>
              <Mascot n={6} size={150} bob />
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <WindowPanel title="agent.economy">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                {[
                  { tag: "01", title: "mintLicense — 80/20 royalty", desc: "Pay 0.1 ETH for a 24 h license to invoke gated MCP tools. Owner gets 80%, treasury 20%, automatic split." },
                  { tag: "02", title: "memoryRoot evolves per run", desc: "Each diagnose updates agents(1).memoryRoot to the new Storage blob." },
                  { tag: "03", title: "reputation + migrationsTriggered", desc: "Two on-chain counters move per run. recordMigration bumps when user signs." },
                  { tag: "04", title: "5 MCP product tools", desc: "portfolio_diagnose / simulate / optimize / execute / monitor exposed through MCP." },
                ].map((c) => (
                  <div
                    key={c.tag}
                    style={{
                      padding: 14,
                      border: "1px solid var(--lp-border-soft)",
                      borderRadius: 4,
                      background: "var(--lp-base-deep)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: "var(--lp-purple)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>{c.tag}</span>
                    <span style={{ color: "var(--lp-ink)", fontSize: 13, fontWeight: 600, lineHeight: 1.25, fontFamily: "var(--font-sans)" }}>{c.title}</span>
                    <span style={{ color: "var(--lp-ink-soft)", fontSize: 12, lineHeight: 1.5, fontFamily: "var(--font-sans)" }}>{c.desc}</span>
                  </div>
                ))}
              </div>
            </WindowPanel>
            <StickerBadge
              variant="yellow"
              style={{ position: "absolute", top: -12, right: -8, transform: "rotate(3deg)", zIndex: 3 }}
            >
              0.1 ETH / 24 H
            </StickerBadge>
            <StickerBadge
              variant="magenta"
              style={{ position: "absolute", bottom: -12, left: -8, transform: "rotate(-2deg)", zIndex: 3 }}
            >
              80/20 ROYALTY
            </StickerBadge>
          </div>
        </div>
      </section>

      {/* ── 7 · Method · 3 phases — numbered timeline ─────────────────── */}
      <section style={{ padding: "100px 36px", position: "relative", overflow: "hidden" }}>
        <div className="lp-grid-bg" style={{ opacity: 0.5 }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 64, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
            <div>
              <Cap>METHOD · 3 PHASES</Cap>
              <h2
                style={{
                  margin: "10px 0 14px",
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                  textTransform: "uppercase",
                  lineHeight: 1.0,
                  textWrap: "balance",
                  color: "var(--lp-ink)",
                }}
              >
                A lens, not a dashboard.
              </h2>
              <p style={{ margin: 0, maxWidth: 560, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65 }}>
                Every position ships with a signed, reproducible diagnosis. You
                keep the verdict; your keys never leave your wallet.
              </p>
            </div>
            <Mascot n={4} size={170} style={{ flexShrink: 0, marginTop: 8 }} />
          </div>

          <div className="lp-timeline">
            {[
              {
                n: "01",
                variant: "purple" as StickerVariant,
                label: "DIAGNOSE",
                title: "Read the position with a microscope.",
                desc: "The agent pulls your tokenId, decodes the tick range, and reconstructs IL from the current sqrtPriceX96 against the deposit price (Uniswap whitepaper closed-form). Output: a decomposed loss attribution.",
              },
              {
                n: "02",
                variant: "magenta" as StickerVariant,
                label: "SIMULATE",
                title: "Score every V4 hook, in a sealed enclave.",
                desc: "Candidate hooks are replayed against the exact swap stream your pool experienced. Counterfactual P&L, fee capture, and LVR are measured.",
              },
              {
                n: "03",
                variant: "cobalt" as StickerVariant,
                label: "MIGRATE",
                title: "One signature. Three on-chain moves.",
                desc: "Close V3 → swap → mint V4, bundled through Permit2. Report signed inside the TEE, pinned to IPFS/Storage, anchored on Robinhood Chain for audit.",
              },
            ].map((c) => (
              <div key={c.n} className="lp-timeline-item">
                <span className="lp-timeline-num">{c.n}</span>
                <div className="lp-timeline-body">
                  <StickerBadge variant={c.variant}>{c.label}</StickerBadge>
                  <h3 className="lp-timeline-heading">{c.title}</h3>
                  <p className="lp-timeline-text">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8 · Competitive positioning ───────────────────────────────── */}
      <section
        style={{
          padding: "100px 36px",
          background: "var(--lp-base-deep)",
          borderTop: "2px solid var(--lp-border)",
          borderBottom: "2px solid var(--lp-border)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <Cap>THE GAP WE FILL</Cap>
            <h2
              style={{
                margin: "10px 0",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                textTransform: "uppercase",
                lineHeight: 1.0,
                textWrap: "balance",
                color: "var(--lp-ink)",
              }}
            >
              Adjacent tools show the loss — none explain it.
            </h2>
          </div>

          <div className="lp-comp-wrap">
            <div
              className="lp-comp-table"
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr repeat(4, 1fr)",
                border: "2px solid var(--lp-border)",
                fontSize: 13,
              }}
            >
              <CompHead>Capability</CompHead>
              <CompHead>Revert Finance</CompHead>
              <CompHead>Uniswap Info</CompHead>
              <CompHead>Etherscan</CompHead>
              <CompHead accent>LP Guardian</CompHead>
              <CompRow cells={["Position-level IL breakdown", "per-position IL + APR", "—", "—", "✓ COMPUTED + decomposed"]} />
              <CompRow cells={["V4 hook scoring vs your pool", "—", "—", "—", "✓ replay 1 000 swaps · 0 bps drift"]} />
              <CompRow cells={["Permit2 sign-once migration", "—", "—", "—", "✓ EIP-712 typed data ready"]} />
              <CompRow cells={["Signed verdict, on-chain anchored", "—", "—", "—", "✓ 5 verification paths"]} />
              <CompRow cells={["Callable by other agents", "—", "—", "—", "✓ MCP server, 5 tools"]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 8b · Five anchors — numbered manifesto ────────────────────── */}
      <section style={{ padding: "100px 36px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 60, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
            <div>
              <Cap>FIVE ANCHORS</Cap>
              <h2
                style={{
                  margin: "10px 0 14px",
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                  textTransform: "uppercase",
                  lineHeight: 1.0,
                  textWrap: "balance",
                  color: "var(--lp-ink)",
                }}
              >
                Five design choices that hold the project up.
              </h2>
              <p style={{ margin: 0, maxWidth: 640, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65 }}>
                Each one is a deliberate constraint that&apos;s verifiable in the code or
                on chain. Take any one away and the trust story collapses.
              </p>
            </div>
            <Mascot n={7} size={160} style={{ flexShrink: 0 }} />
          </div>

          <div>
            {[
              {
                tag: "01 · DIAGNOSTIC, NOT AUTO-DEPLOY",
                body: "LP Guardian does not deploy your capital. It diagnoses why your LP is bleeding, signs the report inside a TEE, and proposes a V4 migration only if the simulation backtests positively. The agent never executes — the user keeps custody.",
              },
              {
                tag: "02 · HONESTY LAYER",
                body: "Every numeric output carries one of five labels: VERIFIED, COMPUTED, ESTIMATED, EMULATED, LABELED. If the agent did not backtest a hook against the pool's real swaps, it says so. The hallucination guard fires before anchoring — unsupported claims never reach any of the four verification surfaces.",
              },
              {
                tag: "03 · V4 HOOK REPLAY, NOT HEURISTIC",
                body: "We do not guess if a V4 hook will help your pool. We replay the pool's last 1 000 mainnet swaps through the candidate hook via SwapMath.computeSwapStep and show the counterfactual IL — at 0 bps drift vs on-chain post-swap state.",
              },
              {
                tag: "04 · SIGNED REPORT, NOT A SCREENSHOT",
                body: "The verdict is a blob signed by a TEE-attested provider, pinned on Storage, anchored on Robinhood Chain, and mirrored into agent memory. Forwardable to a DAO. Verifiable offline by anyone with the rootHash and the registry address — no LP Guardian server in the trust path.",
              },
              {
                tag: "05 · MEMORY, NOT CHAT HISTORY",
                body: "Each diagnose updates the agent's on-chain memory cursor, so the report becomes part of a persistent machine-readable state instead of a temporary UI event. The system keeps continuity without asking users to trust an off-chain session log.",
              },
            ].map((a) => (
              <AnchorEntry key={a.tag} tag={a.tag} body={a.body} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 9 · Closing CTA slab ──────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 36px",
          background: "var(--lp-base-deeper)",
          borderTop: "2px solid var(--lp-border)",
          borderBottom: "2px solid var(--lp-border)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="lp-grid-bg" style={{ opacity: 0.4 }} />
        <div style={{ maxWidth: 860, margin: "0 auto", position: "relative", zIndex: 1 }}>
          {/* Anchor mascot above CTA */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
            <Mascot n={1} size={200} bob />
          </div>
          <div className="lp-speech-bubble" data-tail="tl" style={{ display: "inline-block", marginBottom: 36, maxWidth: 400, textAlign: "left" }}>
            <p style={{ margin: 0 }}>Six demo wallets. Real chain data. No mocks.</p>
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.4rem, 7vw, 6rem)",
              textTransform: "uppercase",
              lineHeight: 0.98,
              textWrap: "balance",
              color: "var(--lp-ink)",
            }}
          >
            One live agent.{" "}
            <span style={{ color: "var(--lp-lime)" }}>One signed report</span>{" "}
            per click.
          </h2>
          <p style={{ margin: "24px auto 36px", maxWidth: 520, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.65 }}>
            Bring your own wallet, or pick a curated demo. The pipeline runs
            end-to-end on real chain data — no mocks, no canned responses.
          </p>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button className="lp-btn-primary" onClick={() => nav("/atlas")}>
              Open the Atlas <PixelArrow />
            </button>
            <StickerBadge variant="lime" style={{ transform: "rotate(-3deg)" }}>
              ROBINHOOD CHAIN
            </StickerBadge>
          </div>
        </div>
      </section>

      {/* ── 10 · Instrument stack — sticker wall ──────────────────────── */}
      <section style={{ padding: "72px 36px", borderBottom: "2px solid var(--lp-border)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
          <Cap>INSTRUMENT STACK</Cap>
          <div className="lp-stack-wall">
            {[
              { name: "TEE", sub: "Secure enclave execution", v: "purple" as StickerVariant, rot: -3 },
              { name: "Storage", sub: "merkle rootHash anchored", v: "cobalt" as StickerVariant, rot: 2 },
              { name: "Robinhood Chain", sub: "LPGuardianReports + iNFT registry", v: "purple" as StickerVariant, rot: -1 },
              { name: "Uniswap V3 / V4", sub: "live pools · permit2", v: "outline" as StickerVariant, rot: 3 },
              { name: "Permit2", sub: "EIP-712 signed bundle", v: "magenta" as StickerVariant, rot: -2 },
              { name: "Agent Memory", sub: "persistent report cursor", v: "outline" as StickerVariant, rot: 4 },
              { name: "ERC-7857", sub: "iNFT agent identity", v: "cobalt" as StickerVariant, rot: -4 },
              { name: "MCP", sub: "5 tools · agent-callable", v: "yellow" as StickerVariant, rot: 2 },
            ].map((t) => (
              <div
                key={t.name}
                className="lp-stack-item"
                style={{ "--stack-rot": `${t.rot}deg` } as CSSProperties}
              >
                <StickerBadge variant={t.v} style={{ fontSize: 10, padding: "6px 12px" }}>
                  {t.name}
                </StickerBadge>
                <span className="lp-stack-sub">
                  {t.sub}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 11 · Footer ───────────────────────────────────────────────── */}
      <footer
        style={{
          padding: "18px 36px",
          background: "var(--lp-ink-hard)",
          borderTop: "2px solid var(--lp-border)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "oklch(0.97 0.015 300 / 0.5)" }}>
              ROBINHOOD CHAIN
            </span>
            <StickerBadge variant="yellow" style={{ transform: "rotate(-2deg)", fontSize: 9 }}>
              ARBITRUM OPEN HOUSE LONDON BUILDATHON
            </StickerBadge>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.97 0.015 300 / 0.35)" }}>
            © 2026 LP Guardian
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Section components
══════════════════════════════════════════════════════════════════════ */

/* ── Live streaming window ───────────────────────────────────────── */
function LiveStreamWindow({ small }: { small?: boolean }) {
  const [count, setCount] = useState(1);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (count >= HERO_STREAM.length) {
      const t = setTimeout(() => { setCount(1); setKey((k) => k + 1); }, 2800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c + 1), 1200);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <WindowPanel title="diagnose.live" style={{ transform: "rotate(-1deg)" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: small ? 10 : 11,
          lineHeight: 1.6,
          minHeight: small ? 90 : 136,
        }}
      >
        <div style={{ color: "var(--lp-ink-ghost)", marginBottom: 10, fontSize: 9, letterSpacing: "0.03em" }}>
          tokenId 605311 · streaming
        </div>
        {HERO_STREAM.slice(0, count).map((p, i) => (
          <LpPhaseRow
            key={`${key}-${i}`}
            n={p.n}
            name={p.name}
            label={p.label}
            animated={i === count - 1}
          />
        ))}
        {count < HERO_STREAM.length && <span className="lp-caret" />}
      </div>
    </WindowPanel>
  );
}

/* ── Phase stream panel (section 4, scroll-triggered) ─────────────── */
function ScrollPhasePanel({ phases }: { phases: typeof ALL_PHASES }) {
  const [count, setCount] = useState(0);
  const [key, setKey] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setCount(1); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (count === 0) return;
    if (count >= phases.length) {
      const t = setTimeout(() => { setCount(1); setKey((k) => k + 1); }, 2400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c + 1), 480);
    return () => clearTimeout(t);
  }, [count, phases.length]);

  return (
    <div ref={ref} style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.9, minHeight: 240 }}>
      <div style={{ color: "var(--lp-ink-ghost)", marginBottom: 12, fontSize: 9, letterSpacing: "0.03em" }}>
        tokenId · streaming SSE ·{" "}
        <span className="lp-tone-computed">live</span>
        <span className="lp-caret" />
      </div>
      {phases.slice(0, count).map((p, i) => (
        <LpPhaseRow
          key={`${key}-${i}`}
          n={p.n}
          name={p.name}
          label={p.label}
          animated={i === count - 1}
        />
      ))}
    </div>
  );
}

/* ── Verification path cards ──────────────────────────────────────── */
function VerificationPaths() {
  // TODO(arch): verification matrix labels retained — revise after backend redesign for Robinhood Chain
  const paths = [
    { n: "A", name: "LP Guardian REST", sub: "GET /api/report/<rootHash>", color: "var(--lp-purple)" },
    { n: "B", name: "Robinhood Chain registry", sub: "LPGuardianReports.reports(rootHash)", color: "var(--lp-cobalt)" },
    { n: "C", name: "iNFT memoryRoot", sub: "agents(1).memoryRoot", color: "var(--lp-cobalt)" },
    { n: "D", name: "Storage merkle", sub: "root re-derived from blob", color: "var(--lp-cobalt)" },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="lp-verification-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
    >
      {paths.map((p, i) => (
        <div
          key={p.n}
          className={`lp-reveal${visible ? " lp-visible" : ""}`}
            style={{ transitionDelay: visible ? `${i * 80}ms` : "0ms", height: "100%" }}
        >
          <div className="lp-verification-card" style={{ "--verify-color": p.color } as CSSProperties}>
            <div className="lp-verification-card-head">
              <span className="lp-verification-card-letter">
                {p.n}
              </span>
            </div>
            <div className="lp-verification-card-body">
              <div className="lp-verification-card-name">
                {p.name}
              </div>
              <div className="lp-verification-card-sub">
                {p.sub}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Five-anchor manifesto entry ──────────────────────────────────── */
function AnchorEntry({ tag, body }: { tag: string; body: string }) {
  const [num, ...rest] = tag.split(" · ");
  const label = rest.join(" · ");
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal${visible ? " lp-visible" : ""}`}
      style={{
        padding: "36px 0",
        borderTop: "1px solid var(--lp-border-mid)",
        display: "grid",
        gridTemplateColumns: "72px 1fr",
        gap: 36,
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
          fontWeight: 700,
          color: "var(--lp-purple-light)",
          letterSpacing: "-0.05em",
          lineHeight: 1,
          paddingTop: 4,
        }}
      >
        {num}
      </span>
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1rem, 2.2vw, 1.4rem)",
            textTransform: "uppercase",
            letterSpacing: "0.005em",
            color: "var(--lp-ink)",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          {label}
        </div>
        <p style={{ margin: 0, color: "var(--lp-ink-soft)", fontSize: 15, lineHeight: 1.7, maxWidth: "72ch", textWrap: "pretty" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

/* ── Competitive table cells ──────────────────────────────────────── */
function CompHead({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: accent ? "var(--lp-lime)" : "var(--lp-base-deep)",
        color: accent ? "oklch(0.12 0.02 260)" : "var(--lp-ink-faint)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        fontWeight: 700,
        borderRight: "1px solid var(--lp-border-mid)",
        borderBottom: "2px solid var(--lp-border)",
      }}
    >
      {children}
    </div>
  );
}

function CompRow({ cells }: { cells: string[] }) {
  return (
    <>
      {cells.map((c, i) => {
        const isFirst = i === 0;
        const isLast = i === cells.length - 1;
        const isCheck = c.startsWith("✓");
        return (
          <div
            key={i}
            style={{
              padding: "11px 14px",
              borderTop: "1px solid var(--lp-border-mid)",
              borderRight: i < cells.length - 1 ? "1px solid var(--lp-border-mid)" : undefined,
              color: isFirst
                ? "var(--lp-ink)"
                : isLast && isCheck
                  ? "var(--lp-cobalt)"
                  : isLast
                    ? "var(--lp-ink-soft)"
                    : "var(--lp-ink-ghost)",
              fontWeight: isFirst ? 600 : 400,
              background: isLast ? "var(--lp-yellow-dim)" : "transparent",
              fontSize: 12,
              fontFamily: isLast ? "var(--font-mono)" : "inherit",
            }}
          >
            {c}
          </div>
        );
      })}
    </>
  );
}

/* ── Marquee item ─────────────────────────────────────────────────── */
function MarqueeItem({ name, sub }: { name: string; sub: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "0 36px",
        borderRight: "1px solid var(--lp-border-soft)",
        gap: 2,
      }}
    >
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--lp-ink)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--lp-ink-ghost)", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
        {sub}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Design primitives (landing-scoped)
══════════════════════════════════════════════════════════════════════ */

type StickerVariant = "purple" | "magenta" | "cobalt" | "yellow" | "outline" | "lime";

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

interface WindowPanelProps {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}
function WindowPanel({ title, children, style, className, onClick }: WindowPanelProps) {
  const base = `lp-window${onClick ? " lp-window-clickable" : ""}`;
  return (
    <div className={className ? `${base} ${className}` : base} style={style} onClick={onClick}>
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

const PHASE_TONE: Record<string, string> = {
  VERIFIED: "lp-tone-verified",
  COMPUTED: "lp-tone-computed",
  ESTIMATED: "lp-tone-estimated",
  EMULATED: "lp-tone-emulated",
  LABELED: "lp-tone-labeled",
};

function LpPhaseRow({ n, name, label, animated }: { n: string; name: string; label: string; animated?: boolean }) {
  return (
    <div
      className={animated ? "lp-phase-enter" : undefined}
      style={{ display: "flex", gap: 10, alignItems: "center", padding: "2px 0" }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--lp-ink-ghost)", minWidth: 18 }}>
        {n}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--lp-ink-soft)", flex: 1 }}>
        {name}
      </span>
      <span className={PHASE_TONE[label] ?? ""} style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.05em" }}>
        {label}
      </span>
    </div>
  );
}

function Mascot({
  n,
  size = 120,
  bob = false,
  style,
}: {
  n: number;
  size?: number;
  bob?: boolean;
  style?: CSSProperties;
}) {
  return (
    <img
      src={`/mascots/mascot${n}.webp`}
      width={size}
      height={size}
      className={bob ? "lp-mascot-bob" : undefined}
      style={{ display: "block", objectFit: "contain", ...style }}
      role="presentation"
      aria-hidden
    />
  );
}

function PixelArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M2.5 6.5h8M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <rect x="0.9" y="0.9" width="11.2" height="11.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 4L9.5 6.5L5 9V4Z" fill="currentColor" />
    </svg>
  );
}
