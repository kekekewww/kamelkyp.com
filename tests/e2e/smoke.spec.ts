import { expect, test } from "@playwright/test";

test("health endpoint is deterministic", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    data: { service: "kamelkyp-com", status: "healthy" },
  });
});

test("root chooses Chinese for zh browser language", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PREVIEW_URL,
    locale: "zh-TW",
  });

  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/zh$/);
  } finally {
    await context.close();
  }
});
