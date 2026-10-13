/**
 * Studio Commissions inbox (wp1 §7.4) on the dev-server harness. The steps
 * share and change four seeded cases, so they run in order; `beforeAll`
 * seeds them (a retried group starts from a fresh seed) and `afterAll`
 * removes them so the local Studio is not left with fake cases.
 *
 * The cleanup step never clicks "Confirm cleanup": the harness's Apps Script
 * URL is a real `script.google.com` address. Its success and failure paths
 * are covered by the worker tests.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, openStudio, runLocalD1File, test } from "./harness";

const ID = {
  review: "KAM-20261001-E2E0000001",
  production: "KAM-20261001-E2E0000002",
  student: "KAM-20261001-E2E0000003",
  due: "KAM-20261001-E2E0000004",
} as const;

const SENTINELS = [
  "sentinel-payload-hash",
  "sentinel-google-id",
  "sentinel-terms",
  "sentinel-error",
];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  runLocalD1File("tests/fixtures/commissions-studio-e2e.sql");
});

test.afterAll(() => {
  runLocalD1File("tests/fixtures/commissions-studio-e2e-cleanup.sql");
});

function caseRow(page: Page, caseId: string): Locator {
  return page.getByRole("listitem", { name: `Case ${caseId}`, exact: true });
}

/** The sidebar's pending-review count for Commissions (0 when hidden). */
async function pendingBadge(page: Page): Promise<number> {
  const link = page
    .getByRole("navigation", { name: "Studio sections" })
    .locator('a[href="/studio/commissions"]');
  const count = link.locator(".studio-nav__count [aria-hidden]");
  if ((await count.count()) === 0) return 0;
  return Number(await count.textContent());
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("shows only the permanent case fields", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page, "/studio/commissions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Commissions" }),
  ).toBeVisible();
  for (const caseId of Object.values(ID)) {
    await expect(caseRow(page, caseId)).toBeVisible();
  }
  await expect(caseRow(page, ID.review)).toContainText("NT$8,000");
  await expect(caseRow(page, ID.production)).toContainText("US$260.00");
  const html = await page.content();
  for (const sentinel of SENTINELS) expect(html).not.toContain(sentinel);

  await expectNoAxeViolations(page);

  const queue = page.locator("#cleanup-due");
  await queue
    .getByRole("button", { name: `Confirm cleanup for ${ID.due}` })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `Confirm cleanup for ${ID.due}`,
  });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the home attention row deep-links to the student price queue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio");
  await page.getByRole("link", { name: "Check student prices" }).click();
  await expect(page).toHaveURL(/\/studio\/commissions#student-reviews$/);
  const section = page.locator("#student-reviews");
  await expect(section).toBeInViewport();
  await expect(section).toContainText(ID.student);
});

test("changes a status with Undo, also when the row leaves a filtered list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const before = await pendingBadge(page);
  expect(before).toBeGreaterThanOrEqual(2);

  const row = caseRow(page, ID.review);
  await row
    .getByRole("combobox", { name: `Status for ${ID.review}` })
    .selectOption("pending_deposit");
  await row
    .getByRole("button", { name: `Update status of ${ID.review}` })
    .click();
  const toasts = page.locator(".studio-toasts");
  await expect(toasts).toContainText(`${ID.review} is now “Awaiting deposit”`);
  // Hovering pauses the toast's dismiss timer.
  await toasts.locator(".studio-toast", { hasText: "is now" }).hover();
  await expect.poll(() => pendingBadge(page)).toBe(before - 1);
  await expect(row).toContainText("Awaiting deposit");

  await toasts.getByRole("button", { name: "Undo" }).click();
  await expect(toasts).toContainText(
    `${ID.review} is back to “Pending review”`,
  );
  await expect.poll(() => pendingBadge(page)).toBe(before);
  await expect(row).toContainText("Pending review");

  // Filtered: the changed row leaves the list, its toast and Undo stay.
  await openStudio(page, "/studio/commissions?status=pending_review");
  const filteredRow = caseRow(page, ID.review);
  await filteredRow
    .getByRole("combobox", { name: `Status for ${ID.review}` })
    .selectOption("pending_deposit");
  await filteredRow
    .getByRole("button", { name: `Update status of ${ID.review}` })
    .click();
  await expect(toasts).toContainText(`${ID.review} is now “Awaiting deposit”`);
  await toasts.locator(".studio-toast", { hasText: "is now" }).hover();
  await expect(filteredRow).toHaveCount(0);
  await expect(page.locator("body")).not.toBeFocused();
  await toasts.getByRole("button", { name: "Undo" }).click();
  await expect(toasts).toContainText(
    `${ID.review} is back to “Pending review”`,
  );
  await expect(caseRow(page, ID.review)).toBeVisible();
  await expect.poll(() => pendingBadge(page)).toBe(before);
});

test("keeps the student price after an inline confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const queue = page.locator("#student-reviews");
  const item = queue.getByRole("listitem", {
    name: `Student price, case ${ID.student}`,
  });
  await expect(item).toContainText("NT$8,000");
  await expect(item).toContainText("NT$5,600");
  await item
    .getByRole("button", { name: `Accept student price for ${ID.student}` })
    .click();
  const confirm = item.getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeFocused();
  await expect(item).toContainText(
    `Keep the student price NT$5,600 for ${ID.student}? This cannot be undone.`,
  );
  await confirm.click();
  await expect(page.locator(".studio-toasts")).toContainText(
    "Email the client",
  );
  await expect(item).toHaveCount(0);
  await expect(
    queue.getByRole("heading", { name: /Student prices to check/ }),
  ).toBeFocused();
  await expect(caseRow(page, ID.student)).toContainText("NT$5,600");
  await expect(caseRow(page, ID.student)).not.toContainText("STUDENT PRICE");
});

test("the cleanup checklist needs all three confirmations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const queue = page.locator("#cleanup-due");
  const opener = queue.getByRole("button", {
    name: `Confirm cleanup for ${ID.due}`,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", {
    name: `Confirm cleanup for ${ID.due}`,
  });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirm cleanup" });
  const boxes = dialog.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  await expect(confirm).toBeDisabled();
  await boxes.nth(0).check();
  await expect(confirm).toBeDisabled();
  await boxes.nth(1).check();
  await expect(confirm).toBeDisabled();
  await boxes.nth(2).check();
  await expect(confirm).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(
    queue.getByRole("listitem", { name: `Cleanup, case ${ID.due}` }),
  ).toBeVisible();

  // Reopening starts from an empty checklist.
  await opener.click();
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("the legacy query string selects the same view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(
    page,
    "/studio/commissions?service=full_mix&status=pending_review",
  );
  const filters = page.getByRole("search", { name: "Filter cases" });
  await expect(filters.getByLabel("Status")).toHaveValue("pending_review");
  await expect(filters.getByLabel("Service")).toHaveValue("full_mix");
  await expect(caseRow(page, ID.review)).toBeVisible();
  await expect(caseRow(page, ID.student)).toBeVisible();
  await expect(caseRow(page, ID.production)).toHaveCount(0);
  await expect(caseRow(page, ID.due)).toHaveCount(0);

  await openStudio(page, "/studio/commissions?cursor=bogus");
  await expect(page.locator(".commissions-notice")).toHaveText(
    "That page link is no longer valid. Showing the newest cases.",
  );
});

test("stacks rows on a phone without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page, "/studio/commissions");
  const row = caseRow(page, ID.review);
  await expect(row).toBeVisible();
  const select = row.getByRole("combobox", {
    name: `Status for ${ID.review}`,
  });
  // Stacked: the status control sits under the case ID, full width.
  const id = await row.locator(".commissions-id").boundingBox();
  const control = await select.boundingBox();
  expect(id && control && control.y > id.y + id.height).toBe(true);

  await select.selectOption("pending_deposit");
  await row
    .getByRole("button", { name: `Update status of ${ID.review}` })
    .click();
  await expect(page.locator(".studio-toasts")).toContainText(
    `${ID.review} is now “Awaiting deposit”`,
  );
  await expect(row).toContainText("Awaiting deposit");
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
