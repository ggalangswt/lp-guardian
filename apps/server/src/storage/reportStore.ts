import type { PublicReport } from "../pipeline/reportTypes.js";

// In-memory report cache keyed by rootHash. Sufficient for the demo lifetime;
// swap for Redis/Postgres if cross-restart durability is needed.
const store = new Map<string, PublicReport>();

export function putReport(report: PublicReport): void {
  store.set(report.rootHash.toLowerCase(), report);
}

export function getReport(rootHash: string): PublicReport | null {
  return store.get(rootHash.toLowerCase()) ?? null;
}

export function updateAnchor(
  rootHash: string,
  anchor: { txHash: string; chainId: number; stub: boolean },
): void {
  const existing = store.get(rootHash.toLowerCase());
  if (!existing) return;
  existing.anchorTxHash = anchor.txHash;
  existing.anchorChainId = anchor.chainId;
  existing.anchorStub = anchor.stub;
}
