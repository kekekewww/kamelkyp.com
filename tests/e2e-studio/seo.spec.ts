/**
 * WP4 SEO on the dev-server Studio harness (WP4 §6.4): publishing a project
 * puts it in the sitemap with hreflang alternates, unlisting it removes it
 * and makes the page noindex, unpublishing makes it 404. APP_ORIGIN is the
 * harness origin here, so URLs are asserted exactly. Titles carry a per-run
 * token because the local D1 keeps rows between runs.
 */
import type { Page } from "@playwright/test";
import { expect, openStudio, STUDIO_E2E_ORIGIN, test } from "./harness";

const token = `${Date.now().toString(36)}`;
const LISTED_HINT =
  "Unlisted projects stay reachable by their URL but are left out of /works, the homepage and the sitemap, and ask search engines not to index them. Takes effect when you publish.";

async function createProject(page: Page, en: string, zh: string) {
  await openStudio(page, "/studio/projects/new");
  await page.locator('input[name="title.zh"]').fill(zh);
  const titleEn = page.locator('input[name="title.en"]');
  // The slug follows the EN title once the page is interactive (retry until
  // hydrated rather than racing it).
  await expect(async () => {
    await titleEn.fill("");
    await titleEn.pressSequentially(en);
    await expect(page.locator('input[name="slug"]')).not.toHaveValue("", {
      timeout: 500,
    });
  }).toPass();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    /SAVED|NO CHANGES/,
  );
}

function badge(page: Page) {
  return page.locator(".studio-topbar .studio-badge").first();
}

/** Editor sections are <details> that remember their state per browser. */
async function openSection(page: Page, id: string) {
  const section = page.locator(`#section-${id}`);
  if ((await section.getAttribute("open")) === null) {
    await section.locator("summary").first().click();
  }
  await expect(section).toHaveAttribute("open", "");
}

test("publish, unlist and unpublish drive the sitemap and the page head", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = `seo-flow-${token}`;
  const enUrl = `${STUDIO_E2E_ORIGIN}/en/works/${slug}`;
  const zhUrl = `${STUDIO_E2E_ORIGIN}/zh/works/${slug}`;
  await createProject(page, `SEO Flow ${token}`, `搜尋測試${token}`);
  await expect(page.locator('input[name="slug"]')).toHaveValue(slug);
  const editor = page.url();

  // 1. Complete and publish: listed in the sitemap in both locales.
  await openSection(page, "basic");
  await openSection(page, "classification");
  await page.locator('input[name="year:number"]').fill("2026");
  await page
    .locator('select[name="primaryCategoryId"]')
    .selectOption("term-project_category-software");
  await page.locator('textarea[name="shortDescription.zh"]').fill("搜尋摘要");
  await page
    .locator('textarea[name="shortDescription.en"]')
    .fill("Search summary");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    /SAVED \d\d:\d\d/,
  );
  await page.locator('header button[value="publish"]').click();
  await expect(badge(page)).toHaveText("Published");

  const listed = await (await request.get("/sitemap.xml")).text();
  expect(listed).toContain(`<loc>${enUrl}</loc>`);
  expect(listed).toContain(`<loc>${zhUrl}</loc>`);
  expect(listed).toContain(`hreflang="zh-Hant" href="${zhUrl}"`);

  await page.goto(`/en/works/${slug}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    enUrl,
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="x-default"]'),
  ).toHaveAttribute("href", enUrl);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  // 2. Unlist and publish: out of the sitemap, noindex, no canonical.
  await openStudio(page, new URL(editor).pathname);
  await openSection(page, "publication");
  const checkbox = page.getByLabel("Show in lists");
  await expect(checkbox).toBeChecked();
  await expect(
    page.locator(".studio-check", { has: checkbox }).locator(".studio-hint"),
  ).toHaveText(LISTED_HINT);
  await checkbox.uncheck();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    /SAVED \d\d:\d\d/,
  );
  await page.locator('header button[value="publish"]').click();
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    /SAVED|NO CHANGES/,
  );
  await expect(async () => {
    const unlisted = await (await request.get("/sitemap.xml")).text();
    expect(unlisted).not.toContain(slug);
  }).toPass();

  await page.goto(`/en/works/${slug}`);
  await expect(
    page.locator('meta[name="robots"][content="noindex"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  // 3. Unpublish (the editor's "More" panel, phone layout): gone and 404.
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page, new URL(editor).pathname);
  const bar = page.locator(".projects-editor__mobilebar");
  await bar.locator("summary", { hasText: "More" }).click();
  await bar.locator('button[value="unpublish"]').click();
  await expect(badge(page)).toHaveText("Draft");
  const gone = await (await request.get("/sitemap.xml")).text();
  expect(gone).not.toContain(slug);
  expect((await request.get(`/en/works/${slug}`)).status()).toBe(404);

  // 4. The Studio stays out of search.
  const studio = await request.get("/studio");
  expect(studio.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(await studio.text()).not.toContain('rel="canonical"');
});
