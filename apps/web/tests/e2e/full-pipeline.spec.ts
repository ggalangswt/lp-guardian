import { expect, test } from "@playwright/test";

// Full pipeline e2e — drives a real diagnose against a curated wallet
// with a real chain-bound bleeding position. Verifies every panel
// renders, every honesty label appears, the SSE stream emits each of
// the live tool calls, and the final report lands on IPFS
// Storage with a verifiable on-chain anchor.
//
// Latency budget: ~75 s for the full pipeline (subgraph + IPFS storage
// + Robinhood Chain + Phala TEE).

const BLEEDING_TOKEN_ID = "605311";

test.describe("full pipeline — real chain", () => {
  test.setTimeout(180_000);

  test("diagnose 605311 — every phase fires, every panel renders", async ({
    page,
  }) => {
    await page.goto(`/diagnose/${BLEEDING_TOKEN_ID}`);

    // Header + tokenId echo land instantly.
    await expect(
      page.getByRole("heading", { name: "Diagnose" }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(BLEEDING_TOKEN_ID);

    // Phase tool calls — each appears twice (call + result), so we
    // assert the first match for each name.
    await expect(page.getByText("getV3Position").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("computeIL").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("classifyRegime").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("discoverV4Hooks").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("scoreHook").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("buildMigrationPreview").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("synthesizeVerdict").first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      page.getByText("uploadReportToOgStorage").first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByText("anchorRootHashOnOgChain").first(),
    ).toBeVisible({ timeout: 120_000 });

    // Major panels.
    await expect(
      page.getByRole("heading", { name: /v4 hook scoring/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /assumption surface/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Migrate →/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: /migration preview/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /report provenance/i }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByRole("heading", { name: /^verdict$/i }),
    ).toBeVisible({ timeout: 120_000 });

    // Honesty labels — at least one COMPUTED, ESTIMATED, EMULATED,
    // VERIFIED rendered somewhere in the diagnose tree.
    await expect(page.getByText("COMPUTED").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("ESTIMATED").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("EMULATED").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("VERIFIED").first()).toBeVisible({
      timeout: 120_000,
    });

    // The hallucination guard: the verdict text contains [unsupported]
    // markers when the LLM tries to claim a number not in the report.
    // We don't assert presence (LLM output varies), but the panel
    // must mount without throwing.
    await expect(
      page.getByText(/qwen|stub-fallback/i).first(),
    ).toBeVisible({ timeout: 120_000 });
  });
});
