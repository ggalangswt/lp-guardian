import type { Hex } from "viem";
import type { ServerConfig } from "../config.js";
import type { AssembledReportPayload } from "../pipeline/reportTypes.js";

export interface IpfsResult {
  cid: string;
  url: string;
}

/**
 * Uploads a report payload to IPFS via the Pinata pinJSON API. Activated only
 * when STORAGE_PROVIDER=ipfs and IPFS_TOKEN (a Pinata JWT) is set. The CID lets
 * anyone re-download the report and verify it against the on-chain rootHash.
 */
export async function uploadToIpfs(
  config: ServerConfig,
  rootHash: Hex,
  payload: AssembledReportPayload,
): Promise<IpfsResult> {
  if (!config.ipfsToken) throw new Error("IPFS_TOKEN not configured");

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ipfsToken}`,
    },
    body: JSON.stringify({
      pinataMetadata: { name: `lp-guardian-report-${rootHash.slice(0, 10)}` },
      pinataContent: payload,
    }),
  });

  if (!res.ok) {
    throw new Error(`pinata ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { IpfsHash: string };
  const cid = data.IpfsHash;
  return { cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` };
}
