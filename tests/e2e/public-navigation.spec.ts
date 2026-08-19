import { expect, test } from "@playwright/test";

test("landing identity and category navigation stay focused", async ({
  page,
}) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  await expect(page.getByText("楊子賢", { exact: true })).toHaveCount(1);

  const menuButton = page.getByRole("button", { name: "開啟選單" });
  if (await menuButton.isVisible()) await menuButton.click();

  const primaryNavigation = page.getByRole("navigation", { name: "主要導覽" });
  await primaryNavigation
    .getByRole("link", { name: "混音", exact: true })
    .click();
  await expect(page).toHaveURL(/\/zh\/mixing$/);
  const mainContent = page.getByRole("main");
  await expect(
    mainContent.getByRole("heading", { name: "完整歌曲混音" }),
  ).toBeVisible();
  await expect(
    mainContent.getByRole("heading", { name: "Vocal 混音" }),
  ).toBeVisible();
  await expect(mainContent.getByText("單純歌曲銜接")).toHaveCount(0);
});

test("mobile menu and footer use expandable groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh");
  await page.getByRole("button", { name: "開啟選單" }).click();
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }),
  ).toBeVisible();
  await expect(page.locator("footer details")).toHaveCount(5);
});

test("fonts are bundled without third-party font requests", async ({
  page,
}) => {
  const thirdPartyFontRequests: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
      thirdPartyFontRequests.push(request.url());
    }
  });

  await page.goto("/en");
  expect(thirdPartyFontRequests).toEqual([]);
});

test("empty published collections and legal routes remain usable", async ({
  page,
}) => {
  await page.goto("/zh/works");
  await expect(
    page.getByRole("heading", { name: "作品", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "作品準備中" })).toBeVisible();

  await page.goto("/en/other");
  await expect(page.getByRole("heading", { name: "Other Work" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing published yet" }),
  ).toBeVisible();

  await page.goto("/zh/terms");
  await expect(page.getByRole("heading", { name: "服務條款" })).toBeVisible();
  await page.goto("/zh/privacy");
  await expect(
    page.getByRole("heading", { name: "隱私說明", exact: true }),
  ).toBeVisible();
});
