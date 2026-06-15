import { Cap, Mono } from "../design/atoms.js";

interface Props {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "toxic" | "bleed" | "cyan" | "violet";
  isLast?: boolean;
}

const TONE_TO_COLOR: Record<NonNullable<Props["tone"]>, string> = {
  pos: "var(--healthy)",
  neg: "var(--bleed)",
  toxic: "var(--toxic)",
  bleed: "var(--bleed)",
  cyan: "var(--cyan)",
  violet: "var(--violet)",
};

export function AggStat({ label, value, sub, tone, isLast }: Props) {
  const color = tone ? TONE_TO_COLOR[tone] : "inherit";
  return (
    <div
      style={{
        padding: "18px 24px",
        borderRight: isLast ? undefined : "1px solid var(--border)",
      }}
    >
      <Cap>{label}</Cap>
      <Mono
        style={{
          display: "block",
          fontSize: 22,
          color,
          marginTop: 6,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </Mono>
      {sub && (
        <Mono
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 2,
          }}
        >
          {sub}
        </Mono>
      )}
    </div>
  );
}
