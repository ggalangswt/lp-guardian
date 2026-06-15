import { useState } from "react";
import { FlagBitChips } from "./FlagBitChips.js";
import { LabelBadge } from "./LabelBadge.js";

export type HookFamily =
  | "DYNAMIC_FEE_ADVANCED"
  | "SWAP_DELTA_CUT"
  | "MEMECOIN_ROYALTY"
  | "GATED_SWAP"
  | "INIT_GATE"
  | "CUSTOM_LIFECYCLE"
  | "UNKNOWN";

export interface HookCandidate {
  poolId: string;
  hookAddress: string;
  family: HookFamily;
  flagsBitmap: number;
  activeFlags: string[];
  feeTier: number;
  tickSpacing: number;
  tvlUsd: number;
  volumeUsd: number;
  pair: string;
}

export interface HookDiscoveryResult {
  candidates: HookCandidate[];
  topFamily: HookFamily;
  count: number;
  source?: "subgraph" | "heuristic";
}

const FAMILY_TEXT: Record<HookFamily, string> = {
  DYNAMIC_FEE_ADVANCED: "dynamic fee advanced",
  SWAP_DELTA_CUT: "swap delta cut",
  MEMECOIN_ROYALTY: "memecoin royalty",
  GATED_SWAP: "gated swap",
  INIT_GATE: "init gate",
  CUSTOM_LIFECYCLE: "custom lifecycle",
  UNKNOWN: "unknown",
};

const FAMILY_CLS: Record<HookFamily, string> = {
  DYNAMIC_FEE_ADVANCED: "text-cyan-300",
  SWAP_DELTA_CUT: "text-amber-300",
  MEMECOIN_ROYALTY: "text-rose-300",
  GATED_SWAP: "text-emerald-300",
  INIT_GATE: "text-emerald-200",
  CUSTOM_LIFECYCLE: "text-violet-300",
  UNKNOWN: "text-slate-400",
};

function shortAddr(addr: string): string {
  return addr.length > 10
    ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
    : addr;
}

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  result: HookDiscoveryResult;
}

export function HooksPanel({ result }: Props) {
  const { candidates, topFamily, count, source } = result;
  const [expanded, setExpanded] = useState<string | null>(null);
  const hookLabel = source === "subgraph" ? "VERIFIED" : "EMULATED";

  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          V4 hook candidates
        </h2>
        <LabelBadge label={hookLabel} />
      </header>

      {count === 0 ? (
        <p className="mt-3 text-slate-500 text-sm">
          No active V4 hook found for this pair on mainnet.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            <span className="text-slate-400">{count} hook(s) — top family</span>
            <span className={`ml-2 font-semibold ${FAMILY_CLS[topFamily]}`}>
              {FAMILY_TEXT[topFamily]}
            </span>
          </p>

          <ul className="mt-3 space-y-1">
            {candidates.slice(0, 8).map((c) => {
              const isOpen = expanded === c.poolId;
              return (
                <li
                  key={c.poolId}
                  className="border-b border-slate-800 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : c.poolId)}
                    className="w-full flex items-center justify-between gap-3 text-xs font-mono py-2 hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0 text-left">
                      <div className={`font-semibold ${FAMILY_CLS[c.family]}`}>
                        {FAMILY_TEXT[c.family]}
                      </div>
                      <div className="text-slate-500 text-[10px] mt-0.5">
                        {shortAddr(c.hookAddress)} · fee{" "}
                        {c.feeTier === 8388608
                          ? "dynamic"
                          : `${(c.feeTier / 10_000).toFixed(2)}%`}
                      </div>
                    </div>
                    <div className="text-right text-slate-400">
                      <div>{formatUsd(c.tvlUsd)}</div>
                      <div className="text-[10px] text-slate-500">tvl</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="pb-3 pl-1">
                      <FlagBitChips bitmap={c.flagsBitmap} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {candidates.length > 8 && (
            <p className="mt-2 text-[10px] text-slate-500 text-right">
              + {candidates.length - 8} more
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] text-slate-500">
        Family inferred from the 14-bit permission flag pattern in each hook
        address — pattern matched against research notes. Click a row to expand
        the flag bitmap.
      </p>
    </section>
  );
}
