// Honesty labels attached to every numeric value rendered in a report.
// Prevents the demo from silently presenting emulations as facts.

export type Label =
  | "VERIFIED" // read directly on-chain / canonical subgraph
  | "COMPUTED" // derived mathematically from VERIFIED data
  | "ESTIMATED" // heuristic with confidence interval
  | "EMULATED" // simulation result — always comes with warnings[]
  | "LABELED"; // manual curation

export interface Labeled<T> {
  value: T;
  label: Label;
  confidence?: number; // 0-1 for ESTIMATED
  warnings?: string[]; // non-empty for EMULATED
  source?: string;
}

export function verified<T>(value: T, source?: string): Labeled<T> {
  return { value, label: "VERIFIED", source };
}

export function computed<T>(value: T, source?: string): Labeled<T> {
  return { value, label: "COMPUTED", source };
}

export function estimated<T>(
  value: T,
  confidence: number,
  source?: string,
): Labeled<T> {
  return { value, label: "ESTIMATED", confidence, source };
}

export function emulated<T>(value: T, warnings: string[]): Labeled<T> {
  return { value, label: "EMULATED", warnings };
}

export function labeled<T>(value: T, source?: string): Labeled<T> {
  return { value, label: "LABELED", source };
}
