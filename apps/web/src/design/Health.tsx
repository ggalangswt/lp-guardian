interface Props {
  status: "healthy" | "drift" | "bleeding";
}

const COLOR: Record<Props["status"], "healthy" | "toxic" | "bleed"> = {
  healthy: "healthy",
  drift: "toxic",
  bleeding: "bleed",
};

const LABEL: Record<Props["status"], string> = {
  healthy: "In-range",
  drift: "Drifting",
  bleeding: "Bleeding",
};

export function Health({ status }: Props) {
  const color = COLOR[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: `var(--${color})`,
          boxShadow: `0 0 12px var(--${color}-glow), 0 0 0 2px rgba(255,255,255,0.04)`,
          animation:
            status === "bleeding"
              ? "pulse-dot 1.2s infinite"
              : status === "drift"
                ? "pulse-dot 2.2s infinite"
                : undefined,
        }}
      />
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: `var(--${color})`,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {LABEL[status]}
      </span>
    </div>
  );
}
