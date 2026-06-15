// TDX remote-attestation quote via the dstack guest-agent unix socket.
// Mounted into the container at /var/run/dstack.sock by Phala Cloud. We talk to
// it over raw HTTP-over-unix-socket so we don't depend on a specific SDK
// version. Degrades gracefully (returns null) when no socket is present, so the
// container still runs locally / under the simulator.

import http from "node:http";
import { existsSync } from "node:fs";

const CANDIDATE_SOCKETS = [
  process.env.DSTACK_SOCKET,
  "/var/run/dstack.sock",
  "/var/run/tappd.sock",
].filter(Boolean);

function postUnix(socketPath, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        socketPath,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 10_000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`dstack ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("dstack socket timeout")));
    req.write(body);
    req.end();
  });
}

function activeSocket() {
  return CANDIDATE_SOCKETS.find((s) => existsSync(s));
}

/** True when a dstack guest-agent socket is present (i.e. running in a CVM). */
export function teeAvailable() {
  return Boolean(activeSocket());
}

/**
 * Requests a TDX quote whose report_data commits to `reportDataHex` (0x + 64
 * hex). Returns { quote, eventLog } or null when no TEE is available.
 * @param {string} reportDataHex
 */
export async function getTdxQuote(reportDataHex) {
  const socket = activeSocket();
  if (!socket) return null;

  // dstack GetQuote endpoint. Try the documented path; fall back to the older
  // tappd RPC path if the first 404s.
  const payload = { reportData: reportDataHex };
  let res;
  try {
    res = await postUnix(socket, "/GetQuote", payload);
  } catch (err) {
    try {
      res = await postUnix(socket, "/prpc/Tappd.TdxQuote?json", {
        report_data: reportDataHex,
      });
    } catch {
      throw err;
    }
  }

  const quote = res.quote ?? res.tdx_quote ?? res.tdxQuote ?? null;
  const eventLog = res.event_log ?? res.eventLog ?? null;
  if (!quote) return null;
  return { quote, eventLog };
}
