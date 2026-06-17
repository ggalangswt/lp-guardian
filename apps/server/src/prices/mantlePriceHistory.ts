// Mantle token price-history fetch (CoinGecko) — the FALLBACK source.
//
// Bybit is the primary daily-close source (see bybitPriceHistory.ts); this
// CoinGecko path covers tokens Bybit can't resolve, via priceHistory.ts. Both
// run on the backend (normal egress) and feed the TEE CVM as attested inputs —
// the CVM cannot reach price APIs itself. The correlation COMPUTE still happens
// inside the TEE; the prices are transparent, verifiable public market data.
//
// Source: CoinGecko market_chart by contract address on the "mantle" platform.
// Degrades gracefully: a token whose history can't be fetched is omitted, so the
// CVM simply excludes it from the matrix (rather than fabricating a series).

import type { ServerConfig } from "../config.js";

const PLATFORM = "mantle";
const BASE = "https://api.coingecko.com/api/v3";
const HISTORY_TTL_MS = 10 * 60_000;

export interface TokenCloses {
  token: string; // lowercased token address
  closes: number[];
}

interface CacheEntry {
  value: number[];
  expires: number;
}

const closesCache = new Map<string, CacheEntry>();

function authHeaders(config: ServerConfig): HeadersInit {
  return config.coinGeckoApiKey ? { "x-cg-demo-api-key": config.coinGeckoApiKey } : {};
}

async function fetchCloses(
  config: ServerConfig,
  address: string,
  days: number,
): Promise<number[] | null> {
  const addr = address.toLowerCase();
  const cached = closesCache.get(addr);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const url = `${BASE}/coins/${PLATFORM}/contract/${addr}/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(url, { headers: authHeaders(config) });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as { prices?: [number, number][] };
    const closes = (data.prices ?? []).map(([, price]) => price).filter((p) => Number.isFinite(p));
    if (closes.length < 2) throw new Error("insufficient history");
    closesCache.set(addr, { value: closes, expires: Date.now() + HISTORY_TTL_MS });
    return closes;
  } catch (err) {
    console.warn(`[mantlePriceHistory] skip ${addr}: ${String(err)}`);
    return null;
  }
}

/**
 * Fetch daily-resolution close series for the given Mantle token addresses.
 * Returns one entry per token that resolved; unresolved tokens are omitted.
 */
export async function fetchMantlePriceHistory(
  config: ServerConfig,
  addresses: string[],
  days = 7,
): Promise<TokenCloses[]> {
  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).filter(Boolean);
  const results = await Promise.all(
    unique.map(async (addr) => {
      const closes = await fetchCloses(config, addr, days);
      return closes ? { token: addr, closes } : null;
    }),
  );
  return results.filter((r): r is TokenCloses => r !== null);
}
