import { expect, test } from "@playwright/test";

/*
 * Work (IA §4.2–4.3) read from the Content Studio (tests/fixtures/cms-e2e.sql):
 * six published fixture projects, a featured order, a renamed slug, a draft,
 * unlisted media pages and the seeded TODO samples (drafts, never public).
 */
const FIXTURE_TITLES_EN = [
  "Fixture Signal Map",
  "Fixture Booking Console",
  "Fixture Listening Room",
  "Fixture Single Mix",
  "Fixture Vocal Session",
  "Fixture Analysis Notes",
];

test("work index lists the published projects only, in Studio order", async ({
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

  for (const title of FIXTURE_TITLES_EN) {
    await expect(main.getByRole("heading", { name: title })).toBeVisible();
  }
  // The first featured project is the feature block.
  await expect(
    main.locator(".project-feature").getByRole("heading", {
      name: "Fixture Signal Map",
    }),
  ).toBeVisible();

  // Drafts, TODO samples and unlisted pages never appear in the list.
  await expect(main.getByText("Fixture Draft Project")).toHaveCount(0);
  await expect(main.getByText(/^Sample:/)).toHaveCount(0);
  await expect(main.getByText("PLACEHOLDER")).toHaveCount(0);
  await expect(main.getByText("Audio playback test")).toHaveCount(0);

  await expect(
    main.getByRole("link", { name: /Fixture Booking Console/ }),
  ).toHaveAttribute("href", "/en/works/fixture-booking-console");

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
    main.getByRole("heading", { name: "Fixture Single Mix" }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Fixture Booking Console" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: /^Software\s*\d{2}$/ }).click();
  await expect(page).toHaveURL(/\/en\/works\?category=software$/);
  await expect(
    main.getByRole("heading", { name: "Fixture Booking Console" }),
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
    '.project-row[data-preview-id="fixture-booking-console"]',
  );
  await row.focus();
  await expect(page.locator(".hover-preview")).toHaveAttribute(
    "data-visible",
    "",
  );
  await expect(
    page.locator(
      '.hover-preview__item[data-preview-for="fixture-booking-console"]',
    ),
  ).toHaveAttribute("data-active", "");
});

test("a complete project renders every case-study group from the Studio", async ({
  page,
}) => {
  await page.goto("/en/works/fixture-signal-map");
  const main = page.locator("main#main-content");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Fixture Signal Map",
  );
  await expect(main.getByText("PLACEHOLDER")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  const facts = main.locator(".project-facts");
  await expect(facts.getByText("2026", { exact: true })).toBeVisible();
  await expect(facts.getByText("AI / Research", { exact: true })).toBeVisible();
  await expect(
    facts.getByText("Design & development", { exact: true }),
  ).toBeVisible();
  await expect(facts.getByText("Cloudflare Workers")).toBeVisible();

  for (const heading of [
    "Overview",
    "Context",
    "Problem",
    "Approach",
    "System & architecture",
    "Result",
    "Media",
    "Lessons & reflection",
    "Links",
    "Credits",
  ]) {
    await expect(
      main.getByRole("heading", { level: 2, name: heading, exact: true }),
    ).toBeVisible();
  }
  const cover = main.locator(".project-hero__cover img");
  await expect(cover).toHaveAttribute("alt", "Fixture signal map cover");
  await expect(cover).toHaveClass(/focal-x-50 focal-y-25/);
  await expect(main.getByText("Fixture frame caption")).toBeVisible();
  await expect(
    main.getByRole("link", { name: /Project site/ }),
  ).toHaveAttribute("href", "https://example.com/fixture-signal-map");

  await expect(
    main.getByRole("link", { name: "Back to work" }),
  ).toHaveAttribute("href", "/en/works");
  const next = main.getByRole("navigation", { name: "Next project" });
  await expect(next.getByRole("link")).toHaveAttribute(
    "href",
    "/en/works/fixture-booking-console",
  );
});

test("a minimal project omits every empty group", async ({ page }) => {
  await page.goto("/en/works/fixture-booking-console");
  const main = page.locator("main#main-content");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Fixture Booking Console",
  );
  await expect(main.locator(".case-section")).toHaveCount(0);
  await expect(main.locator(".case-toc")).toHaveCount(0);
  await expect(main.locator(".track-sheet")).toHaveCount(0);
  // No cover image: the procedural cover, never a broken image.
  await expect(main.locator(".project-hero__cover svg")).toBeAttached();
  await expect(main.locator(".project-hero__cover img")).toHaveCount(0);
});

test("a music project shows its published track with a click-to-play player", async ({
  page,
}) => {
  await page.goto("/en/works/fixture-single-mix");
  const sheet = page.getByRole("region", {
    name: "Audio: Fixture Single",
    exact: true,
  });
  await expect(sheet.getByText("Mixing engineer")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Play Fixture Single" }),
  ).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("a renamed project slug answers 301 to the current URL", async ({
  request,
}) => {
  const response = await request.get("/en/works/fixture-old-signal-map", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe("/en/works/fixture-signal-map");
});

test("drafts and TODO samples are 404; unlisted pages are reachable but not listed", async ({
  request,
}) => {
  for (const slug of [
    "fixture-draft-project",
    "sample-booking-management-system",
    "sample-full-song-mix",
  ]) {
    expect((await request.get(`/en/works/${slug}`)).status(), slug).toBe(404);
  }
  expect((await request.get("/en/works/audio-test")).status()).toBe(200);
  const list = await (await request.get("/en/works")).text();
  expect(list).not.toContain('href="/en/works/audio-test"');
  // English-only media pages have no Chinese version.
  expect((await request.get("/zh/works/audio-test")).status()).toBe(404);
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
