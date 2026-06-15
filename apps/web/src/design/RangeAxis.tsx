interface Props {
  lo: number;
  hi: number;
  cur: number;
  height?: number;
}

export function RangeAxis({ lo, hi, cur, height = 24 }: Props) {
  const inRange = cur >= lo && cur <= hi;
  const span = hi - lo;
  const pct = Math.max(-15, Math.min(115, ((cur - lo) / span) * 100));
  const clamped = Math.max(0, Math.min(100, pct));
  const outside = pct < 0 || pct > 100;
  return (
    <div style={{ position: "relative", width: "100%", height, marginTop: 8 }}>
      <div
        style={{
          position: "absolute",
          top: height / 2 - 0.5,
          left: 0,
          right: 0,
          height: 1,
          background: "var(--border)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: height / 2 - 2.5,
          left: "8%",
          right: "8%",
          height: 5,
          borderRadius: 2,
          background: inRange
            ? "linear-gradient(90deg, transparent, var(--healthy) 20%, var(--healthy) 80%, transparent)"
            : "linear-gradient(90deg, transparent, var(--text-tertiary) 20%, var(--text-tertiary) 80%, transparent)",
          opacity: inRange ? 0.6 : 0.35,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "8%",
          top: 2,
          bottom: 2,
          width: 1,
          background: "var(--text-tertiary)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "8%",
          top: 2,
          bottom: 2,
          width: 1,
          background: "var(--text-tertiary)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: height / 2 - 4,
          left: `calc(8% + ${(clamped / 100) * 84}% - 4px)`,
          width: 8,
          height: 8,
          borderRadius: 999,
          background: outside ? "var(--bleed)" : "var(--cyan)",
          boxShadow: `0 0 10px var(--${outside ? "bleed" : "cyan"}-glow)`,
          transition: "left 400ms var(--ease-signal)",
        }}
      />
    </div>
  );
}
