import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { portfolioReportRegistryAbi } from "./abis.js";

export interface PublishReportAnchorInput {
  portfolioOwner: Address;
  subjectId: bigint;
  rootHash: Hex;
  attestationHash: Hex;
}

export interface ReportAnchor {
  portfolioOwner: Address;
  subjectId: bigint;
  publisher: Address;
  publishedAt: bigint;
  rootHash: Hex;
  attestationHash: Hex;
}

export async function publishReportAnchor(
  publicClient: PublicClient,
  walletClient: WalletClient,
  registryAddress: Address,
  input: PublishReportAnchorInput,
): Promise<Hex> {
  if (!walletClient.account) {
    throw new Error("Wallet client account is required for report anchoring.");
  }

  const { request } = await publicClient.simulateContract({
    account: walletClient.account,
    address: registryAddress,
    abi: portfolioReportRegistryAbi,
    functionName: "publishReport",
    args: [
      input.portfolioOwner,
      input.subjectId,
      input.rootHash,
      input.attestationHash,
    ],
  });

  return walletClient.writeContract(request);
}

export async function getReportAnchor(
  client: PublicClient,
  registryAddress: Address,
  rootHash: Hex,
): Promise<ReportAnchor> {
  const [
    portfolioOwner,
    subjectId,
    publisher,
    publishedAt,
    storedRootHash,
    attestationHash,
  ] = await client.readContract({
    address: registryAddress,
    abi: portfolioReportRegistryAbi,
    functionName: "getReport",
    args: [rootHash],
  });

  return {
    portfolioOwner,
    subjectId,
    publisher,
    publishedAt,
    rootHash: storedRootHash,
    attestationHash,
  };
}
