import type { CSSProperties, ReactNode } from "react";

// Tone keys map to chip-* classes defined in styles/tokens.css.
type Tone = "default" | "cyan" | "violet" | "bleed" | "healthy" | "toxic";

interface DotProps {
  color: "cyan" | "violet" | "bleed" | "healthy" | "toxic";
  pulse?: boolean;
}

export function Dot({ color, pulse }: DotProps) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: 999,
        background: `var(--${color})`,
        color: `var(--${color})`,
        animation: pulse ? "pulse-dot 1.6s infinite" : undefined,
        boxShadow: pulse ? `0 0 8px var(--${color}-glow)` : undefined,
      }}
    />
  );
}

interface ChipProps {
  tone?: Tone;
  mono?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function Chip({ tone = "default", mono = true, children, style }: ChipProps) {
  const cls = tone === "default" ? "chip" : `chip chip-${tone}`;
  return (
    <span
      className={cls}
      style={{ fontFamily: mono ? undefined : "var(--font-sans)", ...style }}
    >
      {children}
    </span>
  );
}

interface CapProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function Cap({ children, style }: CapProps) {
  return (
    <div className="cap" style={style}>
      {children}
    </div>
  );
}

interface MonoProps {
  children: ReactNode;
  color?: "cyan" | "violet" | "bleed" | "healthy" | "toxic" | "text" | "text-secondary" | "text-tertiary";
  style?: CSSProperties;
}

export function Mono({ children, color, style }: MonoProps) {
  return (
    <span
      className="mono"
      style={{
        color: color ? `var(--${color})` : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-secondary)",
        border: "1px solid var(--border-strong)",
        borderBottomWidth: 2,
        borderRadius: 4,
        background: "var(--surface)",
      }}
    >
      {children}
    </span>
  );
}

interface SectionHeaderProps {
  label: string;
  title: string;
  aside?: ReactNode;
  accent?: "cyan" | "violet";
}

export function SectionHeader({ label, title, aside, accent = "cyan" }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 24,
        marginBottom: 20,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ width: 18, height: 1, background: `var(--${accent})` }} />
          <span className="cap" style={{ color: `var(--${accent})` }}>
            {label}
          </span>
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            color: "var(--text)",
          }}
        >
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

export const fmt = {
  usd(n: number, sign = false): string {
    const abs = Math.abs(n);
    const s = abs < 1
      ? abs.toFixed(4)
      : abs >= 1000
        ? abs.toLocaleString("en-US", { maximumFractionDigits: 2 })
        : abs.toFixed(2);
    const pref = n < 0 ? "-$" : sign ? "+$" : "$";
    return pref + s;
  },
  pct(n: number, signFlag = true): string {
    return (signFlag && n > 0 ? "+" : "") + n.toFixed(1) + "%";
  },
  num(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  },
};

export function shortAddr(addr: string, head = 6, tail = 4): string {
  return addr.length <= head + tail ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
