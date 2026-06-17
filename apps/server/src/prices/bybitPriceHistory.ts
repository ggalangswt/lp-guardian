// Bybit daily-close price history for the BE Data correlation engine.
//
// This is the PRIMARY price-history source for the Mantle flow (CoinGecko is the
// fallback, see priceHistory.ts). Bybit's public v5 `kline` endpoint returns the
// daily-close series correlation needs and works from the backend's egress
// (datacenter IPs are only blocked at Bybit's edge for the TEE CVM, not Railway).
//
// Tokens are resolved to Bybit spot symbols via config.bybitSymbolMap; a token
// with no mapping (or whose series can't be fetched) is omitted so the caller can
// fall back to CoinGecko for it. No API key is needed for public market data.

import type { ServerConfig } from "../config.js";
import type { TokenCloses } from "./mantlePriceHistory.js";

const HISTORY_TTL_MS = 10 * 60_000;

interface CacheEntry {
  value: number[];
  expires: number;
}

const closesCache = new Map<string, CacheEntry>();

async function fetchSymbolCloses(
  base: string,
  symbol: string,
  days: number,
): Promise<number[] | null> {
  const cached = closesCache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const limit = Math.max(2, Math.min(days, 1000));
    const url = `${base.replace(/\/$/, "")}/v5/market/kline?category=spot&symbol=${symbol}&interval=D&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bybit ${res.status}`);
    const data = (await res.json()) as {
      retCode?: number;
      retMsg?: string;
      result?: { list?: string[][] };
    };
    if (data.retCode !== undefined && data.retCode !== 0) {
      throw new Error(`bybit retCode ${data.retCode} ${data.retMsg ?? ""}`);
    }
    // Rows: [start, open, high, low, close, volume, turnover]; newest-first.
    const rows = data.result?.list ?? [];
    const closes = rows
      .map((row) => Number(row[4]))
      .filter((p) => Number.isFinite(p))
      .reverse(); // oldest-first
    if (closes.length < 2) throw new Error("insufficient history");
    closesCache.set(symbol, { value: closes, expires: Date.now() + HISTORY_TTL_MS });
    return closes;
  } catch (err) {
    console.warn(`[bybitPriceHistory] skip ${symbol}: ${String(err)}`);
    return null;
  }
}

/**
 * Fetch daily-close series for the given token addresses via Bybit. Returns one
 * entry per token that mapped to a symbol AND resolved; others are omitted.
 */
export async function fetchBybitPriceHistory(
  config: ServerConfig,
  addresses: string[],
  days = 7,
): Promise<TokenCloses[]> {
  const map = config.bybitSymbolMap;
  if (!map || Object.keys(map).length === 0) return [];

  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).filter(Boolean);
  const results = await Promise.all(
    unique.map(async (addr) => {
      const symbol = map[addr];
      if (!symbol) return null;
      const closes = await fetchSymbolCloses(config.bybitApiBase, symbol, days);
      return closes ? { token: addr, closes } : null;
    }),
  );
  return results.filter((r): r is TokenCloses => r !== null);
}
