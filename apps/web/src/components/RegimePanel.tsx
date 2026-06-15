import { LabelBadge } from "./LabelBadge.js";

// Wire-format shape emitted by the server's `tool.result` for `classifyRegime`.
// Must stay in sync with @lp-guardian/agent's Phase4 output.
export type RegimeLabel =
  | "mean_reverting"
  | "trending"
  | "high_toxic"
  | "jit_dominated";

export interface RegimeFeatures {
  volRealized: number;
  hurst: number;
  slope: number;
  rSquared: number;
  toxicityProxy: number;
  jitProxy: number;
  hoursAnalyzed: number;
}

export interface RegimeScores {
  mean_reverting: number;
  trending: number;
  high_toxic: number;
  jit_dominated: number;
}

export interface RegimeClassification {
  topLabel: RegimeLabel;
  confidence: number;
  scores: RegimeScores;
  features: RegimeFeatures;
}

const LABEL_TEXT: Record<RegimeLabel, string> = {
  mean_reverting: "mean-reverting",
  trending: "trending",
  high_toxic: "high-toxic flow",
  jit_dominated: "JIT-dominated",
};

const LABEL_CLS: Record<RegimeLabel, string> = {
  mean_reverting: "text-emerald-300",
  trending: "text-cyan-300",
  high_toxic: "text-rose-300",
  jit_dominated: "text-amber-300",
};

interface Props {
  classification: RegimeClassification;
}

export function RegimePanel({ classification }: Props) {
  const { topLabel, confidence, scores, features } = classification;
  const confText =
    confidence < 0.4 ? "low" : confidence < 0.7 ? "moderate" : "high";

  return (
    <section className="p-4 rounded-lg border border-slate-700 bg-slate-900/50">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Regime
        </h2>
        <LabelBadge label="ESTIMATED" />
      </header>

      <p className="mt-3">
        <span className={`text-base font-semibold ${LABEL_CLS[topLabel]}`}>
          {LABEL_TEXT[topLabel]}
        </span>
        <span className="ml-2 text-xs font-mono text-slate-500">
          confidence {confText} ({(confidence * 100).toFixed(0)}%)
        </span>
      </p>

      <div className="mt-3 space-y-1">
        {(Object.keys(scores) as RegimeLabel[]).map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs font-mono">
            <span className="w-32 text-slate-500">{LABEL_TEXT[k]}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-slate-500"
                style={{ width: `${scores[k] * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-slate-400">
              {(scores[k] * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-1 text-[11px] font-mono text-slate-500">
        <dt>vol realised</dt>
        <dd className="text-right text-slate-400">
          {(features.volRealized * 100).toFixed(1)}%
        </dd>
        <dt>hurst</dt>
        <dd className="text-right text-slate-400">
          {features.hurst.toFixed(2)}
        </dd>
        <dt>slope</dt>
        <dd className="text-right text-slate-400">
          {features.slope.toExponential(2)}
        </dd>
        <dt>r²</dt>
        <dd className="text-right text-slate-400">
          {features.rSquared.toFixed(2)}
        </dd>
        <dt>hours analysed</dt>
        <dd className="text-right text-slate-400">
          {features.hoursAnalyzed}
        </dd>
      </dl>
    </section>
  );
}
