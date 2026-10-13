/**
 * Settings → Footer on the dev-server Studio harness (wp3 spec §6.4). Group
 * names carry a per-run token because the local D1 keeps rows between runs;
 * every group this spec adds is deleted again through the UI (and a failed
 * run's leftovers are deleted at the start of the next one).
 */
import type { Locator, Page } from "@playwright/test";
import { expect, openStudio, test } from "./harness";

const token = Date.now().toString(36);
const NAME = `WP3 e2e ${token}`;
const STALE = `WP3 e2e stale ${token}`;
const ADDRESS = `https://example.com/wp3-${token}`;
const FOOTER = "/studio/settings/footer";

const toasts = (page: Page) => page.locator(".studio-toasts");
const names = (page: Page) =>
  page.locator(".studio-footer__row .studio-footer__name > span:first-child");

function row(page: Page, name: string): Locator {
  return page.locator(".studio-footer__row").filter({
    has: page.locator(".studio-footer__name > span:first-child", {
      hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    }),
  });
}

async function openEditor(group: Locator) {
  const details = group.locator("details.studio-footer__details");
  if ((await details.getAttribute("open")) === null) {
    await group.locator("summary").click();
  }
  await expect(details).toHaveAttribute("open", "");
}

async function deleteGroup(page: Page, group: Locator) {
  await openEditor(group);
  await group.getByRole("button", { name: /^Delete…/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(toasts(page)).toContainText("Deleted “");
}

/** Deletes every group a previous run of this spec left behind. */
async function deleteLeftovers(page: Page) {
  const leftovers = page.locator(".studio-footer__row").filter({
    has: page.locator(".studio-footer__name > span:first-child", {
      hasText: /^WP3 e2e /,
    }),
  });
  while ((await leftovers.count()) > 0) {
    const before = await leftovers.count();
    await deleteGroup(page, leftovers.first());
    await expect(leftovers).toHaveCount(before - 1);
  }
}

async function addGroup(page: Page, zh: string, en: string) {
  const form = page.locator('form[aria-label="New footer group"]');
  await form.locator('input[name="label.zh"]').fill(zh);
  await form.locator('input[name="label.en"]').fill(en);
  await form.getByRole("button", { name: "Add group" }).click();
  await expect(toasts(page)).toContainText(`Added “${en}”`);
  await expect(row(page, en)).toHaveCount(1);
}

async function publicFooterHtml(page: Page): Promise<string> {
  const response = await page.request.get("/en");
  expect(response.status()).toBe(200);
  const html = await response.text();
  return html.slice(html.indexOf('<footer class="site-footer"'));
}

test.describe("footer settings", () => {
  test("adds, edits, hides, moves and deletes a custom group", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, FOOTER);
    await expect(
      page.getByRole("heading", { level: 1, name: "Footer" }),
    ).toBeVisible();

    // 1. Built-in groups in footer order; Legal cannot be hidden.
    const builtIn = ["Navigate", "Services", "Contact", "Legal"];
    const listed = await names(page).allTextContents();
    const positions = builtIn.map((name) => listed.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const legal = row(page, "Legal");
    await expect(legal).toContainText("Always shown");
    await expect(legal.getByRole("switch")).toHaveCount(0);
    await expect(
      row(page, "Find Me").locator('a[href="/studio/social"]'),
    ).toHaveCount(1);

    // 2. Leftovers of an interrupted run.
    await deleteLeftovers(page);

    // 3. A new group goes after Services and before Find Me / Legal.
    await addGroup(page, `頁尾測試 ${token}`, NAME);
    const order = await names(page).allTextContents();
    expect(order.indexOf(NAME)).toBeGreaterThan(order.indexOf("Services"));
    expect(order.indexOf(NAME)).toBeLessThan(order.indexOf("Legal"));
    if (order.includes("Find Me")) {
      expect(order.indexOf(NAME)).toBeLessThan(order.indexOf("Find Me"));
    }

    // 4. A link with a bare host is stored as an https:// address.
    const group = row(page, NAME);
    await openEditor(group);
    await group.getByRole("button", { name: "Add link" }).click();
    await group.getByLabel("Link 1 label ZH", { exact: true }).fill("測試連結");
    await group
      .getByLabel("Link 1 label EN", { exact: true })
      .fill("Test link");
    await group
      .getByLabel("Link 1 address", { exact: true })
      .fill(`example.com/wp3-${token}`);
    const state = group.locator(".studio-footer__state");
    await expect(state).toHaveText("Unsaved changes");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(toasts(page)).toContainText(`Saved “${NAME}”`);
    await expect(
      group.getByLabel("Link 1 address", { exact: true }),
    ).toHaveValue(ADDRESS);
    await expect(state).toHaveText("Saved");

    // 5. Validation: a missing EN label, then a price figure, then a fix.
    const enLabel = group.getByLabel("Link 1 label EN", { exact: true });
    await enLabel.fill("");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(group).toContainText("Label is required in EN.");
    await expect(state).toHaveText("Not saved");
    await enLabel.fill("From NT$4,000");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(group).toContainText(
      "Footer links never show prices. Remove the amount.",
    );
    await expect(state).toHaveText("Not saved");
    await enLabel.fill("Test link");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(state).toHaveText("Saved");
    await expect(group).not.toContainText("Footer links never show prices.");

    // 6. The public footer shows the group between Services and Legal.
    const site = await context.newPage();
    await site.setViewportSize({ width: 1440, height: 900 });
    await site.goto("/en");
    const headings = await site
      .locator(".site-footer__desktop-groups h2")
      .allTextContents();
    expect(headings.indexOf(NAME)).toBeGreaterThan(
      headings.indexOf("Services"),
    );
    expect(headings.indexOf(NAME)).toBeLessThan(headings.indexOf("Legal"));
    await expect(
      site.locator(`.site-footer__desktop-groups a[href="${ADDRESS}"]`),
    ).toHaveCount(1);
    await site.close();

    // 7. Hide (live), check the public footer, then Undo.
    await group.getByRole("switch").click();
    const hidden = toasts(page)
      .locator(".studio-toast")
      .filter({ hasText: `“${NAME}” is hidden` });
    await expect(hidden).toBeVisible();
    await hidden.hover(); // keeps the toast (and its Undo) open
    await expect(group.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(await publicFooterHtml(page)).not.toContain(NAME);
    await hidden.getByRole("button", { name: "Undo" }).click();
    await expect(toasts(page)).toContainText(
      `“${NAME}” is shown in the footer`,
    );
    await expect(group.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await publicFooterHtml(page)).toContain(NAME);

    // 8. Keyboard move up: one request, "Order saved", kept after a reload.
    const before = (await names(page).allTextContents()).indexOf(NAME);
    await group
      .getByRole("button", { name: new RegExp(`^Reorder: ${NAME}`) })
      .focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(toasts(page)).toContainText("Order saved");
    await expect
      .poll(async () => (await names(page).allTextContents()).indexOf(NAME))
      .toBe(before - 1);
    await openStudio(page, FOOTER);
    expect((await names(page).allTextContents()).indexOf(NAME)).toBe(
      before - 1,
    );

    // 9. Delete permanently: gone from the Studio and the public footer.
    await deleteGroup(page, row(page, NAME));
    await expect(row(page, NAME)).toHaveCount(0);
    expect(await publicFooterHtml(page)).not.toContain(NAME);
  });

  test("a failed reorder puts the list back in the server order", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, FOOTER);
    await deleteLeftovers(page);
    await openStudio(page, FOOTER);
    const recorded = await names(page).allTextContents();

    // Another tab adds a group, so this tab's list is stale.
    const other = await context.newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    await openStudio(other, FOOTER);
    await addGroup(other, `過期測試 ${token}`, STALE);
    await other.close();

    // Moving a group here sends the old list: 409, error toast, order restored.
    await row(page, recorded[0] ?? "Navigate")
      .getByRole("button", { name: "Move down" })
      .click();
    await expect(
      toasts(page).locator(".studio-toast--error").filter({
        hasText: "The footer changed elsewhere. Reload and try again.",
      }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (await names(page).allTextContents()).filter((name) => name !== STALE),
      )
      .toEqual(recorded);

    // Clean up through the UI.
    await openStudio(page, FOOTER);
    await deleteGroup(page, row(page, STALE));
    await expect(row(page, STALE)).toHaveCount(0);
  });
});
