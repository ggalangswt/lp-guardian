import { useState } from "react";
import { LabelBadge } from "./LabelBadge.js";
import { MigrationModal } from "./MigrationModal.js";

interface MigrationStep {
  kind: "close" | "swap" | "mint";
  description: string;
  detail?: Record<string, string>;
}

interface MigrationSwapQuote {
  routing: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  slippageTolerance: number;
  gasFeeUsd: string;
  routeKinds: string[];
}

export interface MigrationPreview {
  fromVersion: 3;
  targetHook?: { address: string; family: string; poolId: string };
  steps: MigrationStep[];
  swapQuote?: MigrationSwapQuote;
  warnings: string[];
}

const KIND_SYMBOL: Record<MigrationStep["kind"], string> = {
  close: "✕",
  swap: "↔",
  mint: "✦",
};

const KIND_COLOR: Record<MigrationStep["kind"], string> = {
  close: "var(--lp-bleed)",
  swap: "var(--lp-toxic)",
  mint: "var(--lp-healthy)",
};

function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

interface Props {
  preview: MigrationPreview;
  lpTokenId?: string;
}

export function MigrationPanel({ preview, lpTokenId }: Props) {
  const { steps, targetHook, swapQuote, warnings } = preview;
  const [open, setOpen] = useState(false);
  const canMigrate = preview.steps.length > 0;

  return (
    <>
      <section
        style={{
          background: "linear-gradient(180deg, oklch(0.995 0.006 300 / 0.96), oklch(0.972 0.014 300 / 0.98))",
          border: "2px solid var(--lp-border)",
          borderRadius: 3,
          boxShadow: "var(--lp-shadow)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div className="diagnose-window-bar">
          <span className="diagnose-window-dot diagnose-window-dot-red" />
          <span className="diagnose-window-dot diagnose-window-dot-yellow" />
          <span className="diagnose-window-dot diagnose-window-dot-green" />
          <span className="diagnose-window-title">migration.preview</span>
          <div style={{ marginLeft: "auto" }}>
            <LabelBadge label="EMULATED" />
          </div>
        </div>

        <div style={{ padding: "16px 18px" }}>
          {/* Target hook */}
          {targetHook ? (
            <p
              style={{
                margin: "0 0 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--lp-ink-soft)",
                lineHeight: 1.5,
              }}
            >
              target{" "}
              <span style={{ color: "var(--lp-purple)", fontWeight: 700 }}>
                {shortAddr(targetHook.address)}
              </span>{" "}
              &middot;{" "}
              <span style={{ color: "var(--lp-ink)" }}>
                {targetHook.family.toLowerCase().replace(/_/g, "-")}
              </span>
            </p>
          ) : (
            <p
              style={{
                margin: "0 0 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--lp-ink-faint)",
              }}
            >
              no v4 target hook discovered for this pair
            </p>
          )}

          {/* Steps — full border, health dot, no side stripe */}
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {steps.map((step, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 12px",
                  border: `1.5px solid var(--lp-border-mid)`,
                  borderRadius: 3,
                  background: "oklch(0.985 0.012 300 / 0.6)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    lineHeight: "18px",
                    textAlign: "center",
                    borderRadius: 2,
                    background: `color-mix(in oklch, ${KIND_COLOR[step.kind]} 14%, oklch(0.985 0.012 300))`,
                    color: KIND_COLOR[step.kind],
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {KIND_SYMBOL[step.kind]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--lp-ink)" }}>{step.description}</div>
                  {step.detail && (
                    <div
                      style={{
                        marginTop: 4,
                        color: "var(--lp-ink-faint)",
                        fontSize: 10,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "2px 12px",
                      }}
                    >
                      {Object.entries(step.detail).map(([k, v]) => (
                        <span key={k}>
                          <span style={{ color: "var(--lp-border-mid)", opacity: 0.7 }}>{k}=</span>
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Swap quote grid */}
          {swapQuote && (
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 1,
                border: "1.5px solid var(--lp-border-mid)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              {[
                { label: "routing", value: swapQuote.routing },
                { label: "price impact", value: `${(swapQuote.priceImpact * 100).toFixed(3)}%` },
                { label: "gas fee", value: `$${swapQuote.gasFeeUsd}` },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    padding: "8px 10px",
                    background: "oklch(0.975 0.014 300 / 0.7)",
                    borderRight: "1px solid var(--lp-border-soft)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--lp-ink-faint)" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--lp-ink)", marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <ul
              style={{
                marginTop: 10,
                padding: "8px 12px 8px 28px",
                border: "1.5px solid oklch(0.78 0.19 88 / 0.40)",
                borderRadius: 3,
                background: "oklch(0.78 0.19 88 / 0.06)",
                fontSize: 10,
                color: "var(--lp-toxic)",
                lineHeight: 1.7,
                fontFamily: "var(--font-mono)",
              }}
            >
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {/* Footer row */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--lp-border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <p
              style={{
                flex: 1,
                margin: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--lp-ink-faint)",
                lineHeight: 1.6,
              }}
            >
              Quote fetched live for a sample notional. The agent never executes — you sign at migration time.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={!canMigrate}
              style={{
                padding: "7px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "oklch(0.12 0.02 260)", /* Hard ink color for visibility */
                background: "oklch(0.985 0.012 300)",
                border: "2px solid var(--lp-cobalt)",
                borderRadius: 2,
                boxShadow: "3px 3px 0 var(--lp-cobalt)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "box-shadow 80ms ease-out, transform 80ms ease-out",
              }}
              onMouseEnter={(e) => {
                if (!canMigrate) return;
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "1px 1px 0 var(--lp-cobalt)";
                (e.currentTarget as HTMLButtonElement).style.transform = "translate(2px, 2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--lp-cobalt)";
                (e.currentTarget as HTMLButtonElement).style.transform = "";
              }}
            >
              Migrate →
            </button>
          </div>
        </div>
      </section>

      {open && (
        <MigrationModal
          preview={{
            fromVersion: preview.fromVersion,
            targetHook: preview.targetHook
              ? { address: preview.targetHook.address, family: preview.targetHook.family }
              : undefined,
            steps: preview.steps,
            warnings: preview.warnings,
          }}
          lpTokenId={lpTokenId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
