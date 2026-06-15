import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the brand hero with bleeding headline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /bleeding/i })).toBeVisible();
    await expect(page.getByText(/LP Guardian/).first()).toBeVisible();
  });
});
