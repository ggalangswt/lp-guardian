import { zeroHash, type Hex } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "./clients.js";
import { swapReplayVerifierAbi } from "./abis.js";

export interface PublishReplayInput {
  portfolioOwner: `0x${string}`;
  subjectId: bigint;
  pool: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
  swapCount: number;
  inputRoot: Hex;
  resultHash: Hex;
  attestationHash: Hex;
  teeImageHash?: Hex;
}

export interface PublishReplayResult {
  replayId: Hex;
  txHash: string;
  chainId: number;
  /** false when no signer was configured or the write fell back to a stub. */
  onchain: boolean;
}

/** Anchors an off-chain swap-replay proof on the Robinhood Chain
 *  SwapReplayVerifier. Mirrors anchorReport: simulate first, then write with the
 *  local Account (Orbit RPC has no unlocked accounts → eth_sendRawTransaction).
 *  Always resolves so the pipeline can continue even when the write fails. */
export async function publishReplay(
  config: ServerConfig,
  input: PublishReplayInput,
): Promise<PublishReplayResult> {
  const { robinhood, robinhoodWallet, robinhoodAccount } = getChainClients(config);

  const args = [
    input.portfolioOwner,
    input.subjectId,
    input.pool,
    input.fromBlock,
    input.toBlock,
    input.swapCount,
    input.inputRoot,
    input.resultHash,
    input.attestationHash,
    input.teeImageHash ?? zeroHash,
  ] as const;

  // Predict the replayId off-chain (matches the contract's keccak-packed id) so
  // callers always have it, even when no signer is configured.
  let replayId: Hex;
  try {
    replayId = (await robinhood.readContract({
      address: config.swapReplayVerifierAddress,
      abi: swapReplayVerifierAbi,
      functionName: "computeReplayId",
      args,
    })) as Hex;
  } catch {
    replayId = stubReplayId(input.resultHash);
  }

  if (!robinhoodWallet || !robinhoodAccount) {
    return {
      replayId,
      txHash: stubTxHash(input.resultHash),
      chainId: config.robinhoodChainId,
      onchain: false,
    };
  }

  try {
    // Validate via eth_call first (surfaces reverts like AlreadyPublished early).
    await robinhood.simulateContract({
      account: robinhoodAccount,
      address: config.swapReplayVerifierAddress,
      abi: swapReplayVerifierAbi,
      functionName: "publishReplay",
      args,
    });

    const txHash = await robinhoodWallet.writeContract({
      account: robinhoodAccount,
      chain: robinhoodWallet.chain,
      address: config.swapReplayVerifierAddress,
      abi: swapReplayVerifierAbi,
      functionName: "publishReplay",
      args,
    });

    try {
      await robinhood.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 });
    } catch {
      /* receipt timeout — tx may still confirm */
    }

    return { replayId, txHash, chainId: config.robinhoodChainId, onchain: true };
  } catch (err) {
    console.warn(`[swapReplayVerifier] publish failed, emitting stub: ${String(err)}`);
    let cause = (err as { cause?: unknown }).cause;
    let depth = 0;
    while (cause && depth < 6) {
      const c = cause as { name?: string; shortMessage?: string; message?: string; cause?: unknown };
      console.warn(`  ↳ cause: ${c.name ?? ""} :: ${c.shortMessage ?? c.message ?? String(cause)}`);
      cause = c.cause;
      depth++;
    }
    return {
      replayId,
      txHash: stubTxHash(input.resultHash),
      chainId: config.robinhoodChainId,
      onchain: false,
    };
  }
}

export interface OnchainReplay {
  publisher: `0x${string}`;
  timestamp: bigint;
  portfolioOwner: `0x${string}`;
  subjectId: bigint;
  pool: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
  swapCount: bigint;
  inputRoot: Hex;
  resultHash: Hex;
  attestationHash: Hex;
  teeImageHash: Hex;
  exists: boolean;
}

/** Reads a previously anchored replay proof back from the verifier. */
export async function getOnchainReplay(
  config: ServerConfig,
  replayId: Hex,
): Promise<OnchainReplay | null> {
  const { robinhood } = getChainClients(config);
  try {
    const res = (await robinhood.readContract({
      address: config.swapReplayVerifierAddress,
      abi: swapReplayVerifierAbi,
      functionName: "getReplay",
      args: [replayId],
    })) as readonly [
      `0x${string}`, bigint, `0x${string}`, bigint, `0x${string}`,
      bigint, bigint, bigint, Hex, Hex, Hex, Hex,
    ];
    const [
      publisher, timestamp, portfolioOwner, subjectId, pool,
      fromBlock, toBlock, swapCount, inputRoot, resultHash, attestationHash, teeImageHash,
    ] = res;
    return {
      publisher,
      timestamp,
      portfolioOwner,
      subjectId,
      pool,
      fromBlock,
      toBlock,
      swapCount,
      inputRoot,
      resultHash,
      attestationHash,
      teeImageHash,
      exists: publisher !== "0x0000000000000000000000000000000000000000",
    };
  } catch (err) {
    console.warn(`[swapReplayVerifier] getReplay failed: ${String(err)}`);
    return null;
  }
}

function stubTxHash(seed: Hex): string {
  return `0xstub_replay_${seed.slice(2, 18)}`;
}

function stubReplayId(seed: Hex): Hex {
  return `0x${seed.slice(2).padEnd(64, "0").slice(0, 64)}` as Hex;
}
