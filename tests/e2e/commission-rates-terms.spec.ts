/*
 * Rates, terms and availability come from the active D1 rows (wp2 §4.6-4.8):
 * with the seeded price rules the wizard's rate labels read exactly as
 * before; /terms and /privacy show the fixture versions in effect; the
 * category chooser lists the services that are open (active price and
 * effective terms, which the loopback fixture provides).
 */
import { expect, test } from "@playwright/test";

test("the simple-transition wizard labels its rates from the active rule (zh)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/zh/commission/song-transition/simple");
  await page.locator('[data-draft-ready="true"]').waitFor();
  for (const label of [
    "申請學生優惠（所有計價 -30%）",
    "詢問急件（服務基價 +50%）",
    "需要素材整理（服務基價 +5%）",
    "需要協助決定順序或銜接點（服務基價 +50%）",
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(1);
  }
});

test("the simple-transition wizard labels its rates from the active rule (en)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/en/commission/song-transition/simple");
  await page.locator('[data-draft-ready="true"]').waitFor();
  for (const label of [
    "Request student discount (30% off)",
    "Request rush scheduling (+50% of service base)",
    "Source preparation needed (+5% of service base)",
    "Need help choosing order or transition points (+50% of service base)",
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(1);
  }
});

test("the legal pages show the versions in effect", async ({ page }) => {
  await page.goto("/zh/terms");
  await expect(page.getByRole("heading", { name: "服務條款" })).toBeVisible();
  await expect(
    page.locator(".legal-doc__effective").getByText("生效日 2026.08.10"),
  ).toBeVisible();
  await page.goto("/en/privacy");
  await expect(
    page.getByRole("heading", { name: "Data processing" }),
  ).toBeVisible();
});

test("the mixing chooser lists both open mixing services", async ({ page }) => {
  await page.goto("/zh/commission/mixing");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "完整歌曲混音" }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Vocal 混音" })).toBeVisible();
  await expect(main.getByRole("link", { name: "選擇此服務" })).toHaveCount(2);
});
