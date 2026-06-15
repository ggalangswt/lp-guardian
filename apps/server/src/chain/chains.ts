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

/** Arbitrum One with the configured RPC override. */
export function arbitrumChain(config: ServerConfig) {
  return defineChain({
    ...arbitrum,
    rpcUrls: {
      default: { http: [config.arbitrumRpc] },
    },
  });
}
