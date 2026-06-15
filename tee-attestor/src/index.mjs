// LP Guardian TEE attestor — minimal HTTP service meant to run inside a
// Phala/dstack CPU CVM. It computes the LP Guardian verdict deterministically
// and returns a TDX remote-attestation quote whose report_data commits to
// (inputs + verdict), so anyone can prove the verdict was produced by this code
// inside a genuine TEE.
//
// Endpoints:
//   GET  /health  → { ok, tee }
//   POST /verdict → { recommendation, markdown, reportData, quote, attested }

import http from "node:http";
import sha3 from "js-sha3";
import { buildVerdict } from "./verdict.mjs";

const { keccak256 } = sha3;
import { getTdxQuote, teeAvailable } from "./attest.mjs";

const PORT = Number(process.env.PORT ?? 8090);
const AUTH_TOKEN = (process.env.AUTH_TOKEN ?? "").trim();

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!AUTH_TOKEN) return true; // auth disabled when no token configured
  const header = req.headers["authorization"] ?? "";
  return header === `Bearer ${AUTH_TOKEN}`;
}

/** Stable 0x + 64-hex report data committing to inputs + verdict. */
function computeReportData(inputs, verdict) {
  const canonical = JSON.stringify({
    pair: inputs.pair,
    il: inputs.il,
    regime: inputs.regime,
    hookScore: inputs.hookScore,
    recommendation: verdict.recommendation,
    markdown: verdict.markdown,
  });
  return "0x" + keccak256(canonical);
}

function validateInputs(b) {
  if (!b || typeof b !== "object") return "body must be a JSON object";
  if (typeof b.pair !== "string") return "pair must be a string";
  if (!b.il || typeof b.il.ilPct !== "number") return "il.ilPct required";
  if (!b.regime || typeof b.regime.topLabel !== "string")
    return "regime.topLabel required";
  if (!b.hookScore || typeof b.hookScore.family !== "string")
    return "hookScore.family required";
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, tee: teeAvailable() });
    }

    if (req.method === "POST" && req.url === "/verdict") {
      if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

      const raw = await readBody(req);
      let inputs;
      try {
        inputs = JSON.parse(raw || "{}");
      } catch {
        return send(res, 400, { error: "invalid JSON" });
      }
      const invalid = validateInputs(inputs);
      if (invalid) return send(res, 400, { error: invalid });

      const verdict = buildVerdict({
        pair: inputs.pair,
        il: {
          ilPct: Number(inputs.il.ilPct),
          ilT1: Number(inputs.il.ilT1 ?? 0),
          lpValueT1: Number(inputs.il.lpValueT1 ?? 0),
          feesValueT1: Number(inputs.il.feesValueT1 ?? 0),
        },
        regime: {
          topLabel: inputs.regime.topLabel,
          confidence: Number(inputs.regime.confidence ?? 0),
        },
        hookScore: {
          family: inputs.hookScore.family,
          deltaAprPct: Number(inputs.hookScore.deltaAprPct ?? 0),
          deltaIlPct: Number(inputs.hookScore.deltaIlPct ?? 0),
        },
      });

      const reportData = computeReportData(inputs, verdict);

      let quote = null;
      let attested = false;
      try {
        const q = await getTdxQuote(reportData);
        if (q) {
          quote = q.quote;
          attested = true;
        }
      } catch (err) {
        console.warn(`[attest] quote failed: ${String(err)}`);
      }

      return send(res, 200, {
        recommendation: verdict.recommendation,
        markdown: verdict.markdown,
        reportData,
        quote,
        attested,
      });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, () => {
  console.log(
    `lp-guardian-tee-attestor listening on :${PORT} (tee=${teeAvailable()})`,
  );
});
