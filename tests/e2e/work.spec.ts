import { expect, test } from "@playwright/test";

const SAMPLE_TITLES_EN = [
  "Sample: Generative Audio-Visual Tool",
  "Sample: Full Song Mix — Indie Single",
  "Sample: Interactive Projection Study",
  "Sample: Booking Management System",
  "Sample: Vocal Production Session",
  "Sample: Real-Time Audio Analysis Notes",
];

test("work index merges file projects into one list with placeholder badges", async ({
  page,
}) => {
  await page.goto("/en/works");
  const main = page.locator("main#main-content");

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Work");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Work categories" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^All\s*\d{2}$/ }),
  ).toHaveAttribute("aria-current", "page");

  for (const title of SAMPLE_TITLES_EN) {
    await expect(main.getByRole("heading", { name: title })).toBeVisible();
  }

  // Every placeholder row and the feature block carry the visible badge.
  const rowBadges = main.locator(".project-row .badge-placeholder");
  await expect(rowBadges).toHaveCount(5);
  await expect(
    main.locator(".project-feature .project-feature__head .badge-placeholder"),
  ).toBeVisible();

  // Rows link to their detail pages.
  await expect(
    main.getByRole("link", { name: /Sample: Booking Management System/ }),
  ).toHaveAttribute("href", "/en/works/sample-booking-management-system");

  // No inline style attributes in the SSR markup (CSP style-src 'self').
  const html = await (await page.request.get("/en/works")).text();
  expect(html).not.toMatch(/<[^>]+\sstyle="/);
});

test("category filter links narrow the list and keep the locale", async ({
  page,
}) => {
  await page.goto("/en/works?category=mixing");
  const main = page.locator("main#main-content");

  await expect(
    page.getByRole("link", { name: /^Mixing\s*\d{2}$/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(main.getByRole("status")).toHaveText("1 project");
  await expect(
    main.getByRole("heading", { name: "Sample: Full Song Mix — Indie Single" }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Sample: Booking Management System" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: /^Software\s*\d{2}$/ }).click();
  await expect(page).toHaveURL(/\/en\/works\?category=software$/);
  await expect(
    main.getByRole("heading", { name: "Sample: Booking Management System" }),
  ).toBeVisible();

  // Unknown values fall back to "all".
  await page.goto("/en/works?category=unknown");
  await expect(
    page.getByRole("link", { name: /^All\s*\d{2}$/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("keyboard focus on a row shows its preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/works");
  const row = page.locator(
    '.project-row[data-preview-id="sample-booking-management-system"]',
  );
  await row.focus();
  await expect(page.locator(".hover-preview")).toHaveAttribute(
    "data-visible",
    "",
  );
  await expect(
    page.locator(
      '.hover-preview__item[data-preview-for="sample-booking-management-system"]',
    ),
  ).toHaveAttribute("data-active", "");
});

test("placeholder project detail renders its case study and metadata", async ({
  page,
}) => {
  await page.goto("/en/works/sample-booking-management-system");
  const main = page.locator("main#main-content");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Sample: Booking Management System",
  );
  await expect(main.locator(".project-hero .badge-placeholder")).toBeVisible();
  await expect(
    main.getByText("Sample content — to be replaced with real work."),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );

  const facts = main.locator(".project-facts");
  await expect(facts.getByText("Year", { exact: true })).toBeVisible();
  await expect(facts.getByText("2024", { exact: true })).toBeVisible();
  await expect(facts.getByText("Software", { exact: true })).toBeVisible();
  await expect(
    facts.getByText("Full-stack development", { exact: true }),
  ).toBeVisible();
  await expect(facts.getByText("Cloudflare Workers")).toBeVisible();

  await expect(main.getByRole("heading", { name: "Problem" })).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "System & architecture" }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  await expect(
    main.getByRole("link", { name: "Back to work" }),
  ).toHaveAttribute("href", "/en/works");
  await expect(
    main.getByRole("navigation", { name: "Next project" }),
  ).toBeVisible();
});

test("music placeholder shows the track sheet without a fake player", async ({
  page,
}) => {
  await page.goto("/zh/works/sample-full-song-mix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "示意：完整歌曲混音——獨立單曲",
  );
  const sheet = page.getByRole("region", { name: "音訊" });
  await expect(sheet.getByText("音訊待補")).toBeVisible();
  await expect(sheet.getByText("曲目")).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("zh work index uses the IA copy", async ({ page }) => {
  await page.goto("/zh/works");
  await expect(
    page.getByRole("heading", { name: "作品", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("軟體、AI、互動、音樂與混音——同一套方法，不同的媒材。"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^全部\s*\d{2}$/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("status")).toContainText("件作品");
  await expect(
    page.getByRole("link", { name: /^研究\s*\d{2}$/ }),
  ).toHaveAttribute("href", "/zh/works?category=research");
});

test("unknown work slug returns 404", async ({ request }) => {
  const response = await request.get("/en/works/does-not-exist");
  expect(response.status()).toBe(404);
});
