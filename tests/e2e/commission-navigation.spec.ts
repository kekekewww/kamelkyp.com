import { expect, test } from "@playwright/test";

test("commission selection never exposes four services together", async ({
  page,
}) => {
  await page.goto("/zh/commission");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "混音", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "歌曲銜接", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("完整歌曲混音")).toHaveCount(0);

  await main.getByRole("link", { name: "混音", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/commission\/mixing$/);
  await expect(page.getByText("完整歌曲混音")).toBeVisible();
  await expect(page.getByText("Vocal 混音")).toBeVisible();
  await expect(page.getByText("單純歌曲銜接")).toHaveCount(0);
});

test("invalid category and service combinations return 404", async ({
  request,
}) => {
  expect((await request.get("/en/commission/all")).status()).toBe(404);
  expect(
    (await request.get("/en/commission/mixing/simple")).status(),
  ).toBe(404);
});
