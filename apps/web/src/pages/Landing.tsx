import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader.js";
import "../styles/landing.css";

const STREAM_STEPS = [
  { n: "01", name: "position.resolve", label: "VERIFIED" },
  { n: "02", name: "swap.replay", label: "COMPUTED" },
  { n: "03", name: "il.curve", label: "COMPUTED" },
  { n: "04", name: "regime.classify", label: "ESTIMATED" },
  { n: "05", name: "hook.scan", label: "LABELED" },
  { n: "06", name: "verdict.sign", label: "VERIFIED" },
];

const JOURNEY = ["Position", "Replay", "IL", "Regime", "Hook", "Verdict", "Anchor"];

const PROOF_PACK = [
  { title: "Nitro verdict", value: "nitro:mantle-run-605311", label: "VERIFIED" },
  { title: "Report rootHash", value: "0x8f2c...91ad", label: "COMPUTED" },
  { title: "Storage URL", value: "ipfs://bafy...guardian", label: "VERIFIED" },
];

const LEDGER = [
  {
    label: "VERIFIED",
    title: "Position data",
    body: "NFT owner, liquidity, ticks, pool address, and registry anchor come from chain or subgraph inputs.",
  },
  {
    label: "COMPUTED",
    title: "IL reconstruction",
    body: "Fee APR, price path, and IL drag are deterministic outputs from verified swap history.",
  },
  {
    label: "ESTIMATED",
    title: "Regime read",
    body: "Trending and toxic-flow labels stay marked statistical, never presented as chain fact.",
  },
  {
    label: "LABELED",
    title: "Strategy risk",
    body: "Rebalance proposals stay classifier labels until anchored through the Mantle Turing registry.",
  },
  {
    label: "EMULATED",
    title: "Fallback path",
    body: "If TEE is unavailable, the run says so loudly. Stub output never wears a verified costume.",
  },
];

const ROUTES = [
  { eyebrow: "Atlas", title: "Browse positions", body: "Start from curated LPs or paste tokenId 605311.", path: "/atlas" },
  { eyebrow: "Diagnose", title: "Watch live run", body: "See stream events, proof labels, and report state move.", path: "/diagnose/605311" },
  { eyebrow: "Developers", title: "Call the agent", body: "Inspect Byreal Skills, report schema, and Mantle architecture notes.", path: "/developers" },
];

export function Landing() {
  const nav = useNavigate();

  return (
    <div className="landing-theme">
      <section className="lp-hero-section">
        <div className="lp-proof-grid" aria-hidden="true" />
        <div className="lp-liquidity-blueprint" aria-hidden="true">
          <svg className="lp-liquidity-curve" viewBox="0 0 720 520" fill="none" role="presentation">
            <path className="lp-curve-ghost" d="M38 392C118 384 148 303 204 276C263 248 310 318 371 290C456 252 451 102 534 84C603 69 639 147 682 188" />
            <path className="lp-curve-main" d="M42 388C121 381 152 303 208 276C265 249 310 317 373 288C456 250 452 104 534 86C603 71 638 147 680 188" />
            <path className="lp-range-band" d="M205 414V280M372 414V286M534 414V88" />
            <path className="lp-measure-line" d="M116 414H620M116 344H206M452 126H610M474 238H654" />
            <circle cx="208" cy="276" r="5" />
            <circle cx="373" cy="288" r="5" />
            <circle cx="534" cy="86" r="5" />
            <circle cx="620" cy="414" r="4" />
          </svg>
          <span className="lp-blueprint-note note-range">active range</span>
          <span className="lp-blueprint-note note-spacing">tick spacing</span>
          <span className="lp-blueprint-note note-risk">risk surface</span>
          <span className="lp-blueprint-note note-proof">proof ready</span>
          <span className="lp-blueprint-hash">rootHash: 0x8f2c...91ad</span>
        </div>
        <AppHeader />

        <div className="lp-hero-shell">
          <div className="lp-hero-copyblock">
            <p className="lp-topline">Mantle · Byreal Skills · AWS Nitro agent</p>
            <h1>Diagnose LP risk before you rebalance.</h1>
            <p className="lp-proof-line">Every number, traced.</p>
            <p className="lp-hero-copy">
              Paste a Mantle LP portfolio. LP Guardian reconstructs impermanent loss,
              reads market regime, runs portfolio strategy agents, and ships a proof pack judges can verify.
            </p>
            <div className="lp-hero-actions" aria-label="Landing page actions">
              <button className="lp-btn-primary" onClick={() => nav("/atlas")}>
                Open Atlas <ArrowIcon />
              </button>
              <button className="lp-btn-secondary" onClick={() => nav("/diagnose/605311")}>
                Watch live run <PlayIcon />
              </button>
            </div>
          </div>

          <div className="lp-hero-rail" aria-label="Proof pack summary">
            <span>rootHash 0x8f2c...91ad</span>
            <span>AWS Nitro verdict ready</span>
            <span>Mantle Turing anchor queued</span>
          </div>
        </div>

        <div className="lp-cockpit-wrap">
          <CockpitPreview />
        </div>
      </section>

      <section className="lp-proof-pack-section" aria-labelledby="proof-pack-title">
        <div className="lp-section-heading">
          <p className="lp-kicker">Proof pack</p>
          <h2 id="proof-pack-title">A verdict is not done until it can be checked.</h2>
        </div>
        <div className="lp-proof-pack-grid">
          {PROOF_PACK.map((item) => (
            <ProofPackCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="lp-journey-section" aria-labelledby="journey-title">
        <div className="lp-section-heading">
          <p className="lp-kicker">Diagnostic live</p>
          <h2 id="journey-title">Proof flow</h2>
        </div>
        <div className="lp-journey-rail" aria-label="Diagnostic phases">
          {JOURNEY.map((item, index) => (
            <div className="lp-journey-step" key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-ledger-section" aria-labelledby="ledger-title">
        <div className="lp-section-heading lp-section-heading-split">
          <div>
            <p className="lp-kicker">Provenance ledger</p>
            <h2 id="ledger-title">Honesty labels stay load-bearing.</h2>
          </div>
          <p>
            The UI never lets estimated math cosplay as verified truth. Each claim keeps its source,
            confidence, and failure mode visible.
          </p>
        </div>
        <div className="lp-ledger-list">
          {LEDGER.map((item) => (
            <LedgerRow key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="lp-route-section" aria-labelledby="routes-title">
        <div className="lp-section-heading">
          <p className="lp-kicker">Judge path</p>
          <h2 id="routes-title">Inspect the demo from three angles.</h2>
        </div>
        <div className="lp-route-grid">
          {ROUTES.map((route) => (
            <button className="lp-route-tile" key={route.path} onClick={() => nav(route.path)}>
              <span>{route.eyebrow}</span>
              <strong>{route.title}</strong>
              <p>{route.body}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="lp-closing-section">
        <p className="lp-proof-line">Anchored. Anyone can verify.</p>
        <button className="lp-btn-primary" onClick={() => nav("/atlas")}>
          Test landing flow <ArrowIcon />
        </button>
      </section>
    </div>
  );
}

function CockpitPreview() {
  return (
    <div className="lp-cockpit lp-cockpit-live" aria-label="LP Guardian diagnose live preview">
      <div className="lp-live-main">
        <div className="lp-live-topbar">
          <div>
            <span>Diagnose live</span>
            <strong>wallet demo · mETH/USDY · Merchant Moe</strong>
          </div>
          <button type="button">Open run</button>
        </div>
        <div className="lp-live-body">
          <div className="lp-live-title">
            <span className="lp-side-mark" aria-hidden="true">
              <img src="/logo-lp-guardian.webp" alt="" />
            </span>
            <div>
              <h3>Diagnose live</h3>
              <p>Streaming provenance labels, verdict steps, and proof state.</p>
            </div>
          </div>
          <LiveStream />
        </div>
      </div>
    </div>
  );
}

function LiveStream() {
  const [count, setCount] = useState(2);
  const [cycle, setCycle] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCount(2);
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (count >= STREAM_STEPS.length) {
      const reset = window.setTimeout(() => {
        setCount(2);
        setCycle((value) => value + 1);
      }, 2200);
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(() => setCount((value) => value + 1), 760);
    return () => window.clearTimeout(timer);
  }, [count]);

  return (
    <div className="lp-stream" ref={ref}>
      {STREAM_STEPS.slice(0, count).map((step, index) => (
        <div className="lp-stream-row" key={`${cycle}-${step.n}`} style={{ "--i": index } as CSSProperties}>
          <span>{step.n}</span>
          <strong>{step.name}</strong>
          <em className={`tone-${step.label.toLowerCase()}`}>{step.label}</em>
        </div>
      ))}
    </div>
  );
}

function ProofPackCard({ title, value, label }: { title: string; value: string; label: string }) {
  return (
    <article className="lp-proof-pack-card">
      <span className={`lp-stamp stamp-${label.toLowerCase()}`}>{label}</span>
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

function LedgerRow({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <article className="lp-ledger-row">
      <span className={`lp-stamp stamp-${label.toLowerCase()}`}>{label}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2.2 7.5h10M8.6 3.7l3.8 3.8-3.8 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 5.1 10 7.5 6 9.9V5.1Z" fill="currentColor" />
    </svg>
  );
}
