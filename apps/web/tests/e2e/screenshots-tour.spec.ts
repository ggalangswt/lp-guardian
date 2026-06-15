import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Visual tour — full-page screenshots of every public route at the
// design viewport. Drops PNGs into apps/web/screenshots/ so the
// reviewer can audit the live product surfaces without spinning up the
// dev server. Re-run after any visual change.

const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = join(process.cwd(), "screenshots");

test.describe("visual tour — full-page screenshots", () => {
  test.use({ viewport: VIEWPORT });
  test.setTimeout(120_000);

  test.beforeAll(() => {
    try { mkdirSync(OUT_DIR, { recursive: true }); } catch {}
  });

  test("landing — full page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(OUT_DIR, "01-landing-full.png"),
      fullPage: true,
    });
  });

  test("atlas — initial state", async ({ page }) => {
    await page.goto("/atlas");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "02-atlas-initial.png"),
      fullPage: true,
    });
  });

  test("atlas — portfolio whale loaded", async ({ page }) => {
    await page.goto("/atlas");
    await page.getByRole("button", { name: /portfolio.*30/i }).click();
    // Wait for cards to render.
    await page
      .getByRole("link", { name: /tokenId/i })
      .first()
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(OUT_DIR, "03-atlas-portfolio.png"),
      fullPage: true,
    });
  });

  test("agent — live profile", async ({ page }) => {
    await page.goto("/agent");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2_000); // let chain read finish
    await page.screenshot({
      path: join(OUT_DIR, "04-agent.png"),
      fullPage: true,
    });
  });

  test("developers — MCP reference", async ({ page }) => {
    await page.goto("/developers");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "05-developers.png"),
      fullPage: true,
    });
  });

  test("deck", async ({ page }) => {
    await page.goto("/deck");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "06-deck.png"),
      fullPage: true,
    });
  });

  test("roadmap", async ({ page }) => {
    await page.goto("/roadmap");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "07-roadmap.png"),
      fullPage: true,
    });
  });
});
