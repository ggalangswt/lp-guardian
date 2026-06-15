import { expect, test } from "@playwright/test";

// Full demo flow — atlas → click position → diagnose stream populates.
// Requires THE_GRAPH_KEY in the running server's .env so subgraph
// queries return real positions.

test.describe("full demo flow", () => {
  test.setTimeout(60_000);

  test("atlas → click position card → diagnose mounts with chain data", async ({
    page,
  }) => {
    await page.goto("/atlas");

    await page
      .getByRole("button", { name: /bleeding.*out-of-range/i })
      .click();

    // Wait for at least one PositionCard to render.
    await expect(
      page.getByRole("link", { name: /tokenId/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Click the first card.
    await page
      .getByRole("link", { name: /tokenId/i })
      .first()
      .click();

    // Diagnose page mounts and the SSE stream starts emitting.
    await expect(
      page.getByRole("heading", { name: "Diagnose" }),
    ).toBeVisible();

    // The stream surfaces tool calls in the side panel.
    await expect(page.getByText(/getV3Position/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
