// Deterministic verdict logic — MUST stay in sync with the main server's
// apps/server/src/pipeline/verdict.ts (buildDeterministicVerdict). This copy
// runs *inside the TEE*, so the attestation proves this exact logic produced
// the verdict from the given inputs.

/**
 * @param {{
 *   pair: string,
 *   il: { ilPct: number, ilT1: number, lpValueT1: number, feesValueT1: number },
 *   regime: { topLabel: string, confidence: number },
 *   hookScore: { family: string, deltaAprPct: number, deltaIlPct: number },
 * }} i
 */
export function buildVerdict(i) {
  const ilPct = i.il.ilPct * 100;
  const feesBeatIl = i.il.feesValueT1 >= i.il.ilT1;
  const hookHelps =
    i.hookScore.deltaAprPct > 0.5 || i.hookScore.deltaIlPct < -0.2;
  const regime = i.regime.topLabel;

  let recommendation;
  let headline;

  if (i.il.lpValueT1 < 1) {
    recommendation = "monitor";
    headline = "Position is empty/out-of-range — monitor before redeploying.";
  } else if (
    !feesBeatIl &&
    hookHelps &&
    (regime === "trending" || regime === "high_toxic")
  ) {
    recommendation = "migrate";
    headline = `IL is outrunning fees in a ${regime.replace("_", "-")} regime. A ${i.hookScore.family} hook recovers ~${i.hookScore.deltaAprPct.toFixed(1)}% APR — migrate.`;
  } else if (!feesBeatIl) {
    recommendation = "rebalance";
    headline =
      "Fees aren't keeping up with IL. Rebalance to a wider, fee-aware range.";
  } else {
    recommendation = "hold";
    headline = "Fees are covering IL. Hold and keep monitoring.";
  }

  const markdown = [
    `**${recommendation.toUpperCase()}** — ${headline}`,
    "",
    `- IL vs HODL: ${ilPct >= 0 ? "-" : "+"}${Math.abs(ilPct).toFixed(2)}%`,
    `- Fees captured: $${i.il.feesValueT1.toFixed(2)}`,
    `- Regime: ${regime.replace("_", "-")} (${Math.round(i.regime.confidence * 100)}%)`,
    `- Best hook: ${i.hookScore.family} (Δapr ${i.hookScore.deltaAprPct.toFixed(1)}%, Δil ${i.hookScore.deltaIlPct.toFixed(2)}%)`,
    "",
    "_Verdict produced inside a TEE. Execute remains user-approved only._",
  ].join("\n");

  return { recommendation, markdown };
}
