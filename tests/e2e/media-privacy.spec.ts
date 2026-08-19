import { expect, test } from "@playwright/test";

test("does not contact YouTube before explicit activation", async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("youtube")) youtubeRequests.push(request.url());
  });

  await page.goto("/en/works/media-test");
  expect(youtubeRequests).toEqual([]);

  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(
    page.locator('iframe[title="YouTube: Test video"]'),
  ).toBeVisible();
  expect(youtubeRequests.length).toBeGreaterThan(0);
});

test("never embeds MediaFire", async ({ page }) => {
  await page.goto("/en/works/mediafire-test");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open external media" }),
  ).toBeVisible();
});
