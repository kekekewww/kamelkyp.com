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

test("Update posts nothing while the selection is unchanged and keeps focus after a change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const statusPosts: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/studio/commissions/status")
    ) {
      statusPosts.push(request.url());
    }
  });
  const row = caseRow(page, ID.review);
  const select = row.getByRole("combobox", { name: `Status for ${ID.review}` });
  const update = row.getByRole("button", {
    name: `Update status of ${ID.review}`,
  });
  // Unchanged: announced as unavailable, yet focusable (not `disabled`), so
  // focus can stay on it once a change has landed (wp1 §4.10).
  await expect(update).toHaveAttribute("aria-disabled", "true");
  await expect(update).not.toHaveAttribute("disabled");
  await update.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  expect(statusPosts).toEqual([]);
  await expect(page.locator(".studio-toasts")).not.toContainText(ID.review);
  await expect(update).toBeFocused();

  await select.selectOption("pending_deposit");
  await expect(update).not.toHaveAttribute("aria-disabled");
  await update.focus();
  await page.keyboard.press("Enter");
  const toasts = page.locator(".studio-toasts");
  await expect(toasts).toContainText(`${ID.review} is now “Awaiting deposit”`);
  await expect(row.locator(".commissions-status")).toHaveText(
    "Awaiting deposit",
  );
  // The change landed: the selection equals the stored status again.
  await expect(update).toHaveAttribute("aria-disabled", "true");
  await expect(update).toBeFocused();
  expect(statusPosts).toHaveLength(1);

  // Back to the seeded status for the next steps.
  await toasts.locator(".studio-toast", { hasText: "is now" }).hover();
  await toasts.getByRole("button", { name: "Undo" }).click();
  await expect(row.locator(".commissions-status")).toHaveText("Pending review");
});

test("a status change made while another is in flight waits, and both report", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  // Slow every status post down, so the second Update is clicked while the
  // first change is still in flight on the inbox's one status fetcher.
  await page.route("**/studio/commissions/status*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue().catch(() => {});
  });
  const changes = [
    {
      caseId: ID.review,
      next: "pending_deposit",
      label: "Awaiting deposit",
      seeded: "pending_review",
      seededLabel: "Pending review",
    },
    {
      caseId: ID.production,
      next: "preview_approval",
      label: "Preview approval",
      seeded: "in_production",
      seededLabel: "In production",
    },
  ] as const;
  for (const change of changes) {
    const row = caseRow(page, change.caseId);
    await row
      .getByRole("combobox", { name: `Status for ${change.caseId}` })
      .selectOption(change.next);
    await row
      .getByRole("button", { name: `Update status of ${change.caseId}` })
      .click();
  }

  const toasts = page.locator(".studio-toasts");
  for (const change of changes) {
    await expect(
      toasts
        .locator(".studio-toast", {
          hasText: `${change.caseId} is now “${change.label}”`,
        })
        .getByRole("button", { name: "Undo" }),
    ).toBeVisible();
    await expect(
      caseRow(page, change.caseId).locator(".commissions-status"),
    ).toHaveText(change.label);
  }

  // Back to the seeded statuses for the next steps.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  for (const change of changes) {
    const row = caseRow(page, change.caseId);
    await row
      .getByRole("combobox", { name: `Status for ${change.caseId}` })
      .selectOption(change.seeded);
    await row
      .getByRole("button", { name: `Update status of ${change.caseId}` })
      .click();
    await expect(row.locator(".commissions-status")).toHaveText(
      change.seededLabel,
    );
  }
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
  // Both buttons of the confirmation name their case (wp1 §4.10).
  const confirm = item.getByRole("button", {
    name: `Confirm decision for ${ID.student}`,
    exact: true,
  });
  await expect(confirm).toBeFocused();
  await expect(
    item.getByRole("button", {
      name: `Cancel decision for ${ID.student}`,
      exact: true,
    }),
  ).toBeVisible();
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

test("a filter change keeps focus on its select", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const filters = page.getByRole("search", { name: "Filter cases" });
  const status = filters.getByLabel("Status");
  await status.focus();
  await status.selectOption("pending_review");
  await expect(page).toHaveURL(/[?&]status=pending_review/);
  await expect(caseRow(page, ID.production)).toHaveCount(0);
  // The list changed under the same select, which keeps focus.
  await expect(status).toBeFocused();
  await expect(status).toHaveValue("pending_review");

  // Back to the unfiltered list: the select follows the URL.
  await page.goBack();
  await expect(caseRow(page, ID.production)).toBeVisible();
  await expect(status).toHaveValue("");
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

// Last: it removes the seeded cases (afterAll removes them again).
test("a change to a case removed meanwhile moves focus to the list heading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, "/studio/commissions");
  const row = caseRow(page, ID.production);
  await expect(row).toBeVisible();
  // The case disappears behind the page's back (as an orphan cleanup can).
  runLocalD1File("tests/fixtures/commissions-studio-e2e-cleanup.sql");
  await row
    .getByRole("combobox", { name: `Status for ${ID.production}` })
    .selectOption("preview_approval");
  await row
    .getByRole("button", { name: `Update status of ${ID.production}` })
    .click();
  await expect(page.locator(".studio-toasts")).toContainText(
    "This case no longer exists. The list has been refreshed.",
  );
  await expect(row).toHaveCount(0);
  // The reload removed the focused row: focus is on the heading, not <body>.
  await expect(
    page.getByRole("heading", { level: 2, name: "Cases", exact: true }),
  ).toBeFocused();
});
