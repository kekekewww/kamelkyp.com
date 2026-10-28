/**
 * WP2 Pricing and Terms on the dev-server Studio harness (wp2 §6.4).
 *
 * The harness uses the developer's persistent local D1, which the owner may
 * also edit by hand, so this spec asserts consistency rather than seed
 * figures (the exact figures are asserted on fresh databases by the unit,
 * worker and loopback suites). It never clicks "Refresh now" (the harness
 * FX_API_URL is a real upstream).
 *
 * Side effect, by design: step 3 publishes one immutable price version per
 * run for Full Song Mixing, always at the fixed instant 2099-01-01 00:00
 * Taipei with the values of the active rule at run time. Reruns become
 * `replace` rows of that single scheduled group, which is never active
 * before 2099. Nothing else is published: the term draft is discarded.
 */
import type { Page } from "@playwright/test";
import { calculateQuote } from "../../app/lib/pricing/calculate-quote";
import { percentInputToBps } from "../../app/lib/pricing/percent";
import { expect, openStudio, test } from "./harness";

const token = Date.now().toString(36);
const PRICING_EDITOR = "/studio/services/pricing/full_mix";

function formatTwd(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

async function readPriceForm(page: Page) {
  const value = (name: string) =>
    page.locator(`input[name="${name}"]`).inputValue();
  return {
    base: await value("baseTwd:number"),
    student: await value("studentDiscountPercent"),
    rush: await value("rushPercent"),
    sourcePrep: await value("sourcePrepPercent"),
    versionId: await page
      .locator('input[name="basedOnVersionId"]')
      .inputValue(),
  };
}

test.describe("pricing", () => {
  test("index, editor checks, guard and a scheduled version with unchanged values", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Pricing index.
    await openStudio(page, "/studio/services/pricing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Pricing" }),
    ).toBeVisible();
    const rows = page.locator(".studio-pricing-row");
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) {
      await expect(row.locator(".studio-pricing-row__figure")).toContainText(
        "NT$",
      );
      await expect(row.locator(".studio-pricing-row__meta code")).toHaveCount(
        1,
      );
    }
    await expect(page.locator(".studio-readiness caption")).toHaveText(
      "Commission form availability",
    );
    await expect(page.locator(".studio-fx")).toBeVisible();
    const indexFigure = await page
      .locator(
        ".studio-pricing-row:has(#pricing-full_mix) .studio-pricing-row__figure",
      )
      .innerText();

    // 2. Editor checks; nothing is published.
    await openStudio(page, PRICING_EDITOR);
    const recorded = await readPriceForm(page);
    expect(indexFigure.trim()).toBe(formatTwd(Number(recorded.base)));
    await expect(
      page.locator('input[name="perSongAfterFiveTwd:number"]'),
    ).toHaveCount(0);
    await expect(page.locator('input[name="consultationPercent"]')).toHaveCount(
      0,
    );

    const quote = calculateQuote(
      {
        versionId: recorded.versionId,
        serviceId: "full_mix",
        baseTwd: Number(recorded.base),
        includedSongs: 0,
        perSongAfterIncludedTwd: 0,
        studentDiscountBps: percentInputToBps(recorded.student) ?? 0,
        rushBps: percentInputToBps(recorded.rush) ?? 0,
        consultationBps: 0,
        sourcePrepBps: percentInputToBps(recorded.sourcePrep) ?? 0,
      },
      {
        serviceId: "full_mix",
        rush: true,
        consultation: false,
        sourcePrep: true,
        studentRequested: true,
      },
    );
    const sample = page
      .locator(".studio-quote-check__table tr")
      .filter({ hasText: "Base + rush + source prep + student" });
    await expect(sample.locator("td").nth(1)).toHaveText(
      formatTwd(quote.lockedInitialTwd),
    );

    // Mod+S submits nothing on the pricing editor.
    const posts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/studio/services/pricing/full_mix")
      ) {
        posts.push(request.url());
      }
    });
    const base = page.locator('input[name="baseTwd:number"]');
    await base.fill(String(Number(recorded.base) + 1));
    await page.keyboard.press("ControlOrMeta+s");
    await page.waitForTimeout(1000);
    expect(posts).toEqual([]);
    await expect(page.locator(".studio-toast")).toHaveCount(0);

    // The leave guard offers Stay or Discard, never "Save and leave".
    await page
      .locator(".studio-topbar__crumb")
      .getByRole("link", { name: "Pricing" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Save and leave" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${PRICING_EDITOR}$`));
    await expect(base).toHaveValue(String(Number(recorded.base) + 1));
    await base.fill(recorded.base);

    // Unchanged values cannot be published now.
    const form = page.locator(".studio-price-form");
    await form.getByRole("button", { name: "Publish now" }).click();
    await expect(form.locator(".studio-field__error")).toContainText(
      "Nothing changed",
    );

    // A past schedule is refused.
    await page.getByLabel("At a scheduled time").check();
    await page
      .getByLabel("Date and time (Taipei, UTC+8)")
      .fill("2020-01-01T00:00");
    await form
      .getByRole("button", { name: "Schedule for 2020-01-01 00:00" })
      .click();
    await expect(form.locator(".studio-field__error")).toContainText(
      "at least 5 minutes from now",
    );

    // 3. Schedule at the fixed 2099 instant with the active values.
    const when = page.getByLabel("Date and time (Taipei, UTC+8)");
    await when.fill("2099-01-01T00:00");
    await expect(base).toHaveValue(recorded.base);

    // Enter in a field never publishes: only a click does (R18). Safe even
    // if it did: this form holds the allowed 2099 schedule.
    const postsBeforeEnter = posts.length;
    await base.press("Enter");
    await when.press("Enter");
    await page.waitForTimeout(1000);
    expect(posts.length).toBe(postsBeforeEnter);

    await form
      .getByRole("button", { name: "Schedule for 2099-01-01 00:00" })
      .click();
    await expect(page.locator(".studio-toast__message").last()).toHaveText(
      /^Scheduled for 2099-01-01 00:00/,
    );
    const history = page.locator(".studio-price-history");
    await expect(
      history
        .locator("tbody tr")
        .filter({ hasText: "2099-01-01 00:00" })
        .filter({ has: page.locator(".studio-price-state__badge--scheduled") }),
    ).toHaveCount(1);
    await expect(
      history
        .locator("tbody tr")
        .filter({ has: page.locator(".studio-price-state__badge--active") }),
    ).toContainText(recorded.versionId);
    await expect(page.locator('input[name="basedOnVersionId"]')).toHaveValue(
      recorded.versionId,
    );

    // 4. Nothing below is sent: any cancel request is aborted, so a
    // regression fails here instead of cancelling the 2099 change.
    await page.route("**/studio/services/pricing/full_mix**", (route) =>
      route.request().method() === "POST" &&
      (route.request().postData() ?? "").includes("cancel-scheduled")
        ? route.abort()
        : route.continue(),
    );

    // An earlier schedule warns that the 2099 change still follows.
    await page.getByLabel("At a scheduled time").check();
    await when.fill("2098-12-31T00:00");
    await expect(page.locator(".studio-quote-check")).toContainText(
      "from 2099-01-01 00:00) will still take effect after this one.",
    );

    // Cancelling a scheduled change asks first while the form has edits.
    await base.fill(String(Number(recorded.base) + 1));
    const scheduledRow = history
      .locator("tbody tr")
      .filter({ hasText: "2099-01-01 00:00" })
      .filter({ has: page.locator(".studio-price-state__badge--scheduled") });
    const postsBeforeCancel = posts.length;
    await scheduledRow
      .getByRole("button", { name: /^Cancel scheduled change/ })
      .click();
    const cancelDialog = page.getByRole("dialog", {
      name: "Cancel the scheduled change?",
    });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(cancelDialog).toBeHidden();
    await page.waitForTimeout(500);
    expect(posts.length).toBe(postsBeforeCancel);
    await expect(base).toHaveValue(String(Number(recorded.base) + 1));
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

const TERMS_INDEX = "/studio/services/terms";
const PRIVACY_EN = "/studio/services/terms/privacy/en";

function privacyEnCell(page: Page) {
  return page
    .locator(".studio-terms-table tbody tr")
    .filter({ hasText: "Privacy notice" })
    .locator("td")
    .nth(1);
}

async function livePart(page: Page): Promise<string> {
  return privacyEnCell(page)
    .locator(".studio-terms-cell__live, .studio-terms-cell__none")
    .innerText();
}

async function discardDraftIfAny(page: Page) {
  if (
    (await page
      .locator(".studio-topbar")
      .getByText("DRAFT", { exact: true })
      .count()) === 0
  )
    return;
  await page.locator(".studio-danger__summary").click();
  await page
    .locator(".studio-danger")
    .getByRole("button", { name: "Discard draft" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Discard this draft?" });
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(
    page.locator(".studio-topbar").getByText("DRAFT", { exact: true }),
  ).toHaveCount(0);
}

test.describe("terms", () => {
  test("draft lifecycle: save, reload, legal gate, preview, discard; nothing is published", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, PRIVACY_EN);
    await discardDraftIfAny(page);

    await openStudio(page, TERMS_INDEX);
    const before = await livePart(page);

    await openStudio(page, PRIVACY_EN);
    const rows = page.locator(".studio-list-editor__row");
    const count = await rows.count();
    await page.getByRole("button", { name: "Add clause" }).click();
    await expect(rows).toHaveCount(count + 1);
    const key = `wp2_e2e_${token}`;
    const title = `WP2 e2e clause ${token}`;
    await page.locator(`input[name="clauses.${count}.key"]`).fill(key);
    await page.locator(`input[name="clauses.${count}.title"]`).fill(title);
    await page
      .locator(`textarea[name="clauses.${count}.text"]`)
      .fill("Draft text written by the end-to-end test.");
    const saveState = page.locator(".studio-topbar .studio-save-state");
    await expect(saveState).toHaveText("UNSAVED CHANGES");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(saveState).toHaveText(/SAVED \d\d:\d\d/);

    // The draft is stored on the server.
    await page.reload();
    await expect(page.locator(`input[value="${key}"]`)).toHaveCount(1);
    await openStudio(page, TERMS_INDEX);
    await expect(privacyEnCell(page)).toContainText("Draft · edited");

    // The legal checkbox is not form content.
    await openStudio(page, PRIVACY_EN);
    const legal = page.getByLabel(
      "A qualified legal professional has reviewed this version.",
    );
    await expect(legal).not.toBeChecked();
    await legal.check();
    await legal.uncheck();
    await expect(saveState).toHaveText(/SAVED \d\d:\d\d|NO CHANGES/);

    // Publish without the checkbox: nothing is sent, the checkbox is focused.
    await page
      .locator(".studio-topbar")
      .getByRole("button", { name: "Publish EN version" })
      .click();
    await expect(legal).toBeFocused();
    await expect(
      page.locator(".studio-legal-review .studio-field__error"),
    ).toBeVisible();
    await openStudio(page, TERMS_INDEX);
    expect(await livePart(page)).toBe(before);

    // Preview changes: the real page with the draft, under the PREVIEW bar.
    await openStudio(page, PRIVACY_EN);
    await page.getByRole("button", { name: "Preview changes" }).click();
    const frame = page.frameLocator('iframe[name="studio-preview"]');
    await expect(frame.locator(".preview-bar")).toBeVisible();
    await expect(frame.getByRole("heading", { name: title })).toBeVisible();

    // Discard needs a confirmation.
    await discardDraftIfAny(page);
    await openStudio(page, TERMS_INDEX);
    await expect(privacyEnCell(page)).not.toContainText("Draft · edited");
    expect(await livePart(page)).toBe(before);
  });

  test("outline marks and field errors follow the rows on screen; nothing is saved", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, "/studio/services/terms/common/zh");
    await page.locator(".studio-term-start__summary").click();
    await page.getByRole("button", { name: "Start blank" }).click();
    const rows = page.locator(".studio-list-editor__row");
    await expect(rows).toHaveCount(0);
    const deposit = page
      .locator(".studio-term-outline__item")
      .filter({ has: page.locator("code", { hasText: /^deposit$/ }) });
    await expect(deposit.locator(".studio-term-outline__mark")).toHaveText(
      "missing",
    );

    // A typed key counts at once, before any save.
    const add = page.getByRole("button", { name: "Add clause" });
    await add.click();
    await page.locator('input[name="clauses.0.key"]').fill("deposit");
    await expect(deposit.locator(".studio-term-outline__mark")).toHaveText(
      "present",
    );

    // An empty row before a malformed key: the error lands on the bad row.
    await add.click();
    await add.click();
    await expect(rows).toHaveCount(3);
    const badKey = page.locator('input[name="clauses.2.key"]');
    await badKey.fill("Bad Key");
    await page
      .locator(".studio-topbar")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(badKey).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.locator('input[name="clauses.1.key"]'),
    ).not.toHaveAttribute("aria-invalid", "true");

    await page
      .locator(".studio-topbar__crumb")
      .getByRole("link", { name: "Terms" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(new RegExp(`${TERMS_INDEX}$`));
  });

  test("a stale save shows Reload latest, which clears the banner", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, PRIVACY_EN);
    await discardDraftIfAny(page);
    const other = await context.newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    await openStudio(other, PRIVACY_EN);

    const addClause = async (target: Page, key: string) => {
      const rows = target.locator(".studio-list-editor__row");
      const count = await rows.count();
      await target.getByRole("button", { name: "Add clause" }).click();
      await target.locator(`input[name="clauses.${count}.key"]`).fill(key);
      await target
        .locator(`input[name="clauses.${count}.title"]`)
        .fill(`Title ${key}`);
      await target
        .locator(`textarea[name="clauses.${count}.text"]`)
        .fill("Draft text written by the end-to-end test.");
    };

    // This tab saves first; the other tab's save is then stale.
    await addClause(page, `stale_a_${token}`);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
      /SAVED \d\d:\d\d/,
    );
    await addClause(other, `stale_b_${token}`);
    await other.keyboard.press("ControlOrMeta+s");
    const banner = other
      .locator(".studio-kit-banner")
      .filter({ hasText: "Your edits are not saved." });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Reload latest" }).click();
    await expect(other.locator(`input[value="stale_a_${token}"]`)).toHaveCount(
      1,
    );
    await expect(banner).toHaveCount(0);
    await other.close();

    await openStudio(page, PRIVACY_EN);
    await discardDraftIfAny(page);
  });

  test("the leave guard covers typed edits and list changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, PRIVACY_EN);
    const rows = page.locator(".studio-list-editor__row");
    const crumb = page
      .locator(".studio-topbar__crumb")
      .getByRole("link", { name: "Terms" });
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });

    // (a) A typed edit: Stay keeps the value.
    const count = await rows.count();
    await page.getByRole("button", { name: "Add clause" }).click();
    const titleInput = page.locator(`input[name="clauses.${count}.title"]`);
    await titleInput.fill(`Guard ${token}`);
    await crumb.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(titleInput).toHaveValue(`Guard ${token}`);
    await crumb.click();
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(new RegExp(`${TERMS_INDEX}$`));

    // (b) Adding a clause without typing also guards the page.
    await openStudio(page, PRIVACY_EN);
    await page.getByRole("button", { name: "Add clause" }).click();
    await crumb.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(new RegExp(`${TERMS_INDEX}$`));
  });
});

test("a local backup restores added clauses", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, PRIVACY_EN);
  const banner = page
    .locator(".studio-kit-banner")
    .filter({ hasText: "Unsaved changes from" });
  if ((await banner.count()) > 0) {
    await banner.getByRole("button", { name: "Discard" }).click();
  }
  const rows = page.locator(".studio-list-editor__row");
  const count = await rows.count();
  await page.getByRole("button", { name: "Add clause" }).click();
  await expect(rows).toHaveCount(count + 1);
  // Backups are written at most every 2 s while the form is dirty.
  await page.waitForTimeout(2100);
  const key = `restore_${token}`;
  await page.locator(`input[name="clauses.${count}.key"]`).fill(key);

  await page
    .locator(".studio-topbar__crumb")
    .getByRole("link", { name: "Terms" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(new RegExp(`${TERMS_INDEX}$`));

  await openStudio(page, PRIVACY_EN);
  await expect(rows).toHaveCount(count);
  await banner.getByRole("button", { name: "Restore" }).click();
  await expect(rows).toHaveCount(count + 1);
  await expect(page.locator(`input[name="clauses.${count}.key"]`)).toHaveValue(
    key,
  );
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    "UNSAVED CHANGES",
  );
  // The checkbox is never restored.
  await expect(
    page.getByLabel(
      "A qualified legal professional has reviewed this version.",
    ),
  ).not.toBeChecked();
});
