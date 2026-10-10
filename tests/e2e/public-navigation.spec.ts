import { expect, type Page, test } from "@playwright/test";
import { expectNoPersonalName } from "./helpers/brand";

/**
 * Opens the phone menu. The disclosure is client state: a tap that lands
 * before hydration does nothing, so tap again until the button reports
 * `aria-expanded="true"` (a tap never repeats once the menu is open).
 */
async function openMenu(page: Page) {
  const button = page.locator(".site-header__menu-button");
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") {
      await button.click();
    }
    await expect(button).toHaveAttribute("aria-expanded", "true", {
      timeout: 1_000,
    });
  }).toPass();
}

test("landing identity and services navigation stay focused", async ({
  page,
}) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  await expectNoPersonalName(page);

  const menuButton = page.getByRole("button", { name: "開啟選單" });
  if (await menuButton.isVisible()) await openMenu(page);

  const primaryNavigation = page.getByRole("navigation", { name: "主要導覽" });
  await primaryNavigation
    .getByRole("link", { name: "服務", exact: true })
    .click();
  await expect(page).toHaveURL(/\/zh\/services$/);

  await page
    .getByRole("main")
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

test("primary navigation exposes the IA labels in both locales", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const english = page.getByRole("navigation", { name: "Primary navigation" });
  for (const label of ["Work", "Services", "About", "Writing"]) {
    await expect(
      english.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Start a project", exact: true }),
  ).toHaveAttribute("href", "/en/commission");

  await page.goto("/zh");
  const chinese = page.getByRole("navigation", { name: "主要導覽" });
  for (const label of ["作品", "服務", "關於", "文章"]) {
    await expect(
      chinese.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "開始合作", exact: true }),
  ).toBeVisible();
});

test("mobile menu and footer use expandable groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh");
  await openMenu(page);
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "關閉選單" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "開啟選單" })).toBeFocused();
  // Navigate, Services, Work & Resources, Find me (one enabled social link),
  // Contact (brand email), Legal.
  await expect(page.locator("footer details")).toHaveCount(6);
});

test("the footer reads social links, contact and copyright from settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const footer = page.getByRole("contentinfo");
  const findMe = footer
    .locator(".site-footer__desktop-groups .footer-group")
    .filter({ has: page.getByRole("heading", { name: "Find Me" }) });
  await expect(findMe.getByRole("link", { name: /Instagram/ })).toHaveAttribute(
    "href",
    "https://www.instagram.com/kamel.fixture",
  );
  // Disabled social links never render.
  await expect(
    footer.locator('a[href="https://github.com/kamel-fixture"]'),
  ).toHaveCount(0);
  await expect(footer.locator('a[href^="mailto:"]').first()).toBeVisible();
  await expect(footer.getByText(/^© \d{4} Kamel$/)).toBeVisible();
  await expect(footer.getByText("Taiwan / Remote")).toBeVisible();
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

test("legacy /other routes redirect permanently to /writing", async ({
  request,
}) => {
  const index = await request.get("/en/other?x=1", { maxRedirects: 0 });
  expect(index.status()).toBe(301);
  expect(index.headers().location).toBe("/en/writing?x=1");

  const detail = await request.get("/zh/other/some-post", { maxRedirects: 0 });
  expect(detail.status()).toBe(301);
  expect(detail.headers().location).toBe("/zh/writing/some-post");
});

test("published collections, filters and legal routes remain usable", async ({
  page,
}) => {
  await page.goto("/zh/works");
  await expect(
    page.getByRole("heading", { name: "作品", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PLACEHOLDER")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "作品分類" }),
  ).toBeVisible();

  await page.goto("/zh/works?category=research");
  const main = page.locator("main");
  await expect(
    main.getByRole("heading", { name: "示範：分析筆記" }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "示範：單曲混音" }),
  ).toHaveCount(0);

  await page.goto("/en/writing");
  await expect(
    page.getByRole("heading", { name: "Writing", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("PLACEHOLDER")).toHaveCount(0);

  await page.goto("/zh/terms");
  await expect(page.getByRole("heading", { name: "服務條款" })).toBeVisible();
  await page.goto("/zh/privacy");
  await expect(
    page.getByRole("heading", { name: "隱私說明", exact: true }),
  ).toBeVisible();
});
