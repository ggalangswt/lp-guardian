import { expect, test } from "@playwright/test";

// Diagnose page — SSE stream behaviour with a stubbed-subgraph backend.
// Even when the subgraph returns nothing (no THE_GRAPH_KEY configured),
// the page should mount cleanly, surface the streaming status, and not
// crash on missing payloads.

test.describe("diagnose stream — degraded mode", () => {
  test("page mounts and shows tool-calls panel even with empty subgraph", async ({
    page,
  }) => {
    await page.goto("/diagnose/12345");
    await expect(page.getByRole("heading", { name: "Diagnose" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tool calls" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Narrative" }),
    ).toBeVisible();
  });

  test("server-sent stream initialises without uncaught error", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto("/diagnose/9999");
    // Give the SSE stream a moment to open.
    await page.waitForTimeout(2000);

    expect(consoleErrors).toEqual([]);
  });
});
