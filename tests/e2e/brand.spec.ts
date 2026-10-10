import { expect, test } from "@playwright/test";
import { expectNoPersonalName, personalNameHits } from "./helpers/brand";

/*
 * Brand (content-architecture §6, brief "Brand"): the only public identity is
 * "Kamel". Every public page, in both locales, is scanned as served HTML
 * (head tags, JSON-LD, loader data) and as rendered DOM. The flagged brand
 * contact address is taken from the page and excluded (Kevin confirms or
 * changes it in Studio → Brand).
 */
const PATHS = [
  "",
  "/works",
  "/works/fixture-signal-map",
  "/works/fixture-single-mix",
  "/services",
  "/services/software",
  "/mixing",
  "/mixing/full",
  "/mixing/vocal",
  "/song-transition",
  "/song-transition/simple",
  "/song-transition/edit",
  "/about",
  "/writing",
  "/writing/fixture-building-notes",
  "/commission",
  "/commission/mixing",
  "/terms",
  "/privacy",
];

for (const locale of ["zh", "en"] as const) {
  test(`no personal-name variant in served ${locale} pages`, async ({
    request,
  }) => {
    for (const path of PATHS) {
      const response = await request.get(`/${locale}${path}`);
      expect(response.status(), `/${locale}${path}`).toBe(200);
      const html = await response.text();
      expect(personalNameHits(html), `/${locale}${path}`).toEqual([]);
      expect(html, `/${locale}${path}`).not.toMatch(/name="author"/);
    }
  });
}

test("the not-found page carries only the brand", async ({ request }) => {
  const response = await request.get("/en/not-a-real-page");
  expect(response.status()).toBe(404);
  expect(personalNameHits(await response.text())).toEqual([]);
});

test("head tags name only the brand", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveTitle(/^Kamel — /);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Kamel",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Kamel/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Kamel/,
  );
  const ld = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()) ?? "{}",
  );
  expect(ld).toMatchObject({ "@type": "WebSite", name: "Kamel" });
  expect(JSON.stringify(ld)).not.toMatch(/Person|author/);

  await page.goto("/zh/works/fixture-signal-map");
  await expect(page).toHaveTitle("示範：訊號地圖 — Kamel");
});

test("rendered pages, labels and the header wordmark use Kamel only", async ({
  page,
}) => {
  for (const path of ["/zh", "/en", "/zh/about", "/en/works"]) {
    await page.goto(path);
    await expectNoPersonalName(page);
  }
  await page.goto("/en");
  await expect(page.getByRole("link", { name: "Kamel home" })).toHaveText(
    "Kamel",
  );
  await expect(
    page.getByRole("contentinfo").getByText(/^© \d{4} Kamel$/),
  ).toBeVisible();
});
