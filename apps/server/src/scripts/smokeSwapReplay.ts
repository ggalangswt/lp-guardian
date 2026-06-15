/**
 * End-to-end smoke for the swap-replay path:
 *   1. fetch real Swap events from an Arbitrum pool,
 *   2. replay them against a position range (off-chain, COMPUTED),
 *   3. read computeReplayId from the deployed SwapReplayVerifier,
 *   4. optionally anchor the proof on-chain (--write).
 *
 * Usage:
 *   tsx src/scripts/smokeSwapReplay.ts [--pool=0x..] [--max=50] [--write]
 */
import { keccak256, toBytes, type Hex } from "viem";
import { loadConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import { swapReplayVerifierAbi } from "../chain/abis.js";
import { fetchRecentSwaps } from "../indexer/swapEvents.js";
import { replaySwaps } from "../pipeline/swapReplay.js";
import { publishReplay } from "../chain/swapReplayVerifier.js";
import { jsonReplacer, loadDotEnvIfPresent, readArg } from "./support/env.js";

// USDC/WETH 0.05% — one of the busiest Uniswap V3 pools on Arbitrum One.
const DEFAULT_POOL = "0xC6962004f452bE9203591991D15f6b388e09E8D0";

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const pool = (readArg("pool") ?? DEFAULT_POOL) as `0x${string}`;
  const maxSwaps = Number(readArg("max") ?? "50");
  const doWrite = process.argv.includes("--write");

  const { robinhood } = getChainClients(config);

  console.log(`Fetching up to ${maxSwaps} swaps from ${pool} on Arbitrum…`);
  const fetched = await fetchRecentSwaps(config, pool, { maxSwaps, blockWindow: 200_000 });
  console.log(
    `→ ${fetched.swaps.length} swaps, blocks ${fetched.fromBlock}–${fetched.toBlock}${
      fetched.partial ? " (partial)" : ""
    }`,
  );

  // Replay against a deliberately wide range so most swaps count as in-range.
  const replay = replaySwaps({
    pool,
    tickLower: -887220,
    tickUpper: 887220,
    positionLiquidity: 10_000_000_000_000n,
    feePips: 500,
    token0Decimals: 6,
    token1Decimals: 18,
    price0Usd: 1,
    price1Usd: 3000,
    swaps: fetched.swaps,
    fromBlock: fetched.fromBlock,
    toBlock: fetched.toBlock,
  });

  console.log(
    JSON.stringify(
      {
        swapCount: replay.swapCount,
        swapsInRange: replay.swapsInRange,
        feesUsd: replay.feesUsd,
        grossVolumeUsd: replay.grossVolumeUsd,
        inputRoot: replay.inputRoot,
        resultHash: replay.resultHash,
        label: replay.label,
      },
      jsonReplacer,
      2,
    ),
  );

  if (replay.swapCount === 0) {
    console.log("No swaps — cannot anchor (contract requires swap_count >= 1).");
    return;
  }

  const attestationHash = keccak256(
    toBytes(`${replay.inputRoot}${replay.resultHash.slice(2)}`),
  ) as Hex;

  // Read-side: confirm the deployed contract is reachable and the id matches.
  const onchainId = (await robinhood.readContract({
    address: config.swapReplayVerifierAddress,
    abi: swapReplayVerifierAbi,
    functionName: "computeReplayId",
    args: [
      "0x000000000000000000000000000000000000dEaD",
      605311n,
      pool,
      BigInt(replay.fromBlock),
      BigInt(replay.toBlock),
      replay.swapCount,
      replay.inputRoot,
      replay.resultHash,
      attestationHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
  })) as Hex;
  console.log(`computeReplayId (on-chain read): ${onchainId}`);

  if (!doWrite) {
    console.log("Skipping write (pass --write to anchor on Robinhood Chain).");
    return;
  }

  const pub = await publishReplay(config, {
    portfolioOwner: "0x000000000000000000000000000000000000dEaD",
    subjectId: 605311n,
    pool,
    fromBlock: BigInt(replay.fromBlock),
    toBlock: BigInt(replay.toBlock),
    swapCount: replay.swapCount,
    inputRoot: replay.inputRoot,
    resultHash: replay.resultHash,
    attestationHash,
  });
  console.log(
    `publishReplay → replayId=${pub.replayId} tx=${pub.txHash} onchain=${pub.onchain}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Swap replay smoke failed: ${message}`);
  process.exitCode = 1;
});
