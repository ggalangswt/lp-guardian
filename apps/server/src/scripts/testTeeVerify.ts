// Locks the cross-language commitment contract (must match the Python service's
// `_canon` / report_commitment) and exercises the local quote-binding verifier.
//
// Run: pnpm --filter @lp-guardian/server tee:verify:test

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalize, commitmentHex, verifyTeeBinding } from "../services/teeVerify.js";

// --- canonical serializer fixtures (identical to Python `_canon`) ---
assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}'); // sorted keys
assert.equal(canonicalize(1.0), "1"); // integer-valued number
assert.equal(canonicalize(0.5), "0.500000"); // 6dp
assert.equal(canonicalize(0.062202), "0.062202");
assert.equal(canonicalize([1, "x", true, null]), '[1,"x",true,null]');

// --- commitment matches the value Python produced for the same payload ---
// (cross-checked against services/be-data/tee/common.py in CI / by hand)
const positions = [
  {
    tokenId: "1",
    token0: "0xaaa",
    token1: "0xbbb",
    fee: 3000,
    tickLower: -100,
    tickUpper: 100,
    liquidity: "5000000000000000000",
  },
];
const output = {
  optimalWeights: { "1": 0.5, "2": 0.5 },
  expectedReturn: 0.062202,
  expectedRisk: 1.0,
  actions: [],
};
const reportHash = "0xdeadbeef";
const hex = commitmentHex(positions, output, reportHash);
assert.equal(
  hex,
  "cb6a936809ca069f518c19734de218458d27a0854e84dad9bb6783a623e414f8",
  "commitment must match the Python report_commitment fixture",
);

// --- binding verification ---
// A "quote" that embeds the commitment bytes -> verified.
const needle = Buffer.from(hex, "hex");
const fakeQuote = Buffer.concat([Buffer.alloc(568), needle, Buffer.alloc(64)]);
const ok = verifyTeeBinding(fakeQuote.toString("base64"), positions, output, reportHash);
assert.equal(ok.verified, true);
assert.equal(ok.commitment, `0x${hex}`);

// Wrong inputs -> commitment changes -> not bound.
const bad = verifyTeeBinding(fakeQuote.toString("base64"), positions, { tampered: true }, reportHash);
assert.equal(bad.verified, false);

// Missing attestation -> not verified, no throw.
assert.equal(verifyTeeBinding(undefined, positions, output, reportHash).verified, false);

// sanity: commitmentHex is a sha256 (32 bytes)
assert.equal(createHash("sha256").update("x").digest("hex").length, hex.length);

console.log("testTeeVerify: OK (canonical + commitment + binding)");
