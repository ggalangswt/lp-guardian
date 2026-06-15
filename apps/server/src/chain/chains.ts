import { defineChain } from "viem";
import { arbitrum } from "viem/chains";
import type { ServerConfig } from "../config.js";

export { arbitrum };

/** Robinhood Chain testnet (Arbitrum Orbit). chainId resolved from config. */
export function robinhoodChain(config: ServerConfig) {
  return defineChain({
    id: config.robinhoodChainId,
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [config.robinhoodRpc] },
    },
    testnet: true,
  });
}

/** Mantle network. Defaults to Mantle Sepolia (5003) unless env points at mainnet. */
export function mantleChain(config: ServerConfig) {
  return defineChain({
    id: config.mantleChainId,
    name: config.mantleChainId === 5000 ? "Mantle" : "Mantle Sepolia",
    nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
    rpcUrls: {
      default: { http: [config.mantleRpc] },
    },
    blockExplorers: {
      default: {
        name: "Mantle Explorer",
        url: config.mantleChainId === 5000
          ? "https://explorer.mantle.xyz"
          : "https://explorer.sepolia.mantle.xyz",
      },
    },
    testnet: config.mantleChainId !== 5000,
  });
}

/** Arbitrum One with the configured RPC override. */
export function arbitrumChain(config: ServerConfig) {
  return defineChain({
    ...arbitrum,
    rpcUrls: {
      default: { http: [config.arbitrumRpc] },
    },
  });
}
