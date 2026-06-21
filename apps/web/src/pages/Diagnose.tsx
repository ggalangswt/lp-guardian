import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { AppHeader } from "../components/AppHeader.js";
import { ILPanel, type ILBreakdown } from "../components/ILPanel.js";
import {
  SwapReplayPanel,
  type SwapReplayOutput,
} from "../components/SwapReplayPanel.js";
import {
  HooksPanel,
  type HookDiscoveryResult,
} from "../components/HooksPanel.js";
import { LabelBadge } from "../components/LabelBadge.js";
import {
  MigrationPanel,
  type MigrationPreview,
} from "../components/MigrationPanel.js";
import {
  RegimePanel,
  type RegimeClassification,
} from "../components/RegimePanel.js";
import {
  ReportProvenancePanel,
  type ReportAnchor,
  type ReportProvenance,
} from "../components/ReportProvenancePanel.js";
import { ToolCallBadge } from "../components/ToolCallBadge.js";
import { TypewriterText } from "../components/TypewriterText.js";
import {
  VerdictPanel,
  type VerdictMeta,
} from "../components/VerdictPanel.js";
import {
  HookScoringPanel,
  type HookScoringResult,
} from "../components/HookScoringPanel.js";
import { useDiagnosticStream } from "../hooks/useDiagnosticStream.js";
import type { DiagnosticEvent, Label } from "@lp-guardian/core";
import "../styles/diagnose.css";

type ToolEvent = Extract<
  DiagnosticEvent,
  { type: "tool.call" } | { type: "tool.result" }
>;

type PhaseState = "pending" | "active" | "complete" | "failed";

interface ResolvedPositionOutput {
  pair: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  source?: "onchain" | "mock";
  label?: Label;
  ownership?: {
    requestedWallet?: string;
    owner: string;
    status: "verified" | "mismatch" | "unavailable" | "not-requested";
    label: Label;
  };
}

interface OwnershipValidationOutput {
  status: "verified" | "mismatch" | "unavailable";
  walletAddress: string;
  tokenId: string;
  ownerAddress?: string;
  reason?: string;
  label?: Label;
}

const PHASES = [
  { phase: 1, code: "position.resolve", label: "Resolve position" },
  { phase: 2, code: "swap.replay",      label: "Replay swaps" },
  { phase: 3, code: "il.reconstruct",   label: "Compute IL" },
  { phase: 4, code: "regime.classify",  label: "Classify regime" },
  { phase: 5, code: "strategy.discover", label: "Discover routes" },
  { phase: 6, code: "strategy.score",    label: "Score routes" },
  { phase: 7, code: "proposal.preview",  label: "Build proposal" },
  { phase: 8, code: "report.upload",    label: "Upload report" },
  { phase: 9, code: "anchor.mantle",        label: "Anchor root" },
  { phase: 10, code: "verdict.synthesize", label: "TEE verdict" },
];

function pickToolResult<T>(events: DiagnosticEvent[], tool: string): T | null {
  const ev = events.find(
    (e) => e.type === "tool.result" && e.tool === tool,
  ) as Extract<DiagnosticEvent, { type: "tool.result" }> | undefined;
  return ev ? (ev.output as T) : null;
}

function pickReportUploaded(events: DiagnosticEvent[]): ReportProvenance | null {
  const ev = events.find((e) => e.type === "report.uploaded") as
    | Extract<DiagnosticEvent, { type: "report.uploaded" }>
    | undefined;
  return ev ? { rootHash: ev.rootHash, storageUrl: ev.storageUrl } : null;
}

function pickReportAnchored(events: DiagnosticEvent[]): ReportAnchor | null {
  const ev = events.find((e) => e.type === "report.anchored") as
    | Extract<DiagnosticEvent, { type: "report.anchored" }>
    | undefined;
  return ev ? { txHash: ev.txHash, chainId: ev.chainId } : null;
}

function pickVerdict(events: DiagnosticEvent[]): VerdictMeta | null {
  const ev = events.find((e) => e.type === "verdict.final") as
    | Extract<DiagnosticEvent, { type: "verdict.final" }>
    | undefined;
  if (!ev) return null;
  const rawLabel = ev.labels?.label;
  const label =
    rawLabel === "VERIFIED" || rawLabel === "EMULATED" || rawLabel === "ESTIMATED"
      ? rawLabel
      : undefined;
  return {
    markdown: ev.markdown,
    model: ev.labels?.model,
    provider: ev.labels?.provider,
    stub: rawLabel === "EMULATED",
    label,
  };
}

function phaseState(events: DiagnosticEvent[], phase: number): PhaseState {
  if (events.some((e) => e.type === "error" && e.phase === phase)) return "failed";
  if (events.some((e) => e.type === "phase.end" && e.phase === phase)) return "complete";
  if (events.some((e) => e.type === "phase.start" && e.phase === phase)) return "active";
  return "pending";
}

function statusLabel(status: string, error?: string): string {
  if (error || status === "error") return "stream error";
  if (status === "open") return "stream open";
  if (status === "closed") return "stream closed";
  return "waiting";
}

function compactHash(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function Diagnose() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const [searchParams] = useSearchParams();
  const protocol = searchParams.get("protocol") ?? undefined;
  const { address } = useAccount();
  const walletAddress = searchParams.get("walletAddress") ?? address;
  const { events, status, error } = useDiagnosticStream(
    tokenId ?? null,
    walletAddress,
    protocol,
  );

  const toolEvents = events.filter(
    (e): e is ToolEvent => e.type === "tool.call" || e.type === "tool.result",
  );
  const narratives = events.filter(
    (e): e is Extract<DiagnosticEvent, { type: "narrative" }> =>
      e.type === "narrative",
  );
  const streamErrors = events.filter(
    (e): e is Extract<DiagnosticEvent, { type: "error" }> => e.type === "error",
  );

  const resolved  = pickToolResult<ResolvedPositionOutput>(events, "getV3Position");
  const ownership = pickToolResult<OwnershipValidationOutput>(events, "validateOwnership");
  const swapReplay = pickToolResult<SwapReplayOutput>(events, "replaySwaps");
  const ilBreakdown = pickToolResult<ILBreakdown>(events, "computeIL");
  const regime    = pickToolResult<RegimeClassification>(events, "classifyRegime");
  const hooks     = pickToolResult<HookDiscoveryResult>(events, "discoverV4Hooks");
  const migration = pickToolResult<MigrationPreview>(events, "buildMigrationPreview");
  const provenance = pickReportUploaded(events);
  const anchor    = pickReportAnchored(events);
  const verdict   = pickVerdict(events);
  const scoring   = pickToolResult<HookScoringResult>(events, "scoreHook");

  const provenanceFullyVerified =
    provenance !== null &&
    !provenance.rootHash.startsWith("0xstub") &&
    !provenance.storageUrl.startsWith("stub://") &&
    anchor !== null &&
    !anchor.txHash.startsWith("0xstub");

  const token1Symbol = resolved?.pair?.split("/")?.[1] ?? "T1";

  const labels = useMemo(() => {
    const out: Label[] = [];
    if (ownership)  out.push(ownership.label ?? (ownership.status === "verified" ? "VERIFIED" : "EMULATED"));
    if (resolved)   out.push(resolved.label ?? "EMULATED");
    if (ilBreakdown) out.push("COMPUTED");
    if (regime)     out.push("ESTIMATED");
    if (hooks)      out.push(hooks.source === "subgraph" ? "VERIFIED" : "EMULATED");
    if (migration)  out.push("EMULATED");
    if (provenance) out.push(provenanceFullyVerified ? "VERIFIED" : "EMULATED");
    if (verdict)    out.push(verdict.label ?? (verdict.stub ? "EMULATED" : "ESTIMATED"));
    return out;
  }, [ownership, resolved, ilBreakdown, regime, hooks, migration, provenance, provenanceFullyVerified, verdict]);

  const completed  = PHASES.filter((p) => phaseState(events, p.phase) === "complete").length;
  const activePhase = PHASES.find((p) => phaseState(events, p.phase) === "active");
  const hasEvidence = !!((swapReplay && !swapReplay.skipped) || ilBreakdown || regime || hooks || scoring || migration || provenance || verdict);

  const bubbleText = useMemo(() => {
    if (error) return "Stream dropped. Check the backend.";
    if (streamErrors.length > 0) return `Phase ${completed + 1} failed. Check logs.`;
    if (status === "closed" && verdict) {
      return provenanceFullyVerified
        ? `${PHASES.length} of ${PHASES.length}. Anchored.`
        : `${completed} of ${PHASES.length}. Verdict ready.`;
    }
    if (status === "open" && activePhase) {
      const step = PHASES.findIndex((p) => p.phase === activePhase.phase) + 1;
      return `Running phase ${step}: ${activePhase.label}.`;
    }
    if (status === "open") return "Opening secure stream...";
    return "Paste a position id to begin.";
  }, [error, streamErrors.length, completed, status, verdict, provenanceFullyVerified, activePhase]);

  return (
    <div className="diagnose-theme" data-stream={status}>
      <AppHeader />
      <div className="diagnose-shell">

        {/* Band 1 — Hero */}
        <header className="diagnose-hero">
          <div className="diagnose-hero-content">
            <div className="diagnose-kicker">PHASE STREAM</div>
            <h1 className="diagnose-h1">DIAGNOSING</h1>
            {tokenId && (
              <div className="diagnose-token-chip">TOKEN #{tokenId}</div>
            )}
            <div className="diagnose-meta">
              <span>
                <span className="diagnose-meta-key">status </span>
                {statusLabel(status, error)}
              </span>
              {resolved && (
                <span>
                  <span className="diagnose-meta-key">pair </span>
                  {resolved.pair}
                </span>
              )}
            </div>
          </div>

          <div className="diagnose-hero-right">
            <DiagnoserMascot status={status} />
            <div className="lp-speech-bubble diagnose-bubble" data-tail="tl">
              {bubbleText}
            </div>
            <div className="diagnose-scoreboard">
              <div className="diagnose-score">
                <strong>{events.length}</strong>
                <span>EVENTS</span>
              </div>
              <div className="diagnose-score">
                <strong>{completed}/{PHASES.length}</strong>
                <span>PHASES</span>
              </div>
              <div className="diagnose-score">
                <strong>{toolEvents.length}</strong>
                <span>TOOLS</span>
              </div>
            </div>
          </div>
        </header>

        {/* Band 2 — Phase timeline */}
        <section className="diagnose-timeline" aria-label="Diagnostic phase progress">
          <h2 className="diagnose-section-label">PHASE TIMELINE</h2>
          <div className="diagnose-phase-list">
            {PHASES.map((p, i) => (
              <PhasePill
                key={p.phase}
                step={i + 1}
                label={p.label}
                code={p.code}
                state={phaseState(events, p.phase)}
              />
            ))}
          </div>
        </section>

        {/* Band 3 — Main grid */}
        <div className="diagnose-grid">
          <section className="diagnose-evidence" aria-label="Diagnostic evidence panels">
            {error && (
              <StateCard
                tone="error"
                title="STREAM ERROR"
                body={`${error}. Frontend reachable but SSE backend dropped the run.`}
              />
            )}
            {streamErrors.length > 0 && (
              <StateCard
                tone="error"
                title="PHASE ERROR"
                body={streamErrors[streamErrors.length - 1]?.message ?? "A diagnostic phase failed."}
              />
            )}
            {!hasEvidence && !error && (
              <StateCard
                tone="idle"
                title={status === "open" ? "WAITING FOR EVIDENCE" : "STREAM READY"}
                body={
                  status === "open"
                    ? "EventSource open. Evidence panels land here as tool results arrive."
                    : "Open a tokenId route to start a live diagnostic stream."
                }
              />
            )}
            {swapReplay && !swapReplay.skipped && (
              <SwapReplayPanel result={swapReplay} />
            )}
            {ilBreakdown && (
              <ILPanel breakdown={ilBreakdown} token1Symbol={token1Symbol} />
            )}
            {regime && <RegimePanel classification={regime} />}
            {hooks && <HooksPanel result={hooks} />}
            {scoring && <HookScoringPanel result={scoring} />}
            {migration && (
              <MigrationPanel preview={migration} lpTokenId={tokenId} />
            )}
            {provenance && (
              <ReportProvenancePanel provenance={provenance} anchor={anchor} />
            )}
            {verdict && <VerdictPanel verdict={verdict} />}
          </section>

          <aside className="diagnose-rail" aria-label="Live stream rail">
            <RailCard title="HONESTY LABELS">
              <div className="diagnose-badge-stack">
                {labels.length === 0 ? (
                  <span className="diagnose-muted">
                    Labels appear as evidence lands.
                  </span>
                ) : (
                  labels.map((label, i) => (
                    <LabelBadge key={`${label}-${i}`} label={label} />
                  ))
                )}
              </div>
            </RailCard>

            <RailCard title="TOOL CALL STACK">
              <div className="diagnose-tool-scroll">
                {toolEvents.length === 0 ? (
                  <span className="diagnose-muted">No tool calls yet.</span>
                ) : (
                  toolEvents.map((ev, i) => (
                    <ToolCallBadge
                      key={`${ev.type}-${ev.tool}-${i}`}
                      event={ev}
                    />
                  ))
                )}
              </div>
            </RailCard>

            <RailCard title="NARRATIVE">
              <div className="diagnose-narrative-scroll">
                {narratives.length === 0 ? (
                  <span className="diagnose-muted">
                    Agent will narrate as phases complete.
                  </span>
                ) : (
                  narratives.map((n, i) =>
                    i === narratives.length - 1 ? (
                      <p key={i} className="diagnose-narrative-current">
                        <TypewriterText text={n.text} />
                      </p>
                    ) : (
                      <p key={i}>{n.text}</p>
                    ),
                  )
                )}
              </div>
            </RailCard>

            {provenance?.rootHash && (
              <RailCard title="REPORT ROOT">
                <div className="diagnose-root-hash-area">
                  <code
                    className="diagnose-root-hash-mono"
                    title={provenance.rootHash}
                  >
                    {compactHash(provenance.rootHash)}
                  </code>
                  <CopyButton text={provenance.rootHash} />
                  <Link
                    className="lp-btn-primary diagnose-report-btn"
                    to={`/report/${provenance.rootHash}`}
                  >
                    Open report
                  </Link>
                </div>
              </RailCard>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── Local components ────────────────────────────────────────── */

function DiagnoserMascot({ status }: { status: string }) {
  const isOpen = status === "open";
  return (
    <svg
      className={`diagnose-mascot${isOpen ? " lp-mascot-bob" : ""}`}
      viewBox="0 0 120 170"
      aria-label={`Diagnoser mascot: ${status}`}
      role="img"
      fill="none"
    >
      {/* Left arm */}
      <rect x="4" y="90" width="12" height="40" rx="6"
        fill="oklch(0.68 0.18 230)" stroke="oklch(0.12 0.02 260)" strokeWidth="3" />
      {/* Right arm */}
      <rect x="104" y="90" width="12" height="40" rx="6"
        fill="oklch(0.68 0.18 230)" stroke="oklch(0.12 0.02 260)" strokeWidth="3" />
      {/* Body */}
      <path d="M22 90 L98 90 L104 150 L16 150 Z"
        fill="oklch(0.68 0.18 230)" stroke="oklch(0.12 0.02 260)"
        strokeWidth="3" strokeLinejoin="round" />
      {/* Lab coat chest panel */}
      <path d="M44 90 L76 90 L80 140 L40 140 Z"
        fill="oklch(0.97 0.01 250)" stroke="oklch(0.12 0.02 260)"
        strokeWidth="2" strokeLinejoin="round" />
      {/* Head */}
      <circle cx="60" cy="52" r="44"
        fill="oklch(0.68 0.18 230)" stroke="oklch(0.12 0.02 260)" strokeWidth="3" />
      {/* Highlight crescent */}
      <ellipse cx="40" cy="33" rx="18" ry="14" fill="oklch(0.82 0.14 220)" />
      {/* Shadow crescent */}
      <ellipse cx="78" cy="68" rx="12" ry="9" fill="oklch(0.52 0.16 235)" />
      {/* Left eye */}
      <circle cx="44" cy="50" r="8" fill="oklch(0.12 0.02 260)" />
      <circle cx="47" cy="47" r="3" fill="white" />
      {/* Right eye */}
      <circle cx="76" cy="50" r="8" fill="oklch(0.12 0.02 260)" />
      <circle cx="79" cy="47" r="3" fill="white" />
      {/* Stethoscope */}
      <path
        className="diagnose-stethoscope"
        d="M56 90 Q58 108 68 116 Q78 124 80 136 Q82 148 70 150 Q60 152 60 140"
        stroke="oklch(0.92 0.22 130)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Pool icon — two overlapping circles at stethoscope end */}
      <circle cx="53" cy="144" r="7"
        fill="oklch(0.24 0.10 265)" stroke="oklch(0.92 0.22 130)" strokeWidth="2" />
      <circle cx="63" cy="144" r="7"
        fill="oklch(0.24 0.10 265)" stroke="oklch(0.92 0.22 130)" strokeWidth="2" />
    </svg>
  );
}

function PhasePill({
  step,
  label,
  code,
  state,
}: {
  step: number;
  label: string;
  code: string;
  state: PhaseState;
}) {
  return (
    <div
      className={`diagnose-phase-pill diagnose-phase-pill--${state}`}
      aria-current={state === "active" ? "step" : undefined}
      title={`phase code: ${code}`}
    >
      <span className="diagnose-pill-num">{String(step).padStart(2, "0")}</span>
      <span className="diagnose-pill-label">{label.toUpperCase()}</span>
      <span className="diagnose-pill-status">{state}</span>
    </div>
  );
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="diagnose-rail-card">
      <h2 className="diagnose-rail-title">{title}</h2>
      {children}
    </div>
  );
}

function StateCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "idle" | "error";
}) {
  return (
    <div className={`diagnose-state-card diagnose-state-card--${tone}`}>
      <span className="diagnose-state-title">{title}</span>
      <p className="diagnose-state-body">{body}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button className="lp-btn-ghost diagnose-copy-btn" onClick={handleCopy}>
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}
