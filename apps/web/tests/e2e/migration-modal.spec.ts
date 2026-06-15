import { expect, test } from "@playwright/test";

// Migration modal — opens from the Migrate button on the migration
// panel. Asserts the modal renders the Permit2 EIP-712 typed data
// preview (verifying contract, spender, sigDeadline) without actually
// signing. Signing is wallet-bound; we don't connect a wallet here.

const BLEEDING_TOKEN_ID = "605311";

test.describe("migration modal", () => {
  test.setTimeout(180_000);

  test("Migrate button opens modal with Permit2 typed data preview", async ({
    page,
  }) => {
    await page.goto(`/diagnose/${BLEEDING_TOKEN_ID}`);

    // Wait for migration panel to populate.
    const migrate = page.getByRole("button", { name: /Migrate →/i });
    await expect(migrate).toBeVisible({ timeout: 60_000 });
    await migrate.click();

    // Modal opens — Permit2 EIP-712 preview block rendered.
    await expect(
      page.getByText(/Permit2 EIP-712 typed data/i),
    ).toBeVisible({ timeout: 5_000 });
    // verifyingContract uses Permit2's canonical address (truncated UI).
    await expect(page.getByText(/verifyingContract/i)).toBeVisible();
    await expect(page.getByText(/spender/i).first()).toBeVisible();
    await expect(page.getByText(/sigDeadline/i)).toBeVisible();
    // The agent custody disclaimer must be visible (no auto-execute).
    await expect(
      page.getByText(/agent never executes/i).first(),
    ).toBeVisible();
  });
});
