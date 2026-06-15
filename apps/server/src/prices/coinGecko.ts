// Price feed via CoinGecko, keyed by Arbitrum contract address. Works without
// an API key (public rate-limited tier); a key raises the limit. All calls are
// cached in-memory and degrade to a static fallback table so the demo never
// hard-fails on a 429.

import type { ServerConfig } from "../config.js";

const PLATFORM = "arbitrum-one";
const BASE = "https://api.coingecko.com/api/v3";

export interface PricePoint {
  timestamp: number; // ms
  price: number; // USD
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const priceCache = new Map<string, CacheEntry<number>>();
const historyCache = new Map<string, CacheEntry<PricePoint[]>>();
const PRICE_TTL = 60_000;
const HISTORY_TTL = 10 * 60_000;

// Coarse fallbacks (USD) used only when the API is unreachable / rate-limited.
const FALLBACK_USD: Record<string, number> = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 3000, // WETH
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 65000, // WBTC
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 1, // USDC
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": 1, // USDC.e
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 1, // USDT
  "0xda10009cbd5d07dd0cef8214c558c1e1cd44b1e1": 1, // DAI
  "0x912ce59144191c1204e64559fe8253a0e49e6548": 0.8, // ARB
};

function authHeaders(config: ServerConfig): HeadersInit {
  return config.coinGeckoApiKey
    ? { "x-cg-demo-api-key": config.coinGeckoApiKey }
    : {};
}

function now(): number {
  return Date.now();
}

/** Current USD prices for a set of Arbitrum token addresses. */
export async function getCurrentPricesUSD(
  config: ServerConfig,
  addresses: string[],
): Promise<Record<string, number>> {
  const wanted = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  const out: Record<string, number> = {};
  const missing: string[] = [];

  for (const addr of wanted) {
    const cached = priceCache.get(addr);
    if (cached && cached.expires > now()) out[addr] = cached.value;
    else missing.push(addr);
  }
  if (missing.length === 0) return out;

  // The free tier caps token_price at one contract address per call, so fetch
  // each missing address individually (results are cached).
  await Promise.all(
    missing.map(async (addr) => {
      try {
        const url = `${BASE}/simple/token_price/${PLATFORM}?contract_addresses=${addr}&vs_currencies=usd`;
        const res = await fetch(url, { headers: authHeaders(config) });
        if (!res.ok) throw new Error(`coingecko ${res.status}`);
        const data = (await res.json()) as Record<string, { usd?: number }>;
        const price = data[addr]?.usd ?? fallback(addr);
        out[addr] = price;
        priceCache.set(addr, { value: price, expires: now() + PRICE_TTL });
      } catch (err) {
        console.warn(
          `[coingecko] price fetch failed for ${addr}, using fallback: ${String(err)}`,
        );
        out[addr] = fallback(addr);
      }
    }),
  );

  return out;
}

export async function getCurrentPriceUSD(
  config: ServerConfig,
  address: string,
): Promise<number> {
  const prices = await getCurrentPricesUSD(config, [address]);
  return prices[address.toLowerCase()] ?? fallback(address);
}

/** Hourly USD price history for the last `hours` hours (Arbitrum contract). */
export async function getHistoricalPrices(
  config: ServerConfig,
  address: string,
  hours: number,
): Promise<PricePoint[]> {
  const addr = address.toLowerCase();
  const days = Math.max(1, Math.ceil(hours / 24));
  const cacheKey = `${addr}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expires > now()) return cached.value;

  try {
    const url = `${BASE}/coins/${PLATFORM}/contract/${addr}/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(url, { headers: authHeaders(config) });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as { prices?: [number, number][] };
    const points: PricePoint[] = (data.prices ?? []).map(([ts, price]) => ({
      timestamp: ts,
      price,
    }));
    if (points.length > 0) {
      historyCache.set(cacheKey, {
        value: points,
        expires: now() + HISTORY_TTL,
      });
      return points;
    }
    throw new Error("empty history");
  } catch (err) {
    console.warn(
      `[coingecko] history fetch failed for ${addr}, synthesizing: ${String(err)}`,
    );
    return synthHistory(fallback(addr), hours);
  }
}

/** Price at (approximately) a past timestamp, from the hourly series. */
export async function getPriceAt(
  config: ServerConfig,
  address: string,
  atMs: number,
): Promise<number | null> {
  const days = Math.max(1, Math.ceil((now() - atMs) / (24 * 3600_000)));
  const history = await getHistoricalPrices(config, address, days * 24);
  if (history.length === 0) return null;
  let closest = history[0]!;
  for (const p of history) {
    if (Math.abs(p.timestamp - atMs) < Math.abs(closest.timestamp - atMs)) {
      closest = p;
    }
  }
  return closest.price;
}

function fallback(address: string): number {
  return FALLBACK_USD[address.toLowerCase()] ?? 0;
}

/** Deterministic gentle random-walk used only when history is unavailable. */
function synthHistory(base: number, hours: number): PricePoint[] {
  if (base === 0) return [];
  const out: PricePoint[] = [];
  const start = now() - hours * 3600_000;
  let price = base * 0.97;
  for (let h = 0; h <= hours; h++) {
    const drift = Math.sin(h / 6) * 0.004 + 0.0006;
    price = price * (1 + drift);
    out.push({ timestamp: start + h * 3600_000, price });
  }
  return out;
}
