import { zeroHash, type Hex } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "./clients.js";
import { portfolioReportRegistryAbi } from "./abis.js";

export interface AnchorInput {
  portfolioOwner: `0x${string}`;
  subjectId: bigint;
  rootHash: Hex;
  attestationHash?: Hex;
}

export interface AnchorResult {
  txHash: string;
  chainId: number;
  /** false when no signer was configured and a deterministic stub was emitted. */
  onchain: boolean;
}

/** Anchors a report's rootHash on-chain (Robinhood in robinhood mode, stub in mantle mode).
 *  Returns a stub txHash (and onchain=false) when no signer is configured or the
 *  write fails, so the pipeline always completes. */
export async function anchorReport(
  config: ServerConfig,
  input: AnchorInput,
): Promise<AnchorResult> {
  const activeChainId = config.chainMode === "mantle"
    ? config.mantleChainId
    : config.robinhoodChainId;

  // In mantle mode, report anchoring goes through the Turing Registry
  // (recordDecision/recordOutcome in agentOrchestrator). Emit a stub here.
  if (config.chainMode === "mantle") {
    return {
      txHash: stubTxHash(input.rootHash),
      chainId: activeChainId,
      onchain: false,
    };
  }

  const { robinhood, robinhoodWallet, robinhoodAccount } = getChainClients(config);

  if (!robinhoodWallet || !robinhoodAccount) {
    return {
      txHash: stubTxHash(input.rootHash),
      chainId: activeChainId,
      onchain: false,
    };
  }

  try {
    const args = [
      input.portfolioOwner,
      input.subjectId,
      input.rootHash,
      input.attestationHash ?? zeroHash,
    ] as const;

    // Validate via eth_call first (cheap; surfaces reverts early).
    await robinhood.simulateContract({
      account: robinhoodAccount,
      address: config.reportRegistryAddress,
      abi: portfolioReportRegistryAbi,
      functionName: "publishReport",
      args,
    });

    // Write with the local Account object so viem signs locally and submits via
    // eth_sendRawTransaction (the Orbit RPC has no unlocked accounts).
    const txHash = await robinhoodWallet.writeContract({
      account: robinhoodAccount,
      chain: robinhoodWallet.chain,
      address: config.reportRegistryAddress,
      abi: portfolioReportRegistryAbi,
      functionName: "publishReport",
      args,
    });

    // Best-effort confirmation; still treat as on-chain if it times out.
    try {
      await robinhood.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 });
    } catch {
      /* receipt timeout — tx may still confirm */
    }

    return { txHash, chainId: activeChainId, onchain: true };
  } catch (err) {
    console.warn(`[reportRegistry] anchor failed, emitting stub: ${String(err)}`);
    let cause = (err as { cause?: unknown }).cause;
    let depth = 0;
    while (cause && depth < 6) {
      const c = cause as { name?: string; shortMessage?: string; message?: string; cause?: unknown };
      console.warn(`  ↳ cause: ${c.name ?? ""} :: ${c.shortMessage ?? c.message ?? String(cause)}`);
      cause = c.cause;
      depth++;
    }
    return {
      txHash: stubTxHash(input.rootHash),
      chainId: activeChainId,
      onchain: false,
    };
  }
}

export interface OnchainReport {
  publisher: `0x${string}`;
  timestamp: bigint;
  portfolioOwner: `0x${string}`;
  subjectId: bigint;
  rootHash: Hex;
  attestationHash: Hex;
  exists: boolean;
}

/** Reads a previously anchored report back from the registry. */
export async function getOnchainReport(
  config: ServerConfig,
  rootHash: Hex,
): Promise<OnchainReport | null> {
  const { robinhood } = getChainClients(config);
  try {
    const res = (await robinhood.readContract({
      address: config.reportRegistryAddress,
      abi: portfolioReportRegistryAbi,
      functionName: "getReport",
      args: [rootHash],
    })) as readonly [`0x${string}`, bigint, `0x${string}`, bigint, Hex, Hex];

    const [publisher, timestamp, portfolioOwner, subjectId, storedRoot, attestationHash] =
      res;
    const exists = publisher !== "0x0000000000000000000000000000000000000000";
    return {
      publisher,
      timestamp,
      portfolioOwner,
      subjectId,
      rootHash: storedRoot,
      attestationHash,
      exists,
    };
  } catch (err) {
    console.warn(`[reportRegistry] getReport failed: ${String(err)}`);
    return null;
  }
}

function stubTxHash(rootHash: Hex): string {
  return `0xstub_anchor_${rootHash.slice(2, 18)}`;
}
