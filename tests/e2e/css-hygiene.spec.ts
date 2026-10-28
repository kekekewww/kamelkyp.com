/**
 * wp6 (g) characterization: the Biome clean-up of the public stylesheets
 * (reordered zh utility rules, qualified review rows, suppressions) must not
 * change rendering. Every case sets its own viewport, because this suite runs
 * in both the desktop and the mobile project. It passed on the CSS before the
 * clean-up and must keep passing after it.
 *
 * wp7 (C3 a) adds the same kind of characterization for retiring the legacy
 * stylesheet and its token aliases: the service choice pages and the media
 * consent block render as they did, with the values recorded on the CSS
 * before the change.
 */
import { expect, type Page, test } from "@playwright/test";

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };

/**
 * The first `.service-select__card` box, recorded on both service choice
 * pages and in both projects before the legacy stylesheet was removed (the
 * values were the same everywhere).
 */
const SERVICE_CARD_BOXES = [
  { size: WIDE, x: 391.03125, width: 487.4375 },
  { size: NARROW, x: 16.484375, width: 357.03125 },
];

function tracks(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** Computed font-size of `var(--text-h3)` inside the element's own context. */
async function textH3Size(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.setProperty("font-size", "var(--text-h3)");
      element.appendChild(probe);
      const size = getComputedStyle(probe).fontSize;
      probe.remove();
      return size;
    });
}

async function openWizard(page: Page, locale: "en" | "zh") {
  await page.setViewportSize(WIDE);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`/${locale}/commission/mixing/full`);
  await page.locator('[data-draft-ready="true"]').waitFor();
}

test("zh headings and utility levels break at punctuation only", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("/zh");
  const statement = page.locator(".home-hero__statement");
  await expect(statement).toHaveCSS("word-break", "keep-all");
  await expect(statement).toHaveCSS("overflow-wrap", "anywhere");

  await page.goto("/en");
  await expect(page.locator(".home-hero__statement")).toHaveCSS(
    "word-break",
    "normal",
  );
});

test("the legal closing line keeps its grid column and zero margins", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("/en/terms");
  const closing = page.locator(".legal-doc__closing > p");
  await expect(closing).toHaveCSS("margin-top", "0px");
  await expect(closing).toHaveCSS("margin-bottom", "0px");
  await expect(closing).toHaveCSS("grid-column-start", "4");
  await expect(closing).toHaveCSS("grid-column-end", "11");

  await page.setViewportSize(NARROW);
  await page.goto("/en/terms");
  await expect(page.locator(".legal-doc__closing > p")).toHaveCSS(
    "margin-top",
    "0px",
  );
});

test("the quote summary keeps its heading size and two-column rows", async ({
  page,
}) => {
  await openWizard(page, "en");
  const size = await textH3Size(page, ".quote-summary");
  const headings = page.locator(".quote-summary h2");
  expect(await headings.count()).toBeGreaterThan(0);
  for (const heading of await headings.all()) {
    await expect(heading).toHaveCSS("font-size", size);
  }
  const rows = page.locator(".quote-summary dl > div");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    await expect(row).toHaveCSS("display", "grid");
    const columns = await row.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns,
    );
    expect(tracks(columns)).toBe(2);
  }
});

test("the zh quote summary heading keeps its size and line height", async ({
  page,
}) => {
  await openWizard(page, "zh");
  const heading = page.locator(".quote-summary h2").first();
  const size = await textH3Size(page, ".quote-summary");
  await expect(heading).toHaveCSS("font-size", size);
  const lineHeight = await heading.evaluate(
    (element) => getComputedStyle(element).lineHeight,
  );
  expect(Number.parseFloat(lineHeight)).toBeCloseTo(
    Number.parseFloat(size) * 1.3,
    1,
  );
});

for (const path of ["/en/mixing", "/zh/song-transition"]) {
  test(`${path}: the service choice section is a plain block and the cards keep their box`, async ({
    page,
  }) => {
    for (const expected of SERVICE_CARD_BOXES) {
      await page.setViewportSize(expected.size);
      await page.goto(path);
      const section = page.locator("section.service-choice");
      await expect(section).toHaveCSS("display", "block");
      for (const side of ["top", "right", "bottom", "left"]) {
        await expect(section).toHaveCSS(`border-${side}-width`, "0px");
      }
      const box = await page
        .locator(".service-select__card")
        .first()
        .boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeCloseTo(expected.x, 2);
      expect(box?.width).toBeCloseTo(expected.width, 2);
    }
  });
}

test("the media consent block keeps its colours", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("/en/works/media-test");
  const consent = page.locator(".media-consent");
  // Recorded while media.css still read the legacy aliases
  // (--color-cool-gray, --color-line, --color-console).
  await expect(consent.locator("p")).toHaveCSS("color", "rgb(154, 165, 178)");
  await expect(consent).toHaveCSS("border-top-color", "rgb(42, 54, 67)");
  await expect(consent).toHaveCSS("background-color", "rgb(15, 21, 29)");
  await expect(page.locator(".media-preview", { has: consent })).toHaveCSS(
    "border-top-color",
    "color(srgb 0.603922 0.647059 0.698039 / 0.35)",
  );
});
