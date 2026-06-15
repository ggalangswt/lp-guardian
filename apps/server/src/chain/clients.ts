import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ServerConfig } from "../config.js";
import { arbitrumChain, robinhoodChain } from "./chains.js";

export interface ChainClients {
  /** Arbitrum One — source of LP position + pool data. */
  arbitrum: PublicClient;
  /** Robinhood Chain — Stylus contracts (read). */
  robinhood: PublicClient;
  /** Robinhood Chain signer — anchoring writes. Null when no key configured. */
  robinhoodWallet: WalletClient | null;
  /** Local signer account (signs locally → eth_sendRawTransaction). */
  robinhoodAccount: Account | null;
  /** Address of the anchor signer, if available. */
  anchorAddress: `0x${string}` | null;
}

let cached: ChainClients | null = null;

export function getChainClients(config: ServerConfig): ChainClients {
  if (cached) return cached;

  const arbitrum = createPublicClient({
    chain: arbitrumChain(config),
    transport: http(config.arbitrumRpc, { batch: true }),
  }) as PublicClient;

  const rh = robinhoodChain(config);
  const robinhood = createPublicClient({
    chain: rh,
    transport: http(config.robinhoodRpc),
  }) as PublicClient;

  let robinhoodWallet: WalletClient | null = null;
  let robinhoodAccount: Account | null = null;
  let anchorAddress: `0x${string}` | null = null;
  if (config.anchorSignerPk) {
    const account = privateKeyToAccount(config.anchorSignerPk);
    robinhoodAccount = account;
    anchorAddress = account.address;
    robinhoodWallet = createWalletClient({
      account,
      chain: rh,
      transport: http(config.robinhoodRpc),
    });
  }

  cached = { arbitrum, robinhood, robinhoodWallet, robinhoodAccount, anchorAddress };
  return cached;
}
