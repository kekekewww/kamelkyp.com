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
  await expect(main.getByText("完整歌曲混音")).toHaveCount(0);

  await main.getByRole("link", { name: "混音", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/commission\/mixing$/);
  await expect(main.getByText("完整歌曲混音")).toBeVisible();
  await expect(main.getByText("Vocal 混音")).toBeVisible();
  await expect(main.getByText("單純歌曲銜接")).toHaveCount(0);
});

test("invalid category and service combinations return 404", async ({
  request,
}) => {
  expect((await request.get("/en/commission/all")).status()).toBe(404);
  expect((await request.get("/en/commission/mixing/simple")).status()).toBe(
    404,
  );
});

for (const [path, heading, field] of [
  ["/en/commission/mixing/full", "Full Song Mixing", "Direction"],
  ["/en/commission/mixing/vocal", "Vocal Mixing", "Direction"],
  [
    "/en/commission/song-transition/simple",
    "Simple Song Transition",
    "Target total length",
  ],
  [
    "/en/commission/song-transition/edit",
    "Edited Song Transition",
    "Segment duration",
  ],
] as const) {
  test(`${heading} exposes only its service-specific fields`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByLabel(field)).toBeVisible();
  });
}
