// Independent (Node-local) verification that a TEE attestation binds to the
// exact inputs/outputs we sent — WITHOUT trusting the CVM. We recompute the
// 32-byte commitment with the same canonical serializer as the Python service
// (`services/be-data/tee/common.py`) and confirm those bytes are embedded in the
// decoded attestation (the TDX quote's report_data).
//
// This is defense-in-depth: a compromised or swapped CVM cannot make a quote
// claim our data unless the quote actually commits to it. Full Intel DCAP
// signature-chain verification (proving genuine TDX hardware) is separate
// and out of scope here.

import { createHash } from "node:crypto";

/**
 * Canonical serializer mirroring `_canon` in the Python service:
 * sorted keys, no spaces, integer-valued numbers as plain integers, other
 * numbers fixed to 6 decimals (compute outputs are rounded to 6dp).
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (Number.isFinite(value) && Number.isInteger(value)) return String(value);
    return value.toFixed(6);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return (
      "{" +
      entries.map(([k, v]) => `${JSON.stringify(String(k))}:${canonicalize(v)}`).join(",") +
      "}"
    );
  }
  return JSON.stringify(String(value));
}

/** The 32-byte commitment, as a lowercase hex string (no 0x). */
export function commitmentHex(inputData: unknown, outputData: unknown, reportHash: string): string {
  const payload = canonicalize({ inputData, outputData, reportHash });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function decodeCandidates(attestation: string): Buffer[] {
  const out: Buffer[] = [];
  try {
    const b64 = Buffer.from(attestation, "base64");
    if (b64.length) out.push(b64);
    // The base64 payload may itself be a hex string (dstack often returns hex).
    const asText = b64.toString("ascii").trim();
    const hex = asText.startsWith("0x") ? asText.slice(2) : asText;
    if (hex.length >= 2 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      out.push(Buffer.from(hex, "hex"));
    }
  } catch {
    /* ignore */
  }
  try {
    const hex = attestation.startsWith("0x") ? attestation.slice(2) : attestation;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      out.push(Buffer.from(hex, "hex"));
    }
  } catch {
    /* ignore */
  }
  return out;
}

export interface TeeBindingResult {
  verified: boolean;
  commitment: `0x${string}`;
  warnings: string[];
}

/**
 * Verify the attestation's report_data binds to (inputData, outputData,
 * reportHash). Returns verified=false (with a warning) rather than throwing.
 */
export function verifyTeeBinding(
  attestation: string | undefined,
  inputData: unknown,
  outputData: unknown,
  reportHash: string,
): TeeBindingResult {
  const hex = commitmentHex(inputData, outputData, reportHash);
  const commitment = `0x${hex}` as const;
  if (!attestation) {
    return { verified: false, commitment, warnings: ["No attestation to verify."] };
  }
  const needle = Buffer.from(hex, "hex");
  const bound = decodeCandidates(attestation).some((blob) => blob.includes(needle));
  return {
    verified: bound,
    commitment,
    warnings: bound
      ? []
      : ["Commitment not found in attestation; quote does not bind to these inputs."],
  };
}
