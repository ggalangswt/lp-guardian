import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ServerConfig } from "../../config.js";

export function createRobinhoodChain(chainId: number): Chain {
  return {
    id: chainId,
    name: "Robinhood Chain Testnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [],
      },
    },
  };
}

export function createRobinhoodPublicClient(config: ServerConfig) {
  if (!config.robinhoodRpcUrl) {
    throw new Error("ROBINHOOD_RPC is required for Robinhood chain reads.");
  }
  if (!config.robinhoodChainId) {
    throw new Error("ROBINHOOD_CHAIN_ID is required for Robinhood chain reads.");
  }

  return createPublicClient({
    chain: createRobinhoodChain(config.robinhoodChainId),
    transport: http(config.robinhoodRpcUrl),
  });
}

export function createRobinhoodWalletClient(config: ServerConfig) {
  if (!config.robinhoodRpcUrl) {
    throw new Error("ROBINHOOD_RPC is required for Robinhood chain writes.");
  }
  if (!config.robinhoodChainId) {
    throw new Error("ROBINHOOD_CHAIN_ID is required for Robinhood chain writes.");
  }
  if (!config.walletBackendPrivateKey) {
    throw new Error("WALLET_BACKEND_PK is required for report anchoring.");
  }

  const privateKey = config.walletBackendPrivateKey.startsWith("0x")
    ? config.walletBackendPrivateKey
    : `0x${config.walletBackendPrivateKey}`;
  const account = privateKeyToAccount(privateKey as Hex);

  return createWalletClient({
    account,
    chain: createRobinhoodChain(config.robinhoodChainId),
    transport: http(config.robinhoodRpcUrl),
  });
}

export function requireAddress(value: string | undefined, name: string): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return value as Address;
}
