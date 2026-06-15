import { expect, test, type Page, type Request } from "@playwright/test";

// Migration sign — full E2E, mock wallet path.
//
// Loads the diagnose page with `?mockWallet=1` so walletConfig swaps
// the injected connector for a viem privateKeyAccount-backed signer
// (Anvil key #0). Asserts the modal opens, the Sign Permit2 button
// fires a real EIP-712 signature, the frontend POSTs to
// /api/migrate/:tokenId/recorded with that signature, the backend
// recovers the signer and calls LPGuardianAgent.recordMigration, and the
// modal renders the iNFT post-state (counter + tx link or stub flag).

const BLEEDING_TOKEN_ID = "605311";
const ANVIL_ADDRESS_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266";

interface RecordedRequest {
  body: string;
  responseStatus?: number;
  responseBody?: string;
}

async function captureMigratePost(
  page: Page,
  tokenId: string,
): Promise<RecordedRequest> {
  const captured: RecordedRequest = { body: "" };
  page.on("requestfinished", async (request: Request) => {
    if (
      request.url().includes(`/api/migrate/${tokenId}/recorded`) &&
      request.method() === "POST"
    ) {
      captured.body = request.postData() ?? "";
      const response = await request.response();
      if (response) {
        captured.responseStatus = response.status();
        try {
          captured.responseBody = await response.text();
        } catch {
          captured.responseBody = "<binary>";
        }
      }
    }
  });
  return captured;
}

test.describe("migration sign — mock wallet", () => {
  test.setTimeout(180_000);

  test("sign Permit2 → POST recordMigration → modal renders iNFT post-state", async ({
    page,
  }) => {
    // Surface page console / errors so a failing test produces useful logs.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));

    const captured = await captureMigratePost(page, BLEEDING_TOKEN_ID);

    await page.goto(`/diagnose/${BLEEDING_TOKEN_ID}?mockWallet=1`);

    // Wait for the migrate button — implies the diagnose stream got
    // through hook discovery + migration preview.
    const migrate = page.getByRole("button", { name: /Migrate →/i });
    await expect(migrate).toBeVisible({ timeout: 90_000 });
    await migrate.click();

    // Modal opens with the Permit2 typed-data preview.
    await expect(page.getByText(/Permit2 EIP-712 typed data/i)).toBeVisible({
      timeout: 5_000,
    });

    // Sign — mock connector autoconnected so the button is enabled
    // immediately (no ConnectButton path in this test).
    const sign = page.getByRole("button", { name: /Sign Permit2/i });
    await expect(sign).toBeEnabled({ timeout: 5_000 });
    await sign.click();

    // The modal renders the signature summary block.
    await expect(page.getByText(/✓ signed by/i)).toBeVisible({
      timeout: 30_000,
    });
    // Digest line appears in the signature block.
    await expect(page.getByText(/digest 0x/i)).toBeVisible();

    // The post-sign iNFT recording line — either the live counter or
    // the stub fallback (acceptable when no anchor key in env).
    await expect(
      page.getByText(/iNFT migrationsTriggered →/i),
    ).toBeVisible({ timeout: 60_000 });

    // Backend received the POST with our signed payload.
    expect(captured.body).not.toEqual("");
    const parsed = JSON.parse(captured.body);
    expect(parsed.tokenId).toBe(BLEEDING_TOKEN_ID);
    expect(parsed.signer.toLowerCase()).toBe(ANVIL_ADDRESS_0.toLowerCase());
    expect(typeof parsed.signature).toBe("string");
    expect(parsed.signature).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(parsed.primaryType).toBe("PermitSingle");
    expect(parsed.domain.name).toBe("Permit2");

    // Backend round-trip OK — signer recovery succeeded server-side.
    expect(captured.responseStatus).toBe(200);
    if (captured.responseBody) {
      const responseJson = JSON.parse(captured.responseBody);
      expect(responseJson.signer.toLowerCase()).toBe(
        ANVIL_ADDRESS_0.toLowerCase(),
      );
      expect(responseJson.digest).toMatch(/^0x[0-9a-f]{64}$/i);
      // receipt may be stub (no anchor key) or live tx — either is OK.
      expect(responseJson.receipt).toBeDefined();
      expect(typeof responseJson.receipt.stub).toBe("boolean");
    }

    // No console.error noise during the flow (filter known harmless ones).
    const meaningfulErrors = consoleErrors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("[vite]") &&
        !e.includes("DevTools failed"),
    );
    expect(meaningfulErrors, meaningfulErrors.join("\n")).toHaveLength(0);
  });
});
