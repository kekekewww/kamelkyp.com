import { expect, test } from "@playwright/test";
import { personalNameHits } from "./helpers/brand";

/**
 * The public footer composed from CMS data (wp3 spec §4.4, §6.3): group order
 * and labels from `link_groups`, localized internal links, the seeded
 * Work & Resources links (the repository link stays hidden), the hidden
 * fixture group never reaching the page, no prices and the Kamel brand only.
 */

const EN_GROUPS = [
  "Navigate",
  "Services",
  "Work & Resources",
  "Find Me",
  "Contact",
  "Legal",
];
const ZH_GROUPS = ["導覽", "服務", "作品與資源", "社群", "聯絡", "條款與網站"];

test("desktop footer groups follow the stored order in both languages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  await expect(page.locator(".site-footer__desktop-groups h2")).toHaveText(
    EN_GROUPS,
  );
  await page.goto("/zh");
  await expect(page.locator(".site-footer__desktop-groups h2")).toHaveText(
    ZH_GROUPS,
  );
});

test("footer links are localized and the repository link stays hidden", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const groups = page.locator(".site-footer__desktop-groups");
  for (const href of [
    "/en/works",
    "/en/mixing",
    "/en/services/software",
    "/en/commission",
    "/en/terms",
    "/en/privacy",
  ]) {
    await expect(groups.locator(`a[href="${href}"]`), href).toHaveCount(1);
  }
  const profile = groups.locator('a[href="https://github.com/kekekewww"]');
  await expect(profile).toHaveAttribute("target", "_blank");
  await expect(profile).toHaveAttribute("rel", /noopener/);
  await expect(
    page.locator('footer a[href="https://github.com/kekekewww/kamelkyp.com"]'),
  ).toHaveCount(0);
});

test("a hidden footer group never reaches the page", async ({
  page,
  request,
}) => {
  for (const path of ["/en", "/zh"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html, path).not.toContain("Fixture hidden group");
    expect(html, path).not.toContain("隱藏測試群組");
    expect(html, path).not.toContain("e2e-hidden-footer");

    await page.goto(path);
    const footer = page.locator("footer");
    await expect(footer).not.toContainText("Fixture hidden group");
    await expect(footer).not.toContainText("隱藏測試群組");
    await expect(footer.locator('a[href*="e2e-hidden-footer"]')).toHaveCount(0);
  }
});

test("the footer shows no price and only the Kamel brand", async ({ page }) => {
  await page.goto("/en");
  const footer = page.locator("footer");
  const text = await footer.innerText();
  expect(text).not.toMatch(/NT\$|US\$/);
  expect(personalNameHits(await footer.innerHTML())).toEqual([]);
});

test("phone footer groups open one by one in the same order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  const summaries = page.locator("footer details > summary");
  await expect(summaries).toHaveText(EN_GROUPS);
  const legal = page
    .locator("footer details")
    .filter({ has: page.locator("summary", { hasText: "Legal" }) });
  await legal.locator("summary").click();
  await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "/en/terms",
  );
  await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/en/privacy",
  );
});
