import { useState } from "react";
import { Link } from "react-router-dom";
import { LabelBadge } from "./LabelBadge.js";

export interface ReportProvenance {
  rootHash: string;
  storageUrl: string;
}

export interface ReportAnchor {
  txHash: string;
  chainId: number;
}

interface Props {
  provenance: ReportProvenance;
  anchor?: ReportAnchor | null;
}

function shortHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function explorerUrl(chainId: number, txHash: string): string | null {
  if (chainId === 46630) return null; // Robinhood testnet has no public explorer yet
  void txHash;
  return null;
}

export function ReportProvenancePanel({ provenance, anchor }: Props) {
  const { rootHash, storageUrl } = provenance;
  const storageIsStub =
    rootHash.startsWith("0xstub") || storageUrl.startsWith("stub://");
  const anchorIsStub = anchor
    ? anchor.txHash.startsWith("0xstub")
    : false;
  const fullyVerified =
    !storageIsStub && anchor !== null && anchor !== undefined && !anchorIsStub;
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(rootHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be denied
    }
  };

  const anchorLink = anchor ? explorerUrl(anchor.chainId, anchor.txHash) : null;

  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Report provenance
        </h2>
        <LabelBadge label={fullyVerified ? "VERIFIED" : "EMULATED"} />
      </header>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 w-20 shrink-0">rootHash</span>
          <span className="text-slate-200 truncate" title={rootHash}>
            {shortHash(rootHash)}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="ml-auto text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 w-20 shrink-0">storage</span>
          {storageUrl.startsWith("http") ? (
            <a
              href={storageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:text-cyan-200 truncate"
            >
              {storageUrl}
            </a>
          ) : (
            <span className="text-slate-400 truncate" title={storageUrl}>
              {storageUrl}
            </span>
          )}
        </div>

        {anchor && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 w-20 shrink-0">anchor tx</span>
            {anchorLink && !anchorIsStub ? (
              <a
                href={anchorLink}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 hover:text-emerald-200 truncate"
                title={anchor.txHash}
              >
                {shortHash(anchor.txHash)}
              </a>
            ) : (
              <span className="text-slate-400 truncate" title={anchor.txHash}>
                {shortHash(anchor.txHash)}
              </span>
            )}
            <span className="ml-auto text-[10px] text-slate-500">
              chain {anchor.chainId}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500 flex-1">
          {/* TODO(arch): Storage / Robinhood Chain labels */}
          {fullyVerified
            ? "Report uploaded to IPFS/Storage and anchored on Robinhood Chain. Anyone can re-download the report from Storage and verify both the rootHash and the on-chain commitment."
            : storageIsStub
              ? "Stub provenance — the agent emitted a deterministic fingerprint. Configure STORAGE_PRIVATE_KEY and ANCHOR_PRIVATE_KEY on the server to publish to IPFS and Robinhood Chain."
              : anchor
                ? "Report uploaded to Storage but anchor is a stub — configure ANCHOR_PRIVATE_KEY to write the rootHash to Robinhood Chain."
                : "Report uploaded to Storage. The merkle rootHash is content-addressed — anchor will follow once phase 9 runs."}
        </p>
        <Link
          to={`/report/${rootHash}`}
          className="text-[10px] text-violet-300 hover:text-violet-200 px-2 py-1 rounded border border-violet-500/40 hover:border-violet-400/60 transition-colors whitespace-nowrap"
        >
          view report →
        </Link>
      </div>
    </section>
  );
}
