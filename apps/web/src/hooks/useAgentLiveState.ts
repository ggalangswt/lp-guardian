import { useEffect, useState } from "react";
import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";

// Reads the live state of the LPGuardianAgent iNFT — owner, memoryRoot,
// reputation, migrationsTriggered, license treasury + fee bps. Polls
// every 30 s so the agent profile page reflects on-chain truth, not
// a screenshot. No-op (returns null) when the contract address isn't
// configured at build time.

const rawAgentAddress =
  (import.meta.env.VITE_LPGUARDIAN_AGENT_CONTRACT as string | undefined)?.trim() || "";
// Hook is inactive when the iNFT contract address is not explicitly configured.
const AGENT_ADDRESS = rawAgentAddress as Address;
export const AGENT_CONTRACT_CONFIGURED = rawAgentAddress.length > 0;
const AGENT_TOKEN_ID = BigInt(
  (import.meta.env.VITE_LPGUARDIAN_AGENT_TOKEN_ID as string | undefined) ?? "1",
);
// TODO(mantle): set VITE_MANTLE_RPC and VITE_MANTLE_CHAIN_ID after chain details confirmed
const rawRpc = import.meta.env.VITE_MANTLE_RPC as string | undefined;
const CHAIN_RPC = rawRpc?.trim() || "";
const rawChainId = (import.meta.env.VITE_MANTLE_CHAIN_ID as string | undefined) ?? "0";
const CHAIN_ID = Number(rawChainId);

const ABI = [
  {
    name: "agents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "memoryRoot", type: "bytes32" },
      { name: "codeImageHash", type: "bytes32" },
      { name: "mintedAt", type: "uint64" },
      { name: "lastUpdatedAt", type: "uint64" },
      { name: "reputation", type: "uint64" },
      { name: "migrationsTriggered", type: "uint64" },
      { name: "metadataUri", type: "string" },
    ],
  },
  {
    name: "protocolTreasury",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "protocolFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
] as const;

const mantleChain = defineChain({
  // TODO(mantle): fill in correct chain ID and RPC for Mantle
  id: CHAIN_ID,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [CHAIN_RPC] } },
});

export interface AgentLiveState {
  contract: Address;
  tokenId: string;
  owner: Address;
  memoryRoot: Hex;
  codeImageHash: Hex;
  mintedAt: number;
  lastUpdatedAt: number;
  reputation: number;
  migrationsTriggered: number;
  metadataUri: string;
  protocolTreasury: Address;
  protocolFeeBps: number;
  fetchedAt: number;
}

export interface AgentLiveStateResult {
  data: AgentLiveState | null;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 30_000;

export function useAgentLiveState(): AgentLiveStateResult {
  const [data, setData] = useState<AgentLiveState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CHAIN_RPC || !AGENT_CONTRACT_CONFIGURED) return;

    let cancelled = false;
    const client = createPublicClient({
      chain: mantleChain,
      transport: http(CHAIN_RPC),
    });

    const refresh = async () => {
      try {
        setLoading(true);
        const [agent, treasury, feeBps] = await Promise.all([
          client.readContract({
            address: AGENT_ADDRESS as Address,
            abi: ABI,
            functionName: "agents",
            args: [AGENT_TOKEN_ID],
          }) as Promise<
            readonly [Address, Hex, Hex, bigint, bigint, bigint, bigint, string]
          >,
          client.readContract({
            address: AGENT_ADDRESS as Address,
            abi: ABI,
            functionName: "protocolTreasury",
          }) as Promise<Address>,
          client.readContract({
            address: AGENT_ADDRESS as Address,
            abi: ABI,
            functionName: "protocolFeeBps",
          }) as Promise<number>,
        ]);
        if (cancelled) return;
        setData({
          contract: AGENT_ADDRESS as Address,
          tokenId: AGENT_TOKEN_ID.toString(),
          owner: agent[0],
          memoryRoot: agent[1],
          codeImageHash: agent[2],
          mintedAt: Number(agent[3]),
          lastUpdatedAt: Number(agent[4]),
          reputation: Number(agent[5]),
          migrationsTriggered: Number(agent[6]),
          metadataUri: agent[7],
          protocolTreasury: treasury,
          protocolFeeBps: Number(feeBps),
          fetchedAt: Date.now(),
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return { data, loading, error };
}
