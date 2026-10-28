/**
 * The retired /admin with the owner signed in (wp5 §6.4): every legacy URL
 * answers an uncached 301 to its Studio equivalent, every legacy form post
 * 410, and a browser lands on the real Studio screens. Reads only; nothing
 * is written.
 */
import { expect, openStudio, test } from "./harness";

const REDIRECTS: Array<[string, string]> = [
  ["/admin", "/studio"],
  ["/admin/", "/studio"],
  ["/admin/content", "/studio"],
  ["/admin/works", "/studio/projects"],
  ["/admin/posts", "/studio/writing"],
  ["/admin/services", "/studio/services/pricing"],
  ["/admin/terms", "/studio/services/terms"],
  ["/admin/links", "/studio/settings/footer"],
  ["/admin/cases", "/studio/commissions"],
  ["/admin/cases/status", "/studio/commissions"],
  ["/admin/cases/student-discount", "/studio/commissions"],
  ["/admin/cases/cleanup", "/studio/commissions"],
  [
    "/admin/cases?status=pending_review",
    "/studio/commissions?status=pending_review",
  ],
  ["/ADMIN/Works", "/studio/projects"],
  ["/admin/content/does-not-exist/edit", "/studio"],
  ["/admin/posts/does-not-exist/edit", "/studio"],
  ["/admin/whatever/deep", "/studio"],
];

for (const [path, target] of REDIRECTS) {
  test(`GET ${path} → 301 ${target}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(target);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });
}

test("HEAD /admin → 301 /studio", async ({ request }) => {
  const response = await request.head("/admin", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe("/studio");
});

test("legacy form posts are gone, not replayed", async ({ request }) => {
  const status = await request.post("/admin/cases/status", {
    form: { caseId: "x", status: "paused" },
    maxRedirects: 0,
  });
  expect(status.status()).toBe(410);
  expect(await status.text()).toBe("Gone");
  expect(status.headers()["cache-control"]).toContain("no-store");

  const links = await request.fetch("/admin/links", {
    method: "PUT",
    data: "{}",
    maxRedirects: 0,
  });
  expect(links.status()).toBe(410);

  const terms = await request.fetch("/admin/terms", {
    method: "DELETE",
    maxRedirects: 0,
  });
  expect(terms.status()).toBe(410);
});

const SCREENS: Array<[string, RegExp, string]> = [
  ["/admin/works", /\/studio\/projects$/, "Projects"],
  ["/admin/cases", /\/studio\/commissions$/, "Commissions"],
  ["/admin/services", /\/studio\/services\/pricing$/, "Pricing"],
  ["/admin/terms", /\/studio\/services\/terms$/, "Terms"],
];

for (const [path, url, heading] of SCREENS) {
  test(`a ${path} bookmark opens Studio → ${heading}`, async ({ page }) => {
    await openStudio(page, path);
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Not built yet")).toHaveCount(0);
    // Neither the sidebar nor the screen links back to the retired admin.
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  });
}

test("a /admin/links bookmark opens Studio → Footer", async ({ page }) => {
  // Pending wp3: once Studio → Footer replaces its stub, this case also
  // asserts no "Not built yet" and no link back to the retired admin, like
  // the screens above.
  await openStudio(page, "/admin/links");
  await expect(page).toHaveURL(/\/studio\/settings\/footer$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Footer", exact: true }),
  ).toBeVisible();
});
