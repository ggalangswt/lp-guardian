import { expect, test } from "@playwright/test";

// Smoke tests for the supporting surfaces added to the public product:
// /agent (live iNFT profile) and /developers (MCP reference).
// These assertions are intentionally lightweight so they survive
// content polish while still catching routing/content regressions.

test.describe("agent profile page", () => {
  test("renders heading and on-chain verification block", async ({ page }) => {
    await page.goto("/agent");
    await expect(
      page.getByRole("heading", { name: /LP Guardian\/01/i }),
    ).toBeVisible();
    await expect(page.getByText(/Verify the live state yourself/i)).toBeVisible();
    // The pre-formatted block with cast snippet — multiple "cast call"
    // strings exist (inline code + pre), assert at least the pre.
    await expect(
      page.getByText(/agents\(uint256\)/i).first(),
    ).toBeVisible();
  });
});

test.describe("developers page", () => {
  test("renders heading and the 6 MCP tools table", async ({ page }) => {
    await page.goto("/developers");
    await expect(
      page.getByRole("heading", { name: /Call LP Guardian from any agent/i }),
    ).toBeVisible();

    // Six tools in the endpoints table: 1 utility + 5 product tools.
    await expect(page.getByText(/lpguardian\.ping/i).first()).toBeVisible();
    await expect(page.getByText(/lpguardian\.diagnose/i).first()).toBeVisible();
    await expect(page.getByText(/lpguardian\.preflight/i).first()).toBeVisible();
    await expect(page.getByText(/lpguardian\.migrate/i).first()).toBeVisible();
    await expect(page.getByText(/lpguardian\.lookupReport/i).first()).toBeVisible();
    await expect(
      page.getByText(/lpguardian\.lookupReportOnChain/i).first(),
    ).toBeVisible();

    // Three gated tools; free appears for ping + 2 verification tools
    // in both access and price columns.
    await expect(page.getByText("GATED", { exact: true })).toHaveCount(3);
    await expect(page.getByText("FREE", { exact: true })).toHaveCount(6);

    await expect(page.getByText(/Mantle/i)).toBeVisible();
    await expect(page.getByText(/STDIO/i).first()).toBeVisible();
  });
});
