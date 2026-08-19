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

test("desktop submenu works by keyboard and Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");

  const mixingLink = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Mixing", exact: true });
  const fullMixingLink = page.getByRole("link", { name: "Full Song Mixing" });
  await mixingLink.focus();
  await expect(fullMixingLink).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(fullMixingLink).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(fullMixingLink).toBeHidden();
  await expect(mixingLink).toBeFocused();
});

test("mobile controls meet the minimum touch target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh");

  const menuButton = page.getByRole("button", { name: "開啟選單" });
  const buttonBox = await menuButton.boundingBox();
  expect(buttonBox?.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);

  const summaries = page.locator("footer summary");
  await expect(summaries).toHaveCount(5);
  for (const summary of await summaries.all()) {
    const box = await summary.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("public landing has no serious axe violations", async ({ page }) => {
  await page.goto("/en");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(
    results.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact ?? ""),
    ),
  ).toEqual([]);
});
