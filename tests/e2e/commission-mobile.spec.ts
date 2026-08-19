import { expect, test } from "@playwright/test";

test("commission flow fits a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/commission/mixing/full");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  const actions = page.locator(".commission-actions");
  await expect(actions).toBeVisible();
  const next = page.getByRole("button", { name: "下一步" });
  const box = await next.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
