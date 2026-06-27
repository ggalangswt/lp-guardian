import { LabelBadge } from "./LabelBadge.js";

// Wire-format shape emitted by the server's `tool.result` for `replaySwaps`
// (apps/server/src/pipeline/runDiagnosticPipeline.ts, phase 2). The `skipped`
// variant is sent for mock cartridges / non-on-chain pools.
export interface SwapReplayOutput {
  pool?: string;
  swapCount?: number;
  swapsInRange?: number;
  swapsOutOfRange?: number;
  feePips?: number;
  fromBlock?: string;
  toBlock?: string;
  feesToken0?: number;
  feesToken1?: number;
  feesUsd?: number;
  grossVolumeUsd?: number;
  inputRoot?: string;
  resultHash?: string;
  label?: string;
  warnings?: string[];
  protocol?: string;
  swapSource?: "subgraph" | "rpc" | "none";
  replayId?: string;
  anchorTx?: string;
  onchain?: boolean;
  // skipped variant
  skipped?: boolean;
  reason?: string;
}

interface Props {
  result: SwapReplayOutput;
}

function shortHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtFeeTier(pips: number): string {
  return `${(pips / 10_000).toFixed(2)}%`;
}

export function SwapReplayPanel({ result }: Props) {
  if (result.skipped) return null;

  const swapCount = result.swapCount ?? 0;
  const inRange = result.swapsInRange ?? 0;
  const feesUsd = result.feesUsd ?? 0;
  const grossVolumeUsd = result.grossVolumeUsd ?? 0;
  const anchorTx = result.anchorTx;
  const anchorIsStub = !result.onchain || (anchorTx?.startsWith("0xstub") ?? true);

  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Swap replay
        </h2>
        <LabelBadge label={(result.label as "COMPUTED") ?? "COMPUTED"} />
      </header>

      <p className="mt-3 text-sm text-slate-400">
        Replayed{" "}
        <span className="text-slate-200 font-mono">{swapCount}</span> real
        Mantle swaps (
        <span className="text-emerald-300 font-mono">{inRange}</span> in-range)
        against the position range — counterfactual fees attributed pro-rata by
        injected liquidity share.
      </p>

      {(result.swapSource || result.protocol) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono">
          {result.protocol && (
            <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-300">
              {result.protocol === "merchant-moe" ? "Merchant Moe" : 
               result.protocol === "agni" ? "Agni Finance" :
               result.protocol === "fluxion" ? "Fluxion" :
               result.protocol.replace("uniswap-", "uni ")}
            </span>
          )}
          {result.swapSource && result.swapSource !== "none" && (
            <span className="px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300">
              source: {result.swapSource === "subgraph" ? "The Graph" : "RPC getLogs"}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] font-mono pt-3 border-t border-slate-800">
        <div>
          <div className="text-slate-500">swaps replayed</div>
          <div className="text-slate-200">{swapCount}</div>
        </div>
        <div>
          <div className="text-slate-500">in-range</div>
          <div className="text-emerald-300">{inRange}</div>
        </div>
        <div>
          <div className="text-slate-500">fee tier</div>
          <div className="text-slate-200">
            {fmtFeeTier(result.feePips ?? 0)}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] font-mono">
        <div>
          <div className="text-slate-500">counterfactual fees</div>
          <div className="text-emerald-300">{fmtUsd(feesUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">gross volume</div>
          <div className="text-slate-200">{fmtUsd(grossVolumeUsd)}</div>
        </div>
      </div>

      {(result.fromBlock || result.toBlock) && (
        <div className="mt-2 text-[11px] font-mono">
          <span className="text-slate-500">block range </span>
          <span className="text-slate-300">
            {result.fromBlock}–{result.toBlock}
          </span>
        </div>
      )}

      {/* Proof provenance — replay anchored on Mantle */}
      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500">
          on-chain proof
        </h3>

        {result.inputRoot && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 w-20 shrink-0">inputRoot</span>
            <span className="text-slate-300 truncate" title={result.inputRoot}>
              {shortHash(result.inputRoot)}
            </span>
          </div>
        )}
        {result.resultHash && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 w-20 shrink-0">resultHash</span>
            <span className="text-slate-300 truncate" title={result.resultHash}>
              {shortHash(result.resultHash)}
            </span>
          </div>
        )}
        {result.replayId && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 w-20 shrink-0">replayId</span>
            <span className="text-violet-300 truncate" title={result.replayId}>
              {shortHash(result.replayId)}
            </span>
          </div>
        )}
        {anchorTx && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 w-20 shrink-0">anchor tx</span>
            <span
              className={`truncate ${anchorIsStub ? "text-slate-400" : "text-emerald-300"}`}
              title={anchorTx}
            >
              {shortHash(anchorTx)}
            </span>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-slate-500">
        {anchorIsStub
          ? "Replay computed off-chain; anchor stubbed (no signer / non-on-chain pool). The proof hashes remain reproducible from the same swap window."
          : "Replay proof anchored on Mantle — inputRoot + resultHash committed, reproducible from the same swaps."}
      </p>

      {result.warnings && result.warnings.length > 0 && (
        <ul className="mt-3 text-[10px] text-orange-300/80 space-y-0.5 list-disc pl-4">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
