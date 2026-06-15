import { expect, test } from "@playwright/test";

// Report viewer — /report/<rootHash> renders the cached report from a
// previously-completed diagnose run. The route is fed by an
// in-memory cache on the server, populated when a diagnose stream
// finishes. We trigger a fresh run, capture the rootHash, then
// navigate to the viewer.

const BLEEDING_TOKEN_ID = "605311";

interface DiagnoseEvent {
  type: string;
  rootHash?: string;
  [k: string]: unknown;
}

async function captureRootHash(): Promise<string> {
  // Hit the diagnose endpoint via plain fetch so we read SSE
  // server-side. We wait for the FULL stream to close so the server's
  // in-memory report cache is populated by the time we navigate to
  // /report/<rootHash>.
  const res = await fetch(
    `http://localhost:3001/api/diagnose/${BLEEDING_TOKEN_ID}`,
    { headers: { Accept: "text/event-stream" } },
  );
  if (!res.ok || !res.body) throw new Error("diagnose stream failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rootHash: string | undefined;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    buffer += decoder.decode(r.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const ev = JSON.parse(dataLine.slice(5).trim()) as DiagnoseEvent;
        if (ev.type === "report.uploaded" && typeof ev.rootHash === "string") {
          rootHash = ev.rootHash;
        }
      } catch {
        // skip
      }
    }
  }
  if (!rootHash) throw new Error("no rootHash captured from diagnose stream");
  return rootHash;
}

test.describe("report viewer", () => {
  test.setTimeout(180_000);

  test("/report/<rootHash> renders all sections after a fresh run", async ({
    page,
  }) => {
    const rootHash = await captureRootHash();

    await page.goto(`/report/${rootHash}`);

    // Provenance header + rootHash visible.
    await expect(
      page.getByRole("heading", { name: /provenance/i }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(rootHash.slice(0, 10));

    // Each labeled section renders.
    await expect(
      page.getByRole("heading", { name: "position" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "impermanent loss" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "regime" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "v4 hooks" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "migration plan" }),
    ).toBeVisible();

    // Honesty labels on each section.
    await expect(page.getByText("VERIFIED").first()).toBeVisible();
    await expect(page.getByText("COMPUTED").first()).toBeVisible();
    await expect(page.getByText("ESTIMATED").first()).toBeVisible();
    await expect(page.getByText("LABELED").first()).toBeVisible();
    await expect(page.getByText("EMULATED").first()).toBeVisible();
  });
});
