// Unit test for the Mantle price-history fetcher (B5). Mocks global fetch.
//
// Run: pnpm --filter @lp-guardian/server pricehistory:test

import assert from "node:assert/strict";
import type { ServerConfig } from "../config.js";
import { fetchMantlePriceHistory } from "../prices/mantlePriceHistory.js";

const config = { coinGeckoApiKey: null } as unknown as ServerConfig;

const realFetch = globalThis.fetch;
let calls = 0;

function mockFetch(handler: (url: string) => Response) {
  calls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls += 1;
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function run() {
  // 1) Happy path: market_chart returns [ts, price] pairs -> mapped to closes.
  mockFetch(() =>
    jsonResponse({ prices: [[1, 100], [2, 110], [3, 120]] }),
  );
  const ADDR_A = "0xAaA0000000000000000000000000000000000001";
  const ADDR_B = "0xBbB0000000000000000000000000000000000002";
  const ok = await fetchMantlePriceHistory(config, [ADDR_A, ADDR_B]);
  assert.equal(ok.length, 2, "both tokens resolved");
  assert.deepEqual(ok[0]!.closes, [100, 110, 120]);
  assert.equal(ok[0]!.token, ADDR_A.toLowerCase(), "address lowercased");

  // 2) Cache hit: same address again should NOT trigger another fetch.
  const callsAfterFirst = calls;
  await fetchMantlePriceHistory(config, [ADDR_A]);
  assert.equal(calls, callsAfterFirst, "cached address must not refetch");

  // 3) HTTP error -> token skipped (omitted), no throw.
  mockFetch(() => jsonResponse({ error: "rate limited" }, 429));
  const ADDR_C = "0xCcC0000000000000000000000000000000000003";
  const degraded = await fetchMantlePriceHistory(config, [ADDR_C]);
  assert.deepEqual(degraded, [], "failed token is omitted");

  // 4) Insufficient history (<2 closes) -> skipped.
  mockFetch(() => jsonResponse({ prices: [[1, 100]] }));
  const ADDR_D = "0xDdD0000000000000000000000000000000000004";
  const short = await fetchMantlePriceHistory(config, [ADDR_D]);
  assert.deepEqual(short, [], "single-point history is skipped");

  console.log("testMantlePriceHistory: OK (map + cache + error + short-series)");
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = realFetch;
  });
