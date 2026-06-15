import { expect, test } from "@playwright/test";

test("server /health responds with ok status", async ({ request }) => {
  const res = await request.get("http://localhost:3001/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.data.service).toBe("lp-guardian-server");
});
