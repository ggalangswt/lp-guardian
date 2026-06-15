import type { V3PositionRaw } from "./api.js";

export type Health = "green" | "amber" | "red";

// Classification combines two signals — out-of-range OR no fees collected
// is bleeding (red), in-range with fees flowing is healthy (green), the
// rest is drifting (amber). The pool's current tick comes from the
// subgraph; if the subgraph hasn't indexed swaps yet (tick null) we fall
// back to fee-ratio only.
const FEE_RATIO_HEALTHY_THRESHOLD = 0.005; // 0.5 % of deposited value

export function classifyHealth(p: V3PositionRaw): Health {
  const dep0 = parseFloat(p.depositedToken0);
  const dep1 = parseFloat(p.depositedToken1);
  const fee0 = parseFloat(p.collectedFeesToken0);
  const fee1 = parseFloat(p.collectedFeesToken1);
  const total = dep0 + dep1;
  if (total === 0) return "amber";

  const tickRaw = p.pool.tick;
  if (tickRaw !== null && tickRaw !== "") {
    const cur = parseInt(tickRaw, 10);
    const tl = parseInt(p.tickLower.tickIdx, 10);
    const tu = parseInt(p.tickUpper.tickIdx, 10);
    if (Number.isFinite(cur) && Number.isFinite(tl) && Number.isFinite(tu)) {
      const inRange = cur >= tl && cur <= tu;
      if (!inRange) return "red";
    }
  }

  const ratio = (fee0 + fee1) / total;
  if (ratio > FEE_RATIO_HEALTHY_THRESHOLD) return "green";
  if (ratio > 0) return "amber";
  // In range but zero fees — fresh position or dead pool, treat as drifting.
  return "amber";
}

export const HEALTH_COLORS: Record<Health, string> = {
  green: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  red: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};
