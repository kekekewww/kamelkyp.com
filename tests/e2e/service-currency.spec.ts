import { expect, test } from "@playwright/test";

test("Chinese service prices use TWD", async ({ page }) => {
  await page.goto("/zh/mixing");
  await expect(page.getByText("NT$8,000")).toBeVisible();
  await expect(page.getByText("NT$4,000")).toBeVisible();
  await expect(page.getByText(/US\$/)).toHaveCount(0);
});

test("English service prices use the current USD snapshot", async ({
  page,
}) => {
  await page.goto("/en/mixing");
  await expect(page.getByText("US$260.00", { exact: false })).toBeVisible();
  await expect(page.getByText("US$130.00", { exact: false })).toBeVisible();
  await expect(page.getByText(/NT\$/)).toHaveCount(0);
  await expect(page.getByText("Estimated today", { exact: false })).toHaveCount(
    2,
  );
});
