import type { Address, PublicClient } from "viem";
import {
  erc721TransferEvent,
  nonfungiblePositionManagerAbi,
} from "./abis.js";

export interface TransferScanOptions {
  nfpmAddress: Address;
  walletAddress: Address;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
}

export interface NfpmTransferRecord {
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  from: Address;
  to: Address;
  tokenId: bigint;
  direction: "in" | "out";
}

export interface NfpmPositionSnapshot {
  tokenId: bigint;
  owner: Address;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  protocol?: "merchant-moe" | "agni" | "fluxion" | "uniswap-v3";
  chainId?: number;
  poolAddress?: Address;
  currentTick?: number;
  tickSpacing?: number;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Decimals?: number;
  token1Decimals?: number;
  currentValueUSD?: number;
  isInRange?: boolean;
}

export interface TransferScanResult {
  walletAddress: Address;
  nfpmAddress: Address;
  fromBlock: bigint;
  toBlock: bigint;
  transfers: NfpmTransferRecord[];
  candidateTokenIds: bigint[];
  currentlyOwnedTokenIds: bigint[];
  movedOutTokenIds: bigint[];
  positions: NfpmPositionSnapshot[];
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function uniqueSorted(values: Iterable<bigint>): bigint[] {
  return [...new Set(values)].sort((a, b) => Number(a - b));
}

async function readTransferChunk(
  client: PublicClient,
  options: TransferScanOptions,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<NfpmTransferRecord[]> {
  const [incoming, outgoing] = await Promise.all([
    client.getContractEvents({
      address: options.nfpmAddress,
      abi: [erc721TransferEvent],
      eventName: "Transfer",
      args: { to: options.walletAddress },
      fromBlock,
      toBlock,
    }),
    client.getContractEvents({
      address: options.nfpmAddress,
      abi: [erc721TransferEvent],
      eventName: "Transfer",
      args: { from: options.walletAddress },
      fromBlock,
      toBlock,
    }),
  ]);

  return [...incoming, ...outgoing]
    .flatMap((event) => {
      if (!event.args.tokenId) return [];

      const from = event.args.from as Address;
      const to = event.args.to as Address;

      return [{
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        from,
        to,
        tokenId: event.args.tokenId,
        direction: sameAddress(to, options.walletAddress) ? "in" : "out",
      } satisfies NfpmTransferRecord];
    })
    .sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return a.logIndex - b.logIndex;
      return a.blockNumber < b.blockNumber ? -1 : 1;
    });
}

async function verifyCurrentOwner(
  client: PublicClient,
  nfpmAddress: Address,
  walletAddress: Address,
  tokenId: bigint,
): Promise<Address | undefined> {
  try {
    const owner = await client.readContract({
      address: nfpmAddress,
      abi: nonfungiblePositionManagerAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    return sameAddress(owner, walletAddress) ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function readPositionSnapshot(
  client: PublicClient,
  nfpmAddress: Address,
  tokenId: bigint,
): Promise<NfpmPositionSnapshot> {
  const owner = await client.readContract({
    address: nfpmAddress,
    abi: nonfungiblePositionManagerAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  const position = await client.readContract({
    address: nfpmAddress,
    abi: nonfungiblePositionManagerAbi,
    functionName: "positions",
    args: [tokenId],
  });

  return {
    tokenId,
    owner,
    token0: position[2],
    token1: position[3],
    fee: position[4],
    tickLower: position[5],
    tickUpper: position[6],
    liquidity: position[7],
    tokensOwed0: position[10],
    tokensOwed1: position[11],
  };
}

/**
 * Reads NFPM position snapshots for a fixed list of known tokenIds without
 * scanning Transfer events. Used when the tokenIds are already known (e.g.,
 * ROBINHOOD_CANONICAL_TOKEN_ID) and the RPC provider limits getLogs range.
 * Each tokenId is verified via ownerOf — positions no longer owned are dropped.
 */
export async function readNfpmPositionsByTokenIds(
  client: PublicClient,
  nfpmAddress: Address,
  walletAddress: Address,
  tokenIds: bigint[],
  latestBlock: bigint,
): Promise<TransferScanResult> {
  const ownershipChecks = await Promise.all(
    tokenIds.map(async (tokenId) => {
      const owner = await verifyCurrentOwner(
        client,
        nfpmAddress,
        walletAddress,
        tokenId,
      );
      return { tokenId, owner };
    }),
  );
  const currentlyOwnedTokenIds = uniqueSorted(
    ownershipChecks.filter((c) => c.owner).map((c) => c.tokenId),
  );
  const positions = await Promise.all(
    currentlyOwnedTokenIds.map((tokenId) =>
      readPositionSnapshot(client, nfpmAddress, tokenId),
    ),
  );

  return {
    walletAddress,
    nfpmAddress,
    fromBlock: latestBlock,
    toBlock: latestBlock,
    transfers: [],
    candidateTokenIds: uniqueSorted(tokenIds),
    currentlyOwnedTokenIds,
    movedOutTokenIds: tokenIds.filter(
      (id) => !currentlyOwnedTokenIds.some((owned) => owned === id),
    ),
    positions,
  };
}

export async function scanNfpmTransfersForWallet(
  client: PublicClient,
  options: TransferScanOptions,
): Promise<TransferScanResult> {
  const transfers: NfpmTransferRecord[] = [];
  let cursor = options.fromBlock;

  while (cursor <= options.toBlock) {
    const chunkTo =
      cursor + options.chunkSize - 1n > options.toBlock
        ? options.toBlock
        : cursor + options.chunkSize - 1n;
    transfers.push(
      ...(await readTransferChunk(client, options, cursor, chunkTo)),
    );
    cursor = chunkTo + 1n;
  }

  const candidateTokenIds = uniqueSorted(
    transfers.map((transfer) => transfer.tokenId),
  );
  const ownershipChecks = await Promise.all(
    candidateTokenIds.map(async (tokenId) => {
      const owner = await verifyCurrentOwner(
        client,
        options.nfpmAddress,
        options.walletAddress,
        tokenId,
      );
      return { tokenId, owner };
    }),
  );
  const currentlyOwnedTokenIds = uniqueSorted(
    ownershipChecks
      .filter((check) => check.owner)
      .map((check) => check.tokenId),
  );
  const positions = await Promise.all(
    currentlyOwnedTokenIds.map((tokenId) =>
      readPositionSnapshot(client, options.nfpmAddress, tokenId),
    ),
  );
  const currentlyOwned = new Set(currentlyOwnedTokenIds);

  return {
    walletAddress: options.walletAddress,
    nfpmAddress: options.nfpmAddress,
    fromBlock: options.fromBlock,
    toBlock: options.toBlock,
    transfers,
    candidateTokenIds,
    currentlyOwnedTokenIds,
    movedOutTokenIds: candidateTokenIds.filter(
      (tokenId) => !currentlyOwned.has(tokenId),
    ),
    positions,
  };
}
