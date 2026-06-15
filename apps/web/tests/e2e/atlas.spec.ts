import { expect, test } from "@playwright/test";

test.describe("atlas page", () => {
  test("renders the optical-instrument header and the wallet form", async ({
    page,
  }) => {
    await page.goto("/atlas");
    await expect(
      page.getByRole("heading", { name: /your liquidity, under the lens/i }),
    ).toBeVisible();
    await expect(page.getByPlaceholder(/wallet address/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^load$/i })).toBeVisible();
  });

  test("shows an instruction line when no address is submitted", async ({
    page,
  }) => {
    await page.goto("/atlas");
    await expect(page.getByText(/paste a wallet address above/i)).toBeVisible();
  });

  test("exposes three curated demo wallet slots", async ({ page }) => {
    await page.goto("/atlas");
    await expect(
      page.getByRole("button", { name: /healthy.*in-range/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /drifting.*close-to-edge/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /bleeding.*out-of-range/i }),
    ).toBeVisible();
  });

  test("clicking a demo slot fills the wallet input", async ({ page }) => {
    await page.goto("/atlas");
    await page
      .getByRole("button", { name: /bleeding.*out-of-range/i })
      .click();
    const input = page.getByPlaceholder(/wallet address/i);
    await expect(input).toHaveValue(/^0x[0-9a-fA-F]{40}$/);
    // The active-slot indicator surfaces in the header.
    await expect(page.getByText(/curated demo wallet/i)).toBeVisible();
  });
});
