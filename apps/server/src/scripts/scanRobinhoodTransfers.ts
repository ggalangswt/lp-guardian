import type { Address } from "viem";
import { loadConfig } from "../config.js";
import {
  jsonReplacer,
  loadDotEnvIfPresent,
  readArg,
} from "./support/env.js";
import {
  createRobinhoodPublicClient,
  requireAddress,
} from "../services/robinhood/client.js";
import { scanNfpmTransfersForWallet } from "../services/robinhood/transferScanner.js";

const DEMO_WALLETS = {
  bleeding: "0x8f4daa33706d70677fd69e4e0d47e595bc820e95",
  mixed: "0x4d3e3d1a38505185ba86a1b1f3084195d556bc2a",
} as const;

interface CliOptions {
  wallet: Address;
  fromBlock?: bigint;
  toBlock?: bigint;
  chunkSize: bigint;
}

function parseBlock(value: string | undefined): bigint | undefined {
  if (!value || value === "latest") return undefined;
  return BigInt(value);
}

function parseWallet(value: string | undefined): Address {
  const wallet = value ?? "mixed";
  const selected =
    wallet in DEMO_WALLETS
      ? DEMO_WALLETS[wallet as keyof typeof DEMO_WALLETS]
      : wallet;

  return requireAddress(selected, "wallet") as Address;
}

function parseCli(): CliOptions {
  return {
    wallet: parseWallet(readArg("wallet")),
    fromBlock: parseBlock(readArg("from-block")),
    toBlock: parseBlock(readArg("to-block")),
    chunkSize: BigInt(readArg("chunk-size") ?? "0"),
  };
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const cli = parseCli();
  const config = loadConfig();
  const client = createRobinhoodPublicClient(config);
  const latestBlock = await client.getBlockNumber();
  const nfpmAddress = requireAddress(
    config.robinhoodNfpmAddress,
    "ROBINHOOD_NFPM_ADDRESS",
  );

  const result = await scanNfpmTransfersForWallet(client, {
    nfpmAddress,
    walletAddress: cli.wallet,
    fromBlock: cli.fromBlock ?? config.robinhoodScanFromBlock ?? 0n,
    toBlock: cli.toBlock ?? latestBlock,
    chunkSize: cli.chunkSize > 0n ? cli.chunkSize : config.robinhoodScanChunkSize,
  });

  console.log(JSON.stringify(result, jsonReplacer, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Robinhood transfer scan failed: ${message}`);
  process.exitCode = 1;
});
