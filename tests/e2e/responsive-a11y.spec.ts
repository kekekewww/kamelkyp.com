import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`landing is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/zh");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  });
}

test("primary navigation is a flat keyboard list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");

  const brand = page.getByRole("link", { name: "Kamel home" });
  await brand.focus();
  for (const name of [
    "Work",
    "Services",
    "About",
    "Writing",
    "Start a project",
  ]) {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAccessibleName(name);
  }

  await brand.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/services$/);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Full Song Mixing" }),
  ).toHaveCount(0);
});

test("mobile controls meet the minimum touch target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh");

  const menuButton = page.getByRole("button", { name: "開啟選單" });
  const buttonBox = await menuButton.boundingBox();
  expect(buttonBox?.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);

  const headerCta = page
    .getByRole("banner")
    .getByRole("link", { name: "開始合作", exact: true });
  const ctaBox = await headerCta.boundingBox();
  expect(ctaBox?.width).toBeGreaterThanOrEqual(44);
  expect(ctaBox?.height).toBeGreaterThanOrEqual(44);

  const summaries = page.locator("footer summary");
  await expect(summaries).toHaveCount(5);
  for (const summary of await summaries.all()) {
    const box = await summary.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

// Work agent: add "/en/works" to this list once the Work index is rebuilt.
for (const path of ["/en", "/en/services/software", "/en/about"]) {
  test(`${path} has no serious axe violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      results.violations.filter((item) =>
        ["critical", "serious"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  });
}
