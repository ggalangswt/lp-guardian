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
const AGENT_CONTRACT   = envValue("VITE_LPGUARDIAN_AGENT_CONTRACT", "0x... (iNFT contract — coming soon)");
const REPORTS_CONTRACT = envValue("VITE_LPGUARDIAN_REPORTS_CONTRACT", "0x9803be5349eedf7c28ac1914b743757ce043b7cc");
const AGENT_TOKEN_ID   = envValue("VITE_LPGUARDIAN_AGENT_TOKEN_ID", "1");
const ROBINHOOD_RPC    = envValue("VITE_ROBINHOOD_RPC", "https://rpc.testnet.chain.robinhood.com");

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

const CODE_MINT = `# 1. set wallet + chain vars
export YOUR_KEY=0xYOUR_PRIVATE_KEY
export RPC_URL=https://your-robinhood-rpc
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS

# 2. mint a 24 h license on Robinhood Chain
cast send ${AGENT_CONTRACT} \\
  "mintLicense(uint256,address,uint64)" \\
  ${AGENT_TOKEN_ID} $WALLET_ADDRESS $(($(date +%s) + 86400)) \\
  --value 0.1ether \\
  --rpc-url $RPC_URL \\
  --private-key $YOUR_KEY

# 3. verify the license is active
cast call ${AGENT_CONTRACT} \\
  "isLicensed(uint256,address)(bool)" \\
  ${AGENT_TOKEN_ID} $WALLET_ADDRESS \\
  --rpc-url $RPC_URL
# → true`;

const CODE_SETUP = `git clone ${REPO_BASE}.git LP-Guardian
cd LP-Guardian
pnpm install
pnpm --filter @lp-guardian/mcp-server build
node $(pwd)/apps/mcp-server/dist/index.js`;

const CODE_CLAUDE = `{
  "mcpServers": {
    "lpguardian": {
      "command": "node",
      "args": ["/abs/path/to/LP-Guardian/apps/mcp-server/dist/index.js"],
      "env": {
        "LPGUARDIAN_API_URL": "${BACKEND_URL}",
        "LPGUARDIAN_AGENT_CONTRACT": "${AGENT_CONTRACT}",
        "LPGUARDIAN_REPORTS_CONTRACT": "${REPORTS_CONTRACT}",
        "LPGUARDIAN_AGENT_TOKEN_ID": "${AGENT_TOKEN_ID}",
        "ROBINHOOD_RPC": "${ROBINHOOD_RPC}"
      }
    }
  }
}`;

const CODE_TS = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "your-agent", version: "0.1.0" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: ["/abs/path/to/LP-Guardian/apps/mcp-server/dist/index.js"],
  }),
);

const result = await client.callTool({
  name: "portfolio_diagnose",
  arguments: {
    walletAddress: "0xYourWallet",
    tokenId: "605311",
  },
});

console.log(result);
// Product tools return provenance fields: label, warnings,
// mockUsed, degraded, and the backend result.`;

/* ─── Page ──────────────────────────────────────────────────────────── */

const CURRENT_TOOLS: ToolRow[] = [
  {
    name: "lp_guardian_ping",
    access: "FREE",
    price: "FREE",
    description: "Transport liveness check. Useful for confirming the MCP server is reachable before invoking product tools.",
  },
  {
    name: "portfolio_diagnose",
    access: "GATED",
    price: "0.1 ETH / 24 h",
    description: "Runs Scan + Correlate on a wallet portfolio and validates selected token ownership before a real verdict.",
  },
  {
    name: "portfolio_simulate",
    access: "GATED",
    price: "0.1 ETH / 24 h",
    description: "Runs the deterministic simulation/risk pass through the shared portfolio backend service.",
  },
  {
    name: "portfolio_optimize",
    access: "GATED",
    price: "0.1 ETH / 24 h",
    description: "Returns the portfolio-level recommended action from the risk engine without submitting transactions.",
  },
  {
    name: "portfolio_execute",
    access: "GATED",
    price: "0.1 ETH / 24 h",
    description: "Prepares an execution preview for a selected LP NFT. This build never submits a transaction bundle.",
  },
  {
    name: "portfolio_monitor",
    access: "FREE",
    price: "FREE",
    description: "Fetches a point-in-time wallet portfolio snapshot for monitor and alert agents.",
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
          <StickerBadge variant="yellow">MCP · 5 PRODUCT TOOLS</StickerBadge>
          <StickerBadge variant="magenta" style={{ transform: "rotate(-1.5deg)" }}>0.1 ETH / 24H</StickerBadge>
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
          LP Guardian exposes a local MCP server so Claude Desktop, Cursor, and custom
          agents can call the same live backend that powers the web app. STDIO transport
          today — hosted SSE on the roadmap.
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
            { label: "TOOLS", value: "6 total", sub: "1 ping · 5 product tools" },
            { label: "LICENSE", value: "0.1 ETH", sub: "24 h · 80/20 royalty" },
            { label: "BACKEND", value: "Robinhood Chain", sub: "Robinhood Chain + Arbitrum reads" },
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

      {/* ── MCP tools table ───────────────────────────────────────────── */}
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
            <span className="lp-window-title">mcp.tools · 6 registered · STDIO transport</span>
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
                  {["TOOL", "ACCESS", "DESCRIPTION"].map((h, i) => (
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
        <CodeWindow title="mintlicense.sh · cast send on Robinhood Chain" code={CODE_MINT}>
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
              The MCP server checks <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-purple)" }}>isLicensed</code> before
              running gated tools. Mint a 24-hour license against tokenId {AGENT_TOKEN_ID} on the mainnet agent contract, then pass your wallet
              address as <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-purple)" }}>caller</code> when invoking gated tools.
              Payment auto-splits: 80% to iNFT owner, 20% to protocol treasury.
            </p>
          </div>
          <CodePre>{CODE_MINT}</CodePre>
        </CodeWindow>

        {/* Local setup */}
        <CodeWindow title="setup.sh · local STDIO server" code={CODE_SETUP}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <a
              href={SOURCE_ARCHIVE}
              target="_blank"
              rel="noreferrer"
              className="lp-btn-primary"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                fontSize: 11,
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
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                fontSize: 11,
              }}
            >
              GitHub <PixelArrow />
            </a>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--lp-ink-ghost)" }}>
              No hosted MCP endpoint today — STDIO only until HTTP/SSE transport ships.
            </span>
          </div>
          <CodePre>{CODE_SETUP}</CodePre>
        </CodeWindow>

        {/* Claude Desktop config */}
        <CodeWindow title="claude_desktop_config.json · MCP server entry" code={CODE_CLAUDE}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
            }}
          >
            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.6, maxWidth: "64ch" }}>
              Add this entry to your Claude Desktop MCP config. The{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-purple)" }}>ROBINHOOD_RPC</code>{" "}
              value should point at your Robinhood Chain RPC.
            </p>
          </div>
          <CodePre>{CODE_CLAUDE}</CodePre>
        </CodeWindow>

        {/* TypeScript example */}
        <CodeWindow title="client.ts · TypeScript MCP client" code={CODE_TS}>
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--lp-border-soft)",
            }}
          >
            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--lp-ink-soft)", lineHeight: 1.6, maxWidth: "64ch" }}>
              Spawn the MCP server from any TypeScript agent using the{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lp-purple)" }}>@modelcontextprotocol/sdk</code>.
              Gated tools return payment metadata when the caller is unlicensed.
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
              through the portfolio MCP surface. Use{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-cobalt)" }}>portfolio_diagnose</code>{" "}
              for a signed backend report flow and{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-cobalt)" }}>portfolio_monitor</code>{" "}
              for an agent-readable snapshot. On-chain verification reads the Robinhood Chain{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-purple)" }}>LPGuardianReports</code>{" "}
              contract at{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lp-ink-faint)" }}>{REPORTS_CONTRACT}</code>{" "}
              on Robinhood Chain.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                to="/atlas"
                className="lp-btn-ghost"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 11 }}
              >
                Run Atlas scanner <PixelArrow />
              </Link>
              <Link
                to="/roadmap"
                className="lp-btn-ghost"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 11 }}
              >
                HTTP/SSE roadmap <PixelArrow />
              </Link>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
