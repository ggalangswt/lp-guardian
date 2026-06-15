import { Fragment, useEffect, useRef, useState } from "react";

// Cinematic 14s prism sequence — six beats: idle → incident → refract →
// fan → crystallize → sign. Mouse drift subtly tilts the prism. Honors
// prefers-reduced-motion by holding the final frame.

const DUR = 14000;

const SPECTRUM_RAYS = [
  { c: "var(--spec-1)", angle: -14, label: "IL", delay: 0.0 },
  { c: "var(--spec-2)", angle: -7, label: "REGIME", delay: 0.08 },
  { c: "var(--spec-3)", angle: 0, label: "FEES", delay: 0.16 },
  { c: "var(--spec-4)", angle: 7, label: "TOXIC", delay: 0.24 },
  { c: "var(--spec-5)", angle: 14, label: "HOOK", delay: 0.32 },
] as const;

const BEAT_WINDOWS: Array<[string, number]> = [
  ["IDLE", 0],
  ["INCIDENT", 0.1],
  ["REFRACT", 0.22],
  ["FAN", 0.4],
  ["CRYSTALLIZE", 0.65],
  ["SIGN", 0.82],
];

function ease(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function beatProgress(t: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (t - start) / (end - start)));
}

export function HeroFilm() {
  const [t, setT] = useState(0);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const reducedRef = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reducedRef.current) {
      setT(0.82);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = ((now - start) % DUR) / DUR;
      setT(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMouse({ x: e.clientX / w, y: e.clientY / h });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const pilot = ease(beatProgress(t, 0.0, 0.12));
  const prismForm = ease(beatProgress(t, 0.1, 0.25));
  const spectrum = ease(beatProgress(t, 0.22, 0.45));
  const crystal = ease(beatProgress(t, 0.4, 0.68));
  const signature = ease(beatProgress(t, 0.65, 0.82));
  const hold = t < 0.96 ? 1 : 1 - ease((t - 0.96) / 0.04);

  const tiltX = (mouse.y - 0.5) * -4;
  const tiltY = (mouse.x - 0.5) * 6;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity: hold,
        pointerEvents: "none",
      }}
    >
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.35 + 0.25 * prismForm,
        }}
      >
        <defs>
          <pattern id="film-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#22222B" strokeWidth="0.5" />
          </pattern>
          <pattern id="film-grid-fine" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#1A1A20" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="film-mask" cx="50%" cy="55%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="m-film-grid">
            <rect width="100%" height="100%" fill="url(#film-mask)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#film-grid-fine)" mask="url(#m-film-grid)" />
        <rect width="100%" height="100%" fill="url(#film-grid)" mask="url(#m-film-grid)" />
      </svg>

      <DriftParticles intensity={0.4 + 0.6 * prismForm} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="-500 -260 1000 520"
          style={{
            width: "min(1280px, 118%)",
            height: "118%",
            transform: `perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
            transition: "transform 300ms var(--ease-signal)",
          }}
        >
          <defs>
            <filter id="f-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="f-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <linearGradient id="pilot-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#F2EFE8" stopOpacity="0" />
              <stop offset="70%" stopColor="#F2EFE8" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#FFE9C0" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="prism-face-v2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FFB020" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#C59CFF" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#FFB020" stopOpacity="0.10" />
            </linearGradient>
            <linearGradient id="prism-edge-v2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FFB020" stopOpacity="1" />
              <stop offset="100%" stopColor="#C59CFF" stopOpacity="1" />
            </linearGradient>
          </defs>

          <g opacity={0.25 + 0.5 * prismForm}>
            <line x1="-480" y1="0" x2="480" y2="0" stroke="#33333F" strokeWidth="0.4" strokeDasharray="2 6" />
            {[-400, -300, -200, 200, 300, 400].map((x) => (
              <line key={x} x1={x} y1="-4" x2={x} y2="4" stroke="#33333F" strokeWidth="0.4" />
            ))}
          </g>

          <g opacity={pilot}>
            <line
              x1="-480"
              y1="0"
              x2={-90 - (1 - pilot) * 200}
              y2="0"
              stroke="url(#pilot-grad)"
              strokeWidth="2.2"
              filter="url(#f-glow)"
            />
            <line
              x1="-480"
              y1="0"
              x2={-90 - (1 - pilot) * 200}
              y2="0"
              stroke="#FFE9C0"
              strokeWidth="0.6"
              opacity="0.95"
            />
            {pilot > 0.6 && (
              <circle
                cx="-90"
                cy="0"
                r={3 + Math.sin(t * 40) * 0.8}
                fill="#FFE9C0"
                filter="url(#f-glow)"
              />
            )}
          </g>

          <g
            transform={`scale(${0.6 + 0.4 * prismForm})`}
            opacity={prismForm}
            filter="url(#f-glow)"
          >
            <polygon
              points="-95,85 95,85 0,-95"
              fill="url(#prism-face-v2)"
              stroke="url(#prism-edge-v2)"
              strokeWidth={1.2 + spectrum * 0.5}
              strokeLinejoin="round"
            />
            <line
              x1="-95"
              y1="85"
              x2="0"
              y2="0"
              stroke="var(--cyan)"
              strokeWidth="0.5"
              opacity={0.4 + spectrum * 0.4}
            />
            <line
              x1="95"
              y1="85"
              x2="0"
              y2="0"
              stroke="var(--violet)"
              strokeWidth="0.5"
              opacity={0.4 + spectrum * 0.4}
            />
            <circle
              cx="0"
              cy="0"
              r={2 + Math.sin(t * 20) * 1}
              fill="#fff"
              opacity={0.6 + spectrum * 0.4}
              filter="url(#f-soft)"
            />
          </g>

          <g>
            {SPECTRUM_RAYS.map((r, i) => {
              const local = ease(Math.max(0, Math.min(1, (spectrum - r.delay) * 2.5)));
              if (local <= 0) return null;
              const endX = 95 + local * 360;
              const endY = Math.tan((r.angle * Math.PI) / 180) * local * 360;
              return (
                <g key={i} opacity={local}>
                  <line
                    x1="95"
                    y1="0"
                    x2={endX}
                    y2={endY}
                    stroke={r.c}
                    strokeWidth="6"
                    opacity="0.15"
                    filter="url(#f-soft)"
                  />
                  <line
                    x1="95"
                    y1="0"
                    x2={endX}
                    y2={endY}
                    stroke={r.c}
                    strokeWidth="1.4"
                    filter="url(#f-glow)"
                  />
                  <line
                    x1="95"
                    y1="0"
                    x2={endX}
                    y2={endY}
                    stroke={r.c}
                    strokeWidth="0.4"
                    opacity="1"
                  />
                </g>
              );
            })}
          </g>

          <g>
            {SPECTRUM_RAYS.map((r, i) => {
              const local = ease(Math.max(0, Math.min(1, (crystal - r.delay * 0.6) * 2)));
              if (local <= 0) return null;
              const endX = 95 + 360;
              const endY = Math.tan((r.angle * Math.PI) / 180) * 360;
              return (
                <g
                  key={i}
                  transform={`translate(${endX}, ${endY}) scale(${local})`}
                  opacity={local}
                >
                  <polygon points="-8,0 0,-8 8,0 0,8" fill={r.c} opacity="0.25" />
                  <polygon points="-5,0 0,-5 5,0 0,5" fill={r.c} filter="url(#f-glow)" />
                  <text
                    x="18"
                    y="3"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fill={r.c}
                    letterSpacing="0.14em"
                  >
                    {r.label}
                  </text>
                </g>
              );
            })}
          </g>

          <g transform="translate(0, 180)" opacity={signature * 0.9}>
            <line
              x1="-280"
              y1="0"
              x2="280"
              y2="0"
              stroke="var(--border-strong)"
              strokeWidth="0.5"
            />
            {Array.from({ length: 56 }).map((_, i) => {
              const x = -280 + (i / 55) * 560;
              const amp = Math.sin(i * 0.45 + t * 6) * 6 * Math.sin((i / 56) * Math.PI);
              return (
                <line
                  key={i}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2={-amp}
                  stroke="var(--cyan)"
                  strokeWidth="0.8"
                  opacity={0.6 + 0.4 * Math.sin(i * 0.3)}
                />
              );
            })}
            <text
              x="-280"
              y="20"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill="var(--text-tertiary)"
              letterSpacing="0.16em"
            >
              TEE SIG · 0x7ac4f6e2d8c1a4f2…b812
            </text>
            <text
              x="280"
              y="20"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill="var(--text-tertiary)"
              letterSpacing="0.16em"
              textAnchor="end"
            >
              {/* TODO(arch): TEE label */}
              SIGNED · TEE ENCLAVE
            </text>
          </g>
        </svg>
      </div>

      <FilmCorners />

      <div
        style={{
          position: "absolute",
          bottom: 92,
          left: 36,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {BEAT_WINDOWS.map(([lbl, start], i) => {
          const next = BEAT_WINDOWS[i + 1]?.[1] ?? 1;
          const active = t >= start && t < next;
          return (
            <Fragment key={lbl}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: active ? "var(--cyan)" : "var(--text-faint)",
                  transition: "color 200ms",
                }}
              >
                {lbl}
              </div>
              {i < BEAT_WINDOWS.length - 1 && (
                <div style={{ width: 8, height: 1, background: "var(--border-strong)" }} />
              )}
            </Fragment>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 92,
          right: 36,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-tertiary)",
          letterSpacing: "0.12em",
          display: "flex",
          gap: 14,
        }}
      >
        <span>REC · {(t * 14).toFixed(2).padStart(5, "0")}s / 14.00s</span>
        <span style={{ color: "var(--bleed)" }}>● LIVE</span>
      </div>
    </div>
  );
}

function FilmCorners() {
  const marks: Array<{ pos: Record<string, number>; h: "l" | "r"; v: "t" | "b" }> = [
    { pos: { top: 20, left: 20 }, h: "l", v: "t" },
    { pos: { top: 20, right: 20 }, h: "r", v: "t" },
    { pos: { bottom: 20, left: 20 }, h: "l", v: "b" },
    { pos: { bottom: 20, right: 20 }, h: "r", v: "b" },
  ];
  return (
    <>
      {marks.map((m, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            ...m.pos,
            width: 20,
            height: 20,
            borderLeft: m.h === "l" ? "1px solid var(--cyan)" : undefined,
            borderRight: m.h === "r" ? "1px solid var(--cyan)" : undefined,
            borderTop: m.v === "t" ? "1px solid var(--cyan)" : undefined,
            borderBottom: m.v === "b" ? "1px solid var(--cyan)" : undefined,
            opacity: 0.6,
          }}
        />
      ))}
    </>
  );
}

interface DriftProps {
  intensity: number;
}

function DriftParticles({ intensity }: DriftProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const N = 200;
    const P = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00035,
      vy: (Math.random() - 0.5) * 0.00022,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.5 + 0.15,
      hue:
        Math.random() < 0.15
          ? "amber"
          : Math.random() < 0.3
            ? "violet"
            : "dim",
    }));
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
        if (p.y < -0.05) p.y = 1.05;
        if (p.y > 1.05) p.y = -0.05;
        const color =
          p.hue === "amber"
            ? "rgba(255,176,32,"
            : p.hue === "violet"
              ? "rgba(197,156,255,"
              : "rgba(154,149,138,";
        ctx.fillStyle = color + p.a * intensity + ")";
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity]);
  return (
    <canvas
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.9,
      }}
    />
  );
}
