import { expect, test } from "@playwright/test";

test("language preference, identity and responsive introduction meet the brief", async ({
  browser,
  page,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    locale: "en-US",
  });
  try {
    const languagePage = await context.newPage();
    await languagePage.goto("/");
    await expect(languagePage).toHaveURL(/\/en$/);
    await languagePage.goto("/language/zh?returnTo=%2Fzh");
    await expect(languagePage).toHaveURL(/\/zh$/);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "kamel_locale")
        ?.value,
    ).toBe("zh");
    await languagePage.goto("/");
    await expect(languagePage).toHaveURL(/\/zh$/);
  } finally {
    await context.close();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh");
  await expect(page.getByText("楊子賢", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Kamel" })).toHaveCount(1);
  const desktopIdentity = await page
    .locator(".landing-console__identity")
    .boundingBox();
  expect(desktopIdentity?.width).toBeGreaterThanOrEqual(340);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const identity = await page
    .locator(".landing-console__identity")
    .boundingBox();
  const content = await page.locator(".landing-console__content").boundingBox();
  expect(identity?.x).toBe(content?.x);
  expect((identity?.y ?? 0) + (identity?.height ?? 0)).toBeLessThanOrEqual(
    content?.y ?? 0,
  );
});

test("service entry pages stay focused and expose the approved base prices", async ({
  page,
}) => {
  await page.goto("/zh/mixing");
  const mixingMain = page.getByRole("main");
  await expect(
    page.getByRole("heading", { name: "完整歌曲混音" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vocal 混音" })).toBeVisible();
  await expect(page.getByText("NT$8,000")).toBeVisible();
  await expect(page.getByText("NT$4,000")).toBeVisible();
  await expect(mixingMain.getByText("單純歌曲銜接")).toHaveCount(0);

  await page.goto("/zh/song-transition");
  const transitionMain = page.getByRole("main");
  await expect(
    page.getByRole("heading", { name: "單純歌曲銜接" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "編輯／剪輯歌曲銜接" }),
  ).toBeVisible();
  await expect(page.getByText("NT$1,000")).toBeVisible();
  await expect(page.getByText("NT$4,000")).toBeVisible();
  await expect(transitionMain.getByText("完整歌曲混音")).toHaveCount(0);

  await page.goto("/en/mixing");
  await expect(page.getByText(/US\$260\.00/)).toBeVisible();
  await expect(page.getByText(/NT\$/)).toHaveCount(0);
});

test("commission form is link-only, local-first and shows non-compounding student pricing", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/zh/commission/mixing/full");
  await page.locator('[data-draft-ready="true"]').waitFor();

  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText(/不接受檔案上傳/)).toBeVisible();
  await expect(page.getByLabel("電子郵件")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("年齡狀態")).toBeVisible();
  await expect(page.getByLabel(/生日/)).toHaveCount(0);
  await expect(page.getByLabel(/學生身分證明連結/)).toHaveCount(0);

  await page.getByLabel(/申請學生優惠/).check();
  await page.getByLabel(/詢問急件/).check();
  await page.getByLabel(/需要素材整理/).check();
  await expect(page.getByLabel(/學生身分證明連結/)).toBeVisible();
  await expect(page.getByText(/可遮蔽敏感資訊/)).toBeVisible();
  await expect(page.getByText("NT$8,680", { exact: true })).toBeVisible();
  await expect(page.getByText("NT$4,000", { exact: true })).toBeVisible();
  await expect(page.getByText("NT$400", { exact: true })).toBeVisible();
  await expect(page.getByText("NT$-3,720", { exact: true })).toBeVisible();
});

test("public safety boundaries remain explicit", async ({ page, request }) => {
  await page.goto("/zh");
  await expect(page.locator("footer summary")).toHaveCount(5);
  expect(await page.locator("footer a").count()).toBeGreaterThan(3);

  const admin = await request.get("/admin");
  expect(admin.status()).toBe(403);
  expect(admin.headers()["cache-control"]).toContain("no-store");

  await page.goto("/en/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(page.getByText(/stack|ErrorResponseImpl/)).toHaveCount(0);
});
