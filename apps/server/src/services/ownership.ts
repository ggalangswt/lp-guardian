import { getAddress, type Address, type PublicClient } from "viem";
import { nonfungiblePositionManagerAbi } from "./robinhood/abis.js";

export type OwnershipValidationStatus =
  | "verified"
  | "mismatch"
  | "unavailable";

export interface OwnershipValidationResult {
  status: OwnershipValidationStatus;
  label: "VERIFIED" | "UNAVAILABLE";
  walletAddress: Address;
  tokenId: string;
  chainId: number;
  source: "rpc";
  contractAddress?: Address;
  ownerAddress?: Address;
  blockNumber?: bigint;
  reason?: string;
}

export interface ValidateNfpmOwnershipInput {
  client: PublicClient;
  chainId: number;
  nfpmAddress?: Address;
  walletAddress: Address;
  tokenId: string;
  blockNumber?: bigint;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function unavailable(
  input: ValidateNfpmOwnershipInput,
  reason: string,
): OwnershipValidationResult {
  return {
    status: "unavailable",
    label: "UNAVAILABLE",
    walletAddress: input.walletAddress,
    tokenId: input.tokenId,
    chainId: input.chainId,
    source: "rpc",
    contractAddress: input.nfpmAddress,
    blockNumber: input.blockNumber,
    reason,
  };
}

export async function validateNfpmTokenOwnership(
  input: ValidateNfpmOwnershipInput,
): Promise<OwnershipValidationResult> {
  if (!input.nfpmAddress) {
    return unavailable(input, "NFPM contract address is not configured.");
  }

  let owner: Address;
  try {
    owner = getAddress(
      await input.client.readContract({
        address: input.nfpmAddress,
        abi: nonfungiblePositionManagerAbi,
        functionName: "ownerOf",
        args: [BigInt(input.tokenId)],
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return unavailable(input, `ownerOf read failed: ${reason}`);
  }

  return {
    status: sameAddress(owner, input.walletAddress) ? "verified" : "mismatch",
    label: "VERIFIED",
    walletAddress: input.walletAddress,
    tokenId: input.tokenId,
    chainId: input.chainId,
    source: "rpc",
    contractAddress: input.nfpmAddress,
    ownerAddress: owner,
    blockNumber: input.blockNumber,
  };
}
