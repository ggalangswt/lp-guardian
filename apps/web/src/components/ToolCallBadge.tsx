import type { DiagnosticEvent } from "@lp-guardian/core";

type ToolEvent = Extract<
  DiagnosticEvent,
  { type: "tool.call" } | { type: "tool.result" }
>;

interface Props {
  event: ToolEvent;
}

export function ToolCallBadge({ event }: Props) {
  const isCall = event.type === "tool.call";
  const cls = isCall
    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40"
    : "bg-emerald-500/10 text-emerald-300 border-emerald-500/40";

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-mono border ${cls}`}
    >
      <span className="font-semibold">{event.tool}</span>
      {isCall ? (
        <span className="text-slate-400">→</span>
      ) : (
        <span className="text-slate-400">{event.latencyMs}ms</span>
      )}
    </div>
  );
}
