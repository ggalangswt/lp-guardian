import type { Address, Hex, PublicClient, WalletClient, Account } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "./clients.js";
import { lpGuardianTuringRegistryAbi } from "./abis.js";

export interface TuringWriteResult {
  txHash: Hex;
  chainId: number;
  registry: Address;
}

export interface RegisterAgentInput {
  agentURI: string;
  codeHash: Hex;
}

export interface RecordDecisionInput {
  agentId: bigint;
  subject: Address;
  scenarioHash: Hex;
  reportHash: Hex;
  action: number;
  confidenceBps: number;
  riskScoreBps: number;
  metadataURI: string;
}

export interface RecordOutcomeInput {
  decisionId: bigint;
  pnlBps: bigint;
  scoreBps: number;
  outcomeHash: Hex;
  metadataURI: string;
}

function requireMantleWriter(config: ServerConfig): {
  mantle: PublicClient;
  mantleWallet: WalletClient;
  mantleAccount: Account;
} {
  const clients = getChainClients(config);
  if (!clients.mantleWallet || !clients.mantleAccount) {
    throw new Error("MANTLE_WRITER_NOT_CONFIGURED: set BACKEND_SIGNER_PK, WALLET_BACKEND_PK, or WALLET_DEPLOYER_PK.");
  }
  if (config.turingRegistryAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("MANTLE_TURING_REGISTRY_NOT_CONFIGURED");
  }
  return {
    mantle: clients.mantle,
    mantleWallet: clients.mantleWallet,
    mantleAccount: clients.mantleAccount,
  };
}

export async function registerTuringAgent(
  config: ServerConfig,
  input: RegisterAgentInput,
): Promise<TuringWriteResult> {
  const { mantle, mantleWallet, mantleAccount } = requireMantleWriter(config);
  const args = [input.agentURI, input.codeHash] as const;

  await mantle.simulateContract({
    account: mantleAccount,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "register",
    args,
  });

  const txHash = await mantleWallet.writeContract({
    account: mantleAccount,
    chain: mantleWallet.chain,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "register",
    args,
  });

  return { txHash, chainId: config.mantleChainId, registry: config.turingRegistryAddress };
}

export async function recordTuringDecision(
  config: ServerConfig,
  input: RecordDecisionInput,
): Promise<TuringWriteResult> {
  const { mantle, mantleWallet, mantleAccount } = requireMantleWriter(config);
  const args = [
    input.agentId,
    input.subject,
    input.scenarioHash,
    input.reportHash,
    input.action,
    input.confidenceBps,
    input.riskScoreBps,
    input.metadataURI,
  ] as const;

  await mantle.simulateContract({
    account: mantleAccount,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "recordDecision",
    args,
  });

  const txHash = await mantleWallet.writeContract({
    account: mantleAccount,
    chain: mantleWallet.chain,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "recordDecision",
    args,
  });

  return { txHash, chainId: config.mantleChainId, registry: config.turingRegistryAddress };
}

export async function recordTuringOutcome(
  config: ServerConfig,
  input: RecordOutcomeInput,
): Promise<TuringWriteResult> {
  const { mantle, mantleWallet, mantleAccount } = requireMantleWriter(config);
  const args = [
    input.decisionId,
    input.pnlBps,
    input.scoreBps,
    input.outcomeHash,
    input.metadataURI,
  ] as const;

  await mantle.simulateContract({
    account: mantleAccount,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "recordOutcome",
    args,
  });

  const txHash = await mantleWallet.writeContract({
    account: mantleAccount,
    chain: mantleWallet.chain,
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "recordOutcome",
    args,
  });

  return { txHash, chainId: config.mantleChainId, registry: config.turingRegistryAddress };
}

export async function getTuringAgentStats(config: ServerConfig, agentId: bigint) {
  const { mantle } = getChainClients(config);
  return mantle.readContract({
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "getAgentStats",
    args: [agentId],
  });
}

export async function getTuringDecision(config: ServerConfig, decisionId: bigint) {
  const { mantle } = getChainClients(config);
  return mantle.readContract({
    address: config.turingRegistryAddress,
    abi: lpGuardianTuringRegistryAbi,
    functionName: "getDecision",
    args: [decisionId],
  });
}
