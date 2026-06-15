import { keccak256, toBytes, type Hex } from "viem";
import type { ServerConfig } from "../config.js";
import type { AssembledReportPayload, PublicReport } from "../pipeline/reportTypes.js";
import { putReport } from "./reportStore.js";
import { uploadToIpfs } from "./ipfs.js";

export interface UploadResult {
  rootHash: Hex;
  storageUrl: string;
  storageStub: boolean;
}

/** Canonical JSON for hashing — stable key order. */
function canonical(payload: AssembledReportPayload): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

/** keccak256 fingerprint of the report payload (the value anchored on-chain). */
export function computeRootHash(payload: AssembledReportPayload): Hex {
  return keccak256(toBytes(canonical(payload)));
}

/**
 * Persists a report body and returns its rootHash + storage URL. Uses IPFS when
 * configured (STORAGE_PROVIDER=ipfs + IPFS_TOKEN); otherwise serves the body
 * from the backend and emits a stub:// URL (frontend renders "stub provenance").
 */
export async function uploadReport(
  config: ServerConfig,
  payload: AssembledReportPayload,
): Promise<UploadResult> {
  const rootHash = computeRootHash(payload);

  const record: PublicReport = {
    rootHash,
    storageUrl: `stub://lp-guardian/reports/${rootHash}`,
    storageStub: true,
    cachedAt: new Date().toISOString(),
    payload,
  };

  if (config.storageProvider === "ipfs" && config.ipfsToken) {
    try {
      const { url } = await uploadToIpfs(config, rootHash, payload);
      record.storageUrl = url;
      record.storageStub = false;
    } catch (err) {
      console.warn(`[storage] IPFS upload failed, keeping stub: ${String(err)}`);
    }
  }

  putReport(record);
  return {
    rootHash,
    storageUrl: record.storageUrl,
    storageStub: record.storageStub,
  };
}
