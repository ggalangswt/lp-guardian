import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppHeader } from "../components/AppHeader.js";
import { LabelBadge } from "../components/LabelBadge.js";
import {
  useReport,
  type AssembledReportPayload,
  type PublicReport,
} from "../hooks/useReport.js";
import "../styles/report.css";

type ReportLabel = "VERIFIED" | "COMPUTED" | "ESTIMATED" | "EMULATED" | "LABELED";

function shortHash(hash: string, head = 10, tail = 6): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}

function formatNumber(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function chainExplorerUrl(chainId: number, txHash: string): string | null {
  if (chainId === 46630) return null; // Robinhood testnet has no public explorer yet
  void txHash;
  return null;
}

function isFullyVerified(report: PublicReport): boolean {
  return (
    !report.storageStub &&
    report.anchorTxHash !== undefined &&
    report.anchorStub === false
  );
}

function statusCopy(report: PublicReport): string {
  if (isFullyVerified(report)) return "Storage and chain anchor verified";
  if (report.storageStub) return "Storage emitted deterministic stub";
  if (report.anchorStub) return "Storage verified, chain anchor stubbed";
  if (!report.anchorTxHash) return "Storage verified, chain anchor pending";
  return "Provenance partially verified";
}

interface RowProps {
  k: string;
  v: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}

function Row({ k, v, tone = "default" }: RowProps) {
  return (
    <div className={`report-row report-row-${tone}`}>
      <span className="report-row-key">{k}</span>
      <span className="report-row-value">{v}</span>
    </div>
  );
}

function WindowBar({ title }: { title: string }) {
  return (
    <div className="report-window-bar">
      <span className="report-window-dot report-window-dot-red" />
      <span className="report-window-dot report-window-dot-yellow" />
      <span className="report-window-dot report-window-dot-green" />
      <span className="report-window-title">{title}</span>
    </div>
  );
}

interface SectionProps {
  title: string;
  label: ReportLabel;
  children: ReactNode;
}

function Section({ title, label, children }: SectionProps) {
  return (
    <section className="report-section">
      <WindowBar title={title.toUpperCase()} />
      <header className="report-section-heading">
        <h2>{title}</h2>
        <LabelBadge label={label} />
      </header>
      <div className="report-section-body">{children}</div>
    </section>
  );
}

function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="report-copy-button" onClick={onCopy}>
      {copied ? "copied" : label}
    </button>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="report-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
}

interface ProvenanceProps {
  report: PublicReport;
}

function ProvenanceSection({ report }: ProvenanceProps) {
  const fullyVerified = isFullyVerified(report);
  const anchorLink =
    report.anchorTxHash && report.anchorChainId
      ? chainExplorerUrl(report.anchorChainId, report.anchorTxHash)
      : null;

  return (
    <Section title="Provenance Receipt" label={fullyVerified ? "VERIFIED" : "EMULATED"}>
      <div className="report-root-receipt">
        <span>rootHash</span>
        <strong title={report.rootHash}>{report.rootHash}</strong>
        <CopyButton value={report.rootHash} />
      </div>

      <Row
        k="storage"
        v={
          <span className="report-inline-action">
            {report.storageUrl.startsWith("http") ? (
              <ExternalLink href={report.storageUrl}>{report.storageUrl}</ExternalLink>
            ) : (
              <span>{report.storageUrl}</span>
            )}
            <CopyButton value={report.storageUrl} />
          </span>
        }
        tone={report.storageStub ? "warning" : "success"}
      />

      {report.anchorTxHash ? (
        <Row
          k="anchor tx"
          v={
            <span className="report-inline-action">
              {anchorLink && report.anchorStub === false ? (
                <ExternalLink href={anchorLink}>{shortHash(report.anchorTxHash)}</ExternalLink>
              ) : (
                <span title={report.anchorTxHash}>{shortHash(report.anchorTxHash)}</span>
              )}
              <CopyButton value={report.anchorTxHash} />
            </span>
          }
          tone={report.anchorStub ? "warning" : "success"}
        />
      ) : (
        <Row k="anchor tx" v="not anchored yet" tone="warning" />
      )}

      <Row
        k="chain id"
        v={report.anchorChainId !== undefined ? String(report.anchorChainId) : "n/a"}
      />
      <Row k="cached at" v={report.cachedAt} />
      <Row k="status" v={statusCopy(report)} tone={fullyVerified ? "success" : "warning"} />
    </Section>
  );
}

interface PayloadSectionsProps {
  payload: AssembledReportPayload;
  token1Symbol: string;
}

function PayloadSections({ payload, token1Symbol }: PayloadSectionsProps) {
  return (
    <>
      <Section title="Position" label="VERIFIED">
        <Row k="tokenId" v={payload.position.tokenId} />
        <Row k="version" v={`v${payload.position.version}`} />
        <Row k="pair" v={payload.position.pair} />
        <Row k="owner" v={shortHash(payload.position.owner, 8, 6)} />
        <Row k="agent" v={`${payload.agent.name}@${payload.agent.version}`} />
        <Row k="generated at" v={payload.generatedAt} />
      </Section>

      {payload.attestation && (
        <Section title="TEE Attestation" label={payload.attestation.stub ? "EMULATED" : "VERIFIED"}>
          <Row k="type" v={payload.attestation.type} />
          <Row k="provider" v={shortHash(payload.attestation.provider, 8, 6)} />
          <Row k="model" v={payload.attestation.model} />
          <Row k="generated at" v={payload.attestation.generatedAt} />
          <Row
            k="status"
            v={payload.attestation.stub ? "broker call stubbed" : "broker signature present"}
            tone={payload.attestation.stub ? "warning" : "success"}
          />
        </Section>
      )}

      {payload.il ? (
        <Section title="Impermanent Loss" label="COMPUTED">
          <Row k="hodl value" v={`${formatNumber(payload.il.hodlValueT1)} ${token1Symbol}`} />
          <Row k="lp value" v={`${formatNumber(payload.il.lpValueT1)} ${token1Symbol}`} />
          <Row k="fees value" v={`${formatNumber(payload.il.feesValueT1)} ${token1Symbol}`} tone="success" />
          <Row
            k="il (t1)"
            v={`${formatNumber(payload.il.ilT1)} ${token1Symbol}`}
            tone={payload.il.ilT1 > 0 ? "danger" : "success"}
          />
          <Row
            k="il %"
            v={`${formatNumber(payload.il.ilPct * 100, 2)}%`}
            tone={payload.il.ilPct > 0 ? "danger" : "success"}
          />
        </Section>
      ) : (
        <Section title="Impermanent Loss" label="EMULATED">
          <Row k="status" v="not included in this report" tone="warning" />
        </Section>
      )}

      {payload.regime && (
        <Section title="Regime" label="ESTIMATED">
          <Row k="top label" v={payload.regime.topLabel} />
          <Row k="confidence" v={`${formatNumber(payload.regime.confidence * 100, 1)}%`} />
          <Row k="narrative" v={payload.regime.narrative} />
        </Section>
      )}

      {payload.hooks && (
        <Section title="V4 Hooks" label="LABELED">
          <Row k="pair" v={payload.hooks.pair} />
          <Row k="top family" v={payload.hooks.topFamily.toLowerCase().replace(/_/g, "-")} />
          <Row k="candidate count" v={String(payload.hooks.candidateCount)} />
        </Section>
      )}

      {payload.migration && (
        <Section title="Migration Plan" label="EMULATED">
          <Row
            k="target hook"
            v={
              payload.migration.targetHookAddress
                ? shortHash(payload.migration.targetHookAddress)
                : "n/a"
            }
          />
          <Row
            k="family"
            v={
              payload.migration.targetFamily
                ? payload.migration.targetFamily.toLowerCase().replace(/_/g, "-")
                : "n/a"
            }
          />
          <Row
            k="price impact"
            v={
              payload.migration.priceImpactPct !== undefined
                ? `${formatNumber(payload.migration.priceImpactPct, 3)}%`
                : "n/a"
            }
          />
          {payload.migration.warnings.length > 0 ? (
            <Row
              k="warnings"
              v={
                <ul className="report-warning-list">
                  {payload.migration.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              }
              tone="warning"
            />
          ) : (
            <Row k="warnings" v="none" />
          )}
        </Section>
      )}

      {payload.verdict && (
        <Section title="Verdict" label={payload.verdict.label}>
          <Row
            k="recommendation"
            v={payload.verdict.recommendation.toUpperCase()}
            tone={payload.verdict.recommendation === "hold" ? "success" : "warning"}
          />
          <Row k="provider" v={payload.verdict.provider} />
          <Row k="model" v={payload.verdict.model} />
          <div className="report-verdict-markdown prose prose-invert prose-sm max-w-none mt-3 text-sm leading-relaxed text-slate-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {payload.verdict.markdown}
            </ReactMarkdown>
          </div>
        </Section>
      )}
    </>
  );
}

function VerificationRail({ report }: { report: PublicReport }) {
  const anchorLink =
    report.anchorTxHash && report.anchorChainId
      ? chainExplorerUrl(report.anchorChainId, report.anchorTxHash)
      : null;
  const fullyVerified = isFullyVerified(report);

  return (
    <aside className="report-rail" aria-label="Report verification actions">
      <section className="report-rail-window">
        <WindowBar title="VERIFY" />
        <div className="report-rail-body">
          <div className={`report-seal ${fullyVerified ? "report-seal-verified" : "report-seal-partial"}`}>
            <span>{fullyVerified ? "VERIFIED" : "PARTIAL"}</span>
            <strong>{fullyVerified ? "proof path complete" : "review provenance"}</strong>
          </div>
          <CopyButton value={report.rootHash} label="copy rootHash" />
          {report.storageUrl.startsWith("http") && (
            <ExternalLink href={report.storageUrl}>open storage</ExternalLink>
          )}
          {anchorLink && report.anchorStub === false && (
            <ExternalLink href={anchorLink}>open chain tx</ExternalLink>
          )}
          <Link className="report-internal-link" to="/atlas">
            back to Atlas
          </Link>
        </div>
      </section>

      <section className="report-rail-window">
        <WindowBar title="SUMMARY" />
        <div className="report-rail-body report-summary-list">
          <Row k="pair" v={report.payload.position.pair} />
          <Row k="tokenId" v={report.payload.position.tokenId} />
          <Row k="schema" v={`v${report.payload.schemaVersion}`} />
          <Row k="agent" v={`${report.payload.agent.name}@${report.payload.agent.version}`} />
        </div>
      </section>
    </aside>
  );
}

function LoadingReport({ rootHash }: { rootHash: string }) {
  return (
    <div className="report-theme">
      <div className="report-grid-bg" aria-hidden />
      <AppHeader />
      <main className="report-shell">
        <ReportMasthead rootHash={rootHash} status="loading report from cache" />
        <section className="report-loading-window" aria-live="polite">
          <WindowBar title="FETCH REPORT" />
          <div className="report-skeleton-stack">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    </div>
  );
}

function ErrorReport({ rootHash, error }: { rootHash: string; error: string | null }) {
  return (
    <div className="report-theme">
      <div className="report-grid-bg" aria-hidden />
      <AppHeader />
      <main className="report-shell">
        <ReportMasthead rootHash={rootHash} status="report unavailable" />
        <section className="report-error-window" role="alert">
          <WindowBar title="REPORT LOOKUP FAILED" />
          <p>
            <span>&gt;</span> {error ?? "Report lookup failed."} This cache entry
            appears only after a Diagnose run reaches report upload.
          </p>
          <Link className="report-internal-link" to="/atlas">
            back to Atlas
          </Link>
        </section>
      </main>
    </div>
  );
}

function ReportMasthead({
  rootHash,
  report,
  status,
}: {
  rootHash: string;
  report?: PublicReport;
  status: string;
}) {
  return (
    <header className="report-masthead">
      <div>
        <div className="report-kicker">
          <span className="report-pixel-dot" aria-hidden />
          <span>PUBLIC PROOF ARTIFACT</span>
        </div>
        <h1>LP Guardian Report</h1>
        <p>
          {report
            ? `${report.payload.position.pair} position ${report.payload.position.tokenId}.`
            : "Forwardable diagnostic report by rootHash."}
        </p>
      </div>
      <div className="report-hash-plate">
        <span>rootHash</span>
        <strong title={rootHash}>{rootHash}</strong>
        <small>{status}</small>
      </div>
    </header>
  );
}

export function Report() {
  const { rootHash } = useParams<{ rootHash: string }>();
  const { status, report, error } = useReport(rootHash ?? null);

  if (!rootHash) {
    return <ErrorReport rootHash="missing" error="Missing rootHash in URL." />;
  }

  if (status === "loading" || status === "idle") {
    return <LoadingReport rootHash={rootHash} />;
  }

  if (status === "error" || !report) {
    return <ErrorReport rootHash={rootHash} error={error} />;
  }

  const token1Symbol = report.payload.position.pair.split("/")?.[1] ?? "T1";

  return (
    <div className="report-theme">
      <div className="report-grid-bg" aria-hidden />
      <AppHeader />

      <main className="report-shell">
        <ReportMasthead
          rootHash={rootHash}
          report={report}
          status={statusCopy(report)}
        />

        <div className="report-layout">
          <article className="report-document" aria-label="Report contents">
            <ProvenanceSection report={report} />
            <PayloadSections payload={report.payload} token1Symbol={token1Symbol} />
          </article>
          <VerificationRail report={report} />
        </div>
      </main>
    </div>
  );
}
