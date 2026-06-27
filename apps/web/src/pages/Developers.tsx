import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader.js";
import { Cap } from "../design/atoms.js";
import "../styles/landing.css";

/* ─── Constants ─────────────────────────────────────────────────────── */

const REPO_BASE       = "https://github.com/raditazar/lp-guardian";
const SOURCE_ARCHIVE  = `${REPO_BASE}/archive/refs/heads/main.zip`;
const envValue = (key: string, fallback = "") => {
  const value = import.meta.env[key] as string | undefined;
  return value?.trim() || fallback;
};
const BACKEND_URL      = envValue("VITE_LPGUARDIAN_API_URL", "http://localhost:3001");
const AGENT_CONTRACT   = envValue("VITE_LPGUARDIAN_AGENT_CONTRACT", "0x... (Turing registry — coming soon)");
const REPORTS_CONTRACT = envValue("VITE_LPGUARDIAN_REPORTS_CONTRACT", "0x9803be5349eedf7c28ac1914b743757ce043b7cc");
const AGENT_TOKEN_ID   = envValue("VITE_LPGUARDIAN_AGENT_TOKEN_ID", "1");
const MANTLE_RPC       = envValue("VITE_MANTLE_RPC", "https://rpc.sepolia.mantle.xyz");

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

function PixelArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M2.5 6.5h8M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/* ─── Window panel with optional copy button ───────────────────────── */

function CodeWindow({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="lp-window">
      <div className="lp-window-bar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="lp-window-dots">
            <div className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
            <div className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
            <div className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
          </div>
          <span className="lp-window-title">{title}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "3px 8px",
            color: copied ? "var(--lp-healthy)" : "var(--lp-cobalt)",
            border: `1px solid ${copied ? "var(--lp-healthy)" : "var(--lp-cobalt)"}`,
            borderRadius: 2,
            background: "transparent",
            cursor: "pointer",
            transition: "color 120ms, border-color 120ms",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </div>
      <div className="lp-window-body">{children}</div>
    </div>
  );
}

/* ─── Code pre block (light) ────────────────────────────────────────── */

function CodePre({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: "14px 16px",
        background: "var(--lp-base-deep)",
        border: "none",
        borderRadius: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.7,
        color: "var(--lp-ink)",
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

/* ─── Access chip ────────────────────────────────────────────────────── */

function AccessChip({ access, price }: { access: "GATED" | "FREE"; price: string }) {
  const gated = access === "GATED";
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.08em",
          padding: "2px 6px",
          border: `1px solid ${gated ? "var(--lp-yellow)" : "var(--lp-healthy)"}`,
          borderRadius: 1,
          color: gated ? "var(--lp-yellow)" : "var(--lp-healthy)",
          background: gated
            ? "color-mix(in oklch, var(--lp-yellow) 8%, transparent)"
            : "color-mix(in oklch, var(--lp-healthy) 8%, transparent)",
          whiteSpace: "nowrap",
        }}
      >
        {access}
      </span>
      {gated && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--lp-ink-ghost)",
            whiteSpace: "nowrap",
          }}
        >
          {price}
        </span>
      )}
    </span>
  );
}

/* ─── Tool rows data ─────────────────────────────────────────────────── */

interface ToolRow {
  name: string;
  access: "GATED" | "FREE";
  price: string;
  description: string;
}

/* ─── Code strings ───────────────────────────────────────────────────── */

const CODE_MINT = `# 1. set wallet + Mantle vars
export YOUR_KEY=0xYOUR_PRIVATE_KEY
export RPC_URL=https://rpc.sepolia.mantle.xyz
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS

# 2. register a Turing agent decision trail on Mantle
cast send ${AGENT_CONTRACT} \
  "registerAgent(string,bytes32)" \
  "ipfs://lpguardian/agent.json" 0xYOUR_CODE_HASH \
  --rpc-url $RPC_URL \
  --private-key $YOUR_KEY

# 3. verify agent stats
cast call ${AGENT_CONTRACT} \
  "getAgentStats(uint256)(uint256,uint256,uint256)" \
  ${AGENT_TOKEN_ID} \
  --rpc-url $RPC_URL
# -> decisions, outcomes, averageScore`;

const CODE_SETUP = `git clone ${REPO_BASE}.git LP-Guardian
cd LP-Guardian
pnpm install
pnpm --filter @lp-guardian/skills build
byreal skills register ./apps/skills/lpguardian.skills.json`;

const CODE_CLAUDE = `{
  "namespace": "lpguardian",
  "version": "1.0.0",
  "chain": "mantle-sepolia",
  "skills": ["scout", "strategist", "executor", "sentinel"],
  "env": {
    "LPGUARDIAN_API_URL": "${BACKEND_URL}",
    "LPGUARDIAN_TURING_REGISTRY": "${AGENT_CONTRACT}",
    "LPGUARDIAN_REPORTS_CONTRACT": "${REPORTS_CONTRACT}",
    "MANTLE_RPC": "${MANTLE_RPC}"
  }
}`;

const CODE_TS = `import { createSkillClient } from "@byreal/skills";

const skills = createSkillClient({ namespace: "lpguardian" });

const result = await skills.call("strategist", {
  walletAddress: "0xYourWallet",
  protocols: ["merchant-moe", "agni", "fluxion"],
  constraints: {
    maxCorrelationBps: 6500,
    preferAssets: ["mETH", "USDY"],
  },
});

console.log(result);
// Skills return provenance fields: label, warnings,
// degraded, turingDecisionId, and the backend result.`;

/* ─── Page ──────────────────────────────────────────────────────────── */

const CURRENT_TOOLS: ToolRow[] = [
  {
    name: "lpguardian.ping",
    access: "FREE",
    price: "FREE",
    description: "Skill registry liveness check. Useful for confirming Byreal Skills can reach the agent before invoking product skills.",
  },
  {
    name: "lpguardian.scout",
    access: "GATED",
    price: "MNT gas",
    description: "Scans Mantle LP positions across Merchant Moe, Agni, and Fluxion before strategy analysis.",
  },
  {
    name: "lpguardian.strategist",
    access: "GATED",
    price: "MNT gas",
    description: "Runs correlation, optimization, and scenario simulation through the Python portfolio service.",
  },
  {
    name: "lpguardian.executor",
    access: "GATED",
    price: "MNT gas",
    description: "Prepares a Permit2 rebalance bundle after user approval and records the decision trail on Mantle.",
  },
  {
    name: "lpguardian.sentinel",
    access: "GATED",
    price: "MNT gas",
    description: "Watches Bybit signals, Chainlink feeds, and on-chain events for anomaly alerts.",
  },
  {
    name: "lpguardian.snapshot",
    access: "FREE",
    price: "FREE",
    description: "Fetches a point-in-time Mantle portfolio snapshot for benchmark and alert panels.",
  },
];

export function Developers() {
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <StickerBadge variant="cobalt">DEVELOPERS</StickerBadge>
          <StickerBadge variant="yellow">BYREAL SKILLS · 4 AGENTS</StickerBadge>
          <StickerBadge variant="magenta" style={{ transform: "rotate(-1.5deg)" }}>MANTLE TURING</StickerBadge>
        </div>

        <h1
          style={{
            margin: "0 0 16px",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2.8rem, 6vw, 5.6rem)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            lineHeight: 0.95,
            color: "var(--lp-ink)",
          }}
        >
          Hire LP Guardian{" "}
          <span style={{ color: "var(--lp-purple)" }}>from any agent.</span>
        </h1>

        <p
          style={{
            maxWidth: "58ch",
            margin: "0 0 20px",
            color: "var(--lp-ink-soft)",
            fontSize: 15,
            lineHeight: 1.65,
          }}
        >
          LP Guardian exposes Byreal Skills so wallets and custom agents can hire Scout,
          Strategist, Executor, and Sentinel against the same Mantle portfolio API that
          powers the web app.
        </p>

        {/* Fact strip — replaces MetricCard hero grid */}
        <div
          style={{
            display: "inline-flex",
            gap: 0,
            border: "1.5px solid var(--lp-border)",
            borderRadius: 3,
            overflow: "hidden",
            boxShadow: "3px 3px 0 var(--lp-border)",
          }}
        >
          {[
            { label: "SKILLS", value: "4 agents", sub: "Scout · Strategist · Executor · Sentinel" },
            { label: "CHAIN", value: "Mantle", sub: "Sepolia now · mainnet ready" },
            { label: "DATA", value: "Bybit + DeFi", sub: "Merchant Moe · Agni · Fluxion" },
          ].map(({ label, value, sub }, i) => (
            <div
              key={label}
              style={{
                padding: "12px 20px",
                borderRight: i < 2 ? "1.5px solid var(--lp-border-soft)" : "none",
                background: i % 2 === 0 ? "var(--lp-base)" : "var(--lp-base-deep)",
              }}
            >
              <Cap style={{ marginBottom: 4 }}>{label}</Cap>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--lp-ink)",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  marginBottom: 3,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--lp-ink-ghost)",
                  letterSpacing: "0.04em",
                }}
              >
                {sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Byreal skills table ───────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0 36px 48px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <div className="lp-window">
          <div className="lp-window-bar">
            <div className="lp-window-dots">
              <div className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
              <div className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
              <div className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
            </div>
            <span className="lp-window-title">byreal.skills · 4 agents + snapshot · Mantle ready</span>
          </div>
          <div className="lp-window-body" style={{ padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: "var(--lp-base-deep)", borderBottom: "1.5px solid var(--lp-border)" }}>
                  {["SKILL", "ACCESS", "DESCRIPTION"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 14px",
                        textAlign: "left",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        color: "var(--lp-ink-ghost)",
                        borderRight: i < 2 ? "1px solid var(--lp-border-soft)" : "none",
                        width: i === 0 ? "28%" : i === 1 ? "12%" : "auto",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CURRENT_TOOLS.map((tool, i) => (
                  <tr
                    key={tool.name}
                    style={{
                      borderBottom: i < CURRENT_TOOLS.length - 1 ? "1px solid var(--lp-border-soft)" : "none",
                      background: i % 2 === 0 ? "transparent" : "color-mix(in oklch, var(--lp-purple) 2%, transparent)",
                    }}
                  >
                    <td
                      style={{
                        padding: "11px 14px",
                        borderRight: "1px solid var(--lp-border-soft)",
                        color: "var(--lp-cobalt)",
                        fontWeight: 700,
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tool.name}
                    </td>
                    <td
                      style={{
                        padding: "11px 14px",
                        borderRight: "1px solid var(--lp-border-soft)",
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <AccessChip access={tool.access} price={tool.price} />
                    </td>
                    <td
                      style={{
                        padding: "11px 14px",
                        color: "var(--lp-ink-soft)",
                        lineHeight: 1.55,
                        verticalAlign: "top",
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                      }}
                    >
                      {tool.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Code sections ─────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0 36px 100px",
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >

        {/* Mint a license */}
        <CodeWindow title="register-agent.sh · cast send on Mantle" code={CODE_MINT}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.6, maxWidth: "64ch" }}>
              The Mantle registry records agent decisions and outcomes for Turing benchmark review.
              Register agent #{AGENT_TOKEN_ID}, then let Byreal Skills call Scout, Strategist, Executor, and Sentinel
              with the same report hashes the frontend displays.
            </p>
          </div>
          <CodePre>{CODE_MINT}</CodePre>
        </CodeWindow>

        {/* Local setup */}
        <CodeWindow title="setup.sh · Byreal Skills scaffold" code={CODE_SETUP}>
          <div
            className="lp-action-row"
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
            }}
          >
            <a
              href={SOURCE_ARCHIVE}
              target="_blank"
              rel="noreferrer"
              className="lp-btn-primary"
              style={{
                textDecoration: "none",
              }}
            >
              Download .zip <PixelArrow />
            </a>
            <a
              href={REPO_BASE}
              target="_blank"
              rel="noreferrer"
              className="lp-btn-ghost"
              style={{
                textDecoration: "none",
              }}
            >
              GitHub <PixelArrow />
            </a>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--lp-ink-ghost)" }}>
              Byreal Skills manifest reflects the Mantle submission stack; backend transport can migrate behind it.
            </span>
          </div>
          <CodePre>{CODE_SETUP}</CodePre>
        </CodeWindow>

        {/* Byreal config */}
        <CodeWindow title="lpguardian.skills.json · Byreal Skills manifest" code={CODE_CLAUDE}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
            }}
          >
            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.6, maxWidth: "64ch" }}>
              Register this Byreal Skills manifest for the Mantle agent stack. The{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-purple)" }}>MANTLE_RPC</code>{" "}
              value should point at Mantle Sepolia or Mantle mainnet RPC.
            </p>
          </div>
          <CodePre>{CODE_CLAUDE}</CodePre>
        </CodeWindow>

        {/* TypeScript example */}
        <CodeWindow title="client.ts · Byreal Skills client" code={CODE_TS}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
            }}
          >
            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.6, maxWidth: "64ch" }}>
              Call LP Guardian from any TypeScript agent using a Byreal Skills client.
              Results include provenance labels, warnings, and Turing decision metadata.
            </p>
          </div>
          <CodePre>{CODE_TS}</CodePre>
        </CodeWindow>

        {/* Verification */}
        <div className="lp-window">
          <div className="lp-window-bar">
            <div className="lp-window-dots">
              <div className="lp-window-dot" style={{ background: "var(--lp-bleed)" }} />
              <div className="lp-window-dot" style={{ background: "var(--lp-toxic)" }} />
              <div className="lp-window-dot" style={{ background: "var(--lp-healthy)" }} />
            </div>
            <span className="lp-window-title">verification.free · no LP Guardian server required</span>
          </div>
          <div className="lp-window-body">
            <p style={{ margin: "0 0 14px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--lp-ink-soft)", lineHeight: 1.65, maxWidth: "68ch" }}>
              The free verification path is intentionally public. Other agents can resolve a cached report
              through the Byreal Skills surface. Use{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-cobalt)" }}>lpguardian.strategist</code>{" "}
              for a signed backend report flow and{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-cobalt)" }}>lpguardian.sentinel</code>{" "}
              for live monitoring. On-chain verification reads the{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-purple)" }}>LPGuardianTuringRegistry</code>{" "}
              contract on Mantle.
            </p>
            <div className="lp-action-row">
              <Link
                to="/atlas"
                className="lp-btn-ghost"
                style={{ textDecoration: "none" }}
              >
                Run Atlas scanner <PixelArrow />
              </Link>
              <Link
                to="/roadmap"
                className="lp-btn-ghost"
                style={{ textDecoration: "none" }}
              >
                Turing roadmap <PixelArrow />
              </Link>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
