import { LabelBadge } from "./LabelBadge.js";

export interface HookScoringResult {
  hookAddress: string;
  family: string;
  baselineAprPct: number;
  simulatedAprPct: number;
  deltaAprPct: number;
  baselineIlPct: number;
  simulatedIlPct: number;
  deltaIlPct: number;
  feeCapturePct: number;
  multipliers: {
    feeApr: number;
    volume: number;
    ilImpact: number;
    retention: number;
    rationale: string;
  };
  hoursScored: number;
  warnings: string[];
}

interface Props {
  result: HookScoringResult;
}

function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function fmtPct(n: number, withSign = false): string {
  const v = n.toFixed(2);
  return withSign && n > 0 ? `+${v}%` : `${v}%`;
}

function fmtMult(n: number): string {
  return `×${n.toFixed(2)}`;
}

export function HookScoringPanel({ result }: Props) {
  const better = result.deltaAprPct > 0;
  const m = result.multipliers;
  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          V4 hook scoring (heuristic)
        </h2>
        <LabelBadge label="EMULATED" />
      </header>

      <p className="mt-3 text-sm text-slate-400">
        Scored{" "}
        <span className="text-violet-300 font-mono">
          {shortAddr(result.hookAddress)}
        </span>{" "}
        —{" "}
        <span className="text-slate-300">
          {result.family.toLowerCase().replace(/_/g, "-")}
        </span>{" "}
        against{" "}
        <span className="font-mono text-slate-300">
          {result.hoursScored}h
        </span>{" "}
        of pool history with calibrated family multipliers — not an EVM-state
        replay.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] font-mono pt-3 border-t border-slate-800">
        <div>
          <div className="text-slate-500">baseline apr</div>
          <div className="text-slate-200">{fmtPct(result.baselineAprPct)}</div>
        </div>
        <div>
          <div className="text-slate-500">simulated apr</div>
          <div className={better ? "text-emerald-300" : "text-rose-300"}>
            {fmtPct(result.simulatedAprPct)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">delta</div>
          <div className={better ? "text-emerald-300" : "text-rose-300"}>
            {fmtPct(result.deltaAprPct, true)}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3 text-[11px] font-mono">
        <div>
          <div className="text-slate-500">baseline il</div>
          <div className="text-slate-200">{fmtPct(result.baselineIlPct)}</div>
        </div>
        <div>
          <div className="text-slate-500">simulated il</div>
          <div className="text-slate-200">{fmtPct(result.simulatedIlPct)}</div>
        </div>
        <div>
          <div className="text-slate-500">fee capture</div>
          <div className="text-slate-200">{fmtPct(result.feeCapturePct)}</div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
          assumption surface — family multipliers
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
          <div>
            <div className="text-slate-500">fee apr</div>
            <div className="text-slate-200">{fmtMult(m.feeApr)}</div>
          </div>
          <div>
            <div className="text-slate-500">volume</div>
            <div className="text-slate-200">{fmtMult(m.volume)}</div>
          </div>
          <div>
            <div className="text-slate-500">il impact</div>
            <div className="text-slate-200">{fmtMult(m.ilImpact)}</div>
          </div>
          <div>
            <div className="text-slate-500">retention</div>
            <div className="text-slate-200">{fmtMult(m.retention)}</div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-300 leading-relaxed">
        {m.rationale}
      </p>

      {result.warnings.length > 0 && (
        <ul className="mt-3 text-[10px] text-orange-300/80 space-y-0.5 list-disc pl-4">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
