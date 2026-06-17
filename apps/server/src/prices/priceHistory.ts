// Composed Mantle price-history source for the BE Data correlation engine.
//
// Strategy (decided 2026-06-17): Bybit is the primary daily-close source;
// CoinGecko is the fallback for any token Bybit can't resolve (no listed symbol,
// or a failed fetch). This replaces the previous CoinGecko-only path while
// keeping CoinGecko's broad by-contract-address coverage as a safety net.
//
// The result is the attested `priceHistory` passed into the TEE CVM (which has no
// price egress); the correlation itself is still computed inside the enclave.

import type { ServerConfig } from "../config.js";
import { fetchBybitPriceHistory } from "./bybitPriceHistory.js";
import { fetchMantlePriceHistory, type TokenCloses } from "./mantlePriceHistory.js";

/**
 * Daily-close series per token: Bybit first, CoinGecko fallback for the rest.
 * Tokens unresolved by both sources are simply omitted (no fabricated series).
 */
export async function fetchPriceHistory(
  config: ServerConfig,
  addresses: string[],
  days = 7,
): Promise<TokenCloses[]> {
  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).filter(Boolean);
  if (unique.length === 0) return [];

  const bybit = await fetchBybitPriceHistory(config, unique, days).catch(() => []);
  const resolved = new Set(bybit.map((t) => t.token));

  const missing = unique.filter((addr) => !resolved.has(addr));
  const coingecko = missing.length
    ? await fetchMantlePriceHistory(config, missing, days).catch(() => [])
    : [];

  return [...bybit, ...coingecko];
}
