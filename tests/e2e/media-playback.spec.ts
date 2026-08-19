import { expect, test } from "@playwright/test";

test("starting a second direct audio pauses the first", async ({ page }) => {
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "media.kamelkyp.com") {
      audioRequests.push(request.url());
    }
  });

  await page.goto("/en/works/audio-test");
  expect(audioRequests).toEqual([]);
  await expect(page.locator("audio")).toHaveCount(0);

  const first = page.getByRole("button", { name: "Play First preview" });
  const second = page.getByRole("button", { name: "Play Second preview" });

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("audio starts and stops inside the selected segment", async ({ page }) => {
  await page.goto("/en/works/audio-bounds-test");
  await page.getByRole("button", { name: "Play Bounded preview" }).click();
  await expect(page.locator("[data-current-seconds]")).toHaveAttribute(
    "data-current-seconds",
    /^(1[2-9]|[2-3][0-9]|4[0-2])$/,
  );
});
