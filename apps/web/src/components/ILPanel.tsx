import { LabelBadge } from "./LabelBadge.js";

// Wire-format shape emitted by the server's `tool.result` for `computeIL`.
// Must stay in sync with @lp-guardian/agent's ILBreakdown.
export interface ILBreakdown {
  hodlValueT1: number;
  lpValueT1: number;
  feesValueT1: number;
  ilT1: number;
  ilPct: number;
}

interface Props {
  breakdown: ILBreakdown;
  token1Symbol: string;
}

export function ILPanel({ breakdown, token1Symbol }: Props) {
  const { hodlValueT1, lpValueT1, feesValueT1, ilT1, ilPct } = breakdown;
  // Server convention : positive ilT1 means HODL > LP+fees, i.e. underperformance.
  const underperforming = ilT1 > 0;
  const sign = underperforming ? "-" : "+";
  const cls = underperforming ? "text-rose-300" : "text-emerald-300";

  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Impermanent loss
        </h2>
        <LabelBadge label="COMPUTED" />
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs font-mono">
        <dt className="text-slate-500">HODL value</dt>
        <dd className="text-right">
          {hodlValueT1.toFixed(4)} {token1Symbol}
        </dd>

        <dt className="text-slate-500">LP value</dt>
        <dd className="text-right">
          {lpValueT1.toFixed(4)} {token1Symbol}
        </dd>

        <dt className="text-slate-500">Fees collected</dt>
        <dd className="text-right text-emerald-300">
          +{feesValueT1.toFixed(4)} {token1Symbol}
        </dd>

        <dt className="text-slate-500">vs HODL</dt>
        <dd className={`text-right ${cls}`}>
          {sign}
          {Math.abs(ilT1).toFixed(4)} {token1Symbol} ({sign}
          {Math.abs(ilPct * 100).toFixed(2)}%)
        </dd>
      </dl>
      <p className="mt-3 text-[10px] text-slate-500">
        Computed from Uniswap v3 whitepaper formulas (eq. 6.29 / 6.30) — values
        denominated in {token1Symbol}.
      </p>
    </section>
  );
}
