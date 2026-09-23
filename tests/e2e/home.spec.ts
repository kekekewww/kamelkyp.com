import { expect, test } from "@playwright/test";

/*
 * Home page (docs/information-architecture.md §4.1, §7.2):
 * section order, identity rules, pricing preview, CTA placement, CSP safety.
 */

const ZH_SECTIONS = [
  "精選作品",
  "能力範圍",
  "獲獎與肯定",
  "服務",
  "價格參考",
  "關於",
  "文章與貼文",
  "有想做的作品嗎？",
];

const EN_SECTIONS = [
  "Selected Work",
  "Capabilities",
  "Recognition",
  "Services",
  "Pricing",
  "About",
  "Writing",
  "Have a project in mind?",
];

for (const [locale, sections] of [
  ["zh", ZH_SECTIONS],
  ["en", EN_SECTIONS],
] as const) {
  test(`/${locale} renders the IA section order`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("id", "main-content");

    const h2s = await main.locator("h2").allTextContents();
    expect(h2s.map((text) => text.trim())).toEqual(sections);

    // Only the wordmark heading may contain "Kamel".
    await expect(page.getByRole("heading", { name: "Kamel" })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kamel", exact: true }),
    ).toBeVisible();
  });
}

test("the real name appears exactly once per locale", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.getByText("楊子賢", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Kevin Yang/)).toHaveCount(0);
  const hero = page
    .getByRole("main")
    .getByRole("region", { name: "自我介紹", exact: true });
  await expect(hero.getByText("創意科技")).toBeVisible();

  await page.goto("/en");
  await expect(page.getByText("Kevin Yang", { exact: true })).toHaveCount(1);
  await expect(page.getByText("楊子賢")).toHaveCount(0);
  await expect(
    page.getByText("Building systems, sound, and interactive experiences."),
  ).toBeVisible();
});

test("home offers exactly three in-page start-a-project CTAs and View work", async ({
  page,
}) => {
  await page.goto("/zh");
  const main = page.getByRole("main");
  const ctas = main.getByRole("link", { name: "開始合作", exact: true });
  await expect(ctas).toHaveCount(3);
  for (const cta of await ctas.all()) {
    await expect(cta).toHaveAttribute("href", "/zh/commission");
  }
  await expect(
    main.getByRole("link", { name: "查看作品", exact: true }),
  ).toHaveAttribute("href", "/zh/works");
});

test("selected work mixes categories and badges placeholders", async ({
  page,
}) => {
  await page.goto("/en");
  const work = page
    .getByRole("main")
    .getByRole("region", { name: "Selected Work", exact: true });
  const links = work.locator('a[href^="/en/works/"]');
  expect(await links.count()).toBeGreaterThanOrEqual(4);
  await expect(work.getByText("PLACEHOLDER").first()).toBeVisible();
  for (const category of ["AI", "Mixing", "Interactive", "Research"]) {
    await expect(
      work.getByText(category, { exact: true }).first(),
    ).toBeAttached();
  }
  await expect(work.getByRole("link", { name: /All work/ })).toHaveAttribute(
    "href",
    "/en/works",
  );
});

test("pricing preview shows real starting prices and a quote row", async ({
  page,
}) => {
  await page.goto("/zh");
  const pricing = page
    .getByRole("main")
    .getByRole("region", { name: "價格參考", exact: true });
  await expect(pricing.getByText("NT$4,000", { exact: true })).toBeVisible();
  await expect(pricing.getByText("NT$1,000", { exact: true })).toBeVisible();
  await expect(pricing.getByText("依專案報價")).toBeVisible();
  // Category-level only: never individual service names.
  await expect(pricing.getByText("完整歌曲混音")).toHaveCount(0);

  await page.goto("/en");
  const enPricing = page
    .getByRole("main")
    .getByRole("region", { name: "Pricing", exact: true });
  await expect(enPricing.getByText(/US\$/).first()).toBeVisible();
  await expect(enPricing.getByText(/NT\$/)).toHaveCount(0);
  await expect(enPricing.getByText("Contact for quote")).toBeVisible();
});

test("services link to the three group pages", async ({ page }) => {
  await page.goto("/en");
  const services = page
    .getByRole("main")
    .getByRole("region", { name: "Services", exact: true });
  await expect(
    services.getByRole("link", { name: "View mixing" }),
  ).toHaveAttribute("href", "/en/mixing");
  await expect(
    services.getByRole("link", { name: "View song transition" }),
  ).toHaveAttribute("href", "/en/song-transition");
  await expect(
    services.getByRole("link", { name: "View software & interactive" }),
  ).toHaveAttribute("href", "/en/services/software");
});

test("hero canvas is decorative and SSR has no inline styles", async ({
  page,
  request,
}) => {
  const response = await request.get("/en");
  const html = await response.text();
  expect(html).not.toMatch(/\sstyle="/);
  expect(html).toContain('class="hero-canvas"');

  await page.goto("/en");
  const field = page.locator(".hero-field");
  await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".hero-field__svg").first()).toBeAttached();
});

test("reduced motion keeps the hero complete and still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Start a project" })
      .first(),
  ).toBeVisible();
  // The canvas draws one static frame and marks itself ready.
  await expect(page.locator(".hero-canvas")).toHaveAttribute("data-ready", "");
});
