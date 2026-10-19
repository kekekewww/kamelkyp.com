/**
 * Settings → Footer on the dev-server Studio harness (wp3 spec §6.4). Group
 * names carry a per-run token because the local D1 keeps rows between runs;
 * every group this spec adds is deleted again (through the UI, or with the
 * screen's own delete intent when there are many), and a failed run's
 * leftovers are deleted at the start of the next one.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, openStudio, STUDIO_E2E_ORIGIN, test } from "./harness";

const token = Date.now().toString(36);
const NAME = `WP3 e2e ${token}`;
const STALE = `WP3 e2e stale ${token}`;
const CAP = `WP3 e2e cap ${token}`;
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

async function addGroup(page: Page, zh: string, en: string) {
  const form = page.locator('form[aria-label="New footer group"]');
  await form.locator('input[name="label.zh"]').fill(zh);
  await form.locator('input[name="label.en"]').fill(en);
  await form.getByRole("button", { name: "Add group" }).click();
  await expect(toasts(page)).toContainText(`Added “${en}”`);
  await expect(row(page, en)).toHaveCount(1);
}

/** Posts one footer intent as the screen's forms do (CSRF token, same origin). */
async function postFooter(page: Page, fields: Record<string, string>) {
  const csrfToken = await page
    .locator('input[name="csrfToken"]')
    .first()
    .inputValue();
  const response = await page.request.post(FOOTER, {
    headers: { Origin: STUDIO_E2E_ORIGIN },
    form: { csrfToken, ...fields },
  });
  expect(response.status()).toBe(200);
}

/**
 * Deletes the groups whose name matches with the screen's own delete intent
 * (a failed run can leave many), then reloads the screen.
 */
async function deleteNamed(page: Page, name: RegExp) {
  const named = page.locator(".studio-footer__row").filter({
    has: page.locator(".studio-footer__name > span:first-child", {
      hasText: name,
    }),
  });
  const ids = await named
    .locator('input[name="id"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  for (const id of ids) {
    await postFooter(page, { intent: "delete-group", id });
  }
  await openStudio(page, FOOTER);
  await expect(named).toHaveCount(0);
}

/** Deletes every group a previous run of this spec left behind. */
const deleteLeftovers = (page: Page) => deleteNamed(page, /^WP3 e2e /);

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

    // 4b. A save that normalizes to the stored values is still a clean save:
    // the field shows the stored address and nothing is left unsaved.
    await group
      .getByLabel("Link 1 address", { exact: true })
      .fill(`example.com/wp3-${token}`);
    await expect(state).toHaveText("Unsaved changes");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(state).toHaveText("Saved");
    await expect(
      group.getByLabel("Link 1 address", { exact: true }),
    ).toHaveValue(ADDRESS);

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

    // 5b. A link error stays with its link when links move or go: a second
    // link with an address the footer refuses, then moved above the first.
    await group.getByRole("button", { name: "Add link" }).click();
    await group.getByLabel("Link 2 label ZH", { exact: true }).fill("第二連結");
    await group
      .getByLabel("Link 2 label EN", { exact: true })
      .fill("Second link");
    await group
      .getByLabel("Link 2 address", { exact: true })
      .fill("ftp://example.com/refused");
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(state).toHaveText("Not saved");
    const firstAddress = group.getByLabel("Link 1 address", { exact: true });
    const secondAddress = group.getByLabel("Link 2 address", { exact: true });
    await expect(secondAddress).toHaveAttribute("aria-invalid", "true");
    await expect(firstAddress).not.toHaveAttribute("aria-invalid");
    await group.getByRole("button", { name: "Move link 2 up" }).click();
    await expect(firstAddress).toHaveValue("ftp://example.com/refused");
    await expect(firstAddress).toHaveAttribute("aria-invalid", "true");
    await expect(secondAddress).toHaveValue(ADDRESS);
    await expect(secondAddress).not.toHaveAttribute("aria-invalid");
    await group.getByRole("button", { name: "Remove link 1" }).click();
    await expect(firstAddress).toHaveValue(ADDRESS);
    await expect(group.locator('[aria-invalid="true"]')).toHaveCount(0);
    await group.getByRole("button", { name: "Save group" }).click();
    await expect(state).toHaveText("Saved");

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

    // An unsaved edit in an open editor of another group.
    const legal = row(page, "Legal");
    await openEditor(legal);
    const legalLabel = legal.locator('input[name="label.en"]');
    const storedLabel = await legalLabel.inputValue();
    const draft = `Legal draft ${token}`;
    await legalLabel.fill(draft);
    const legalState = legal.locator(".studio-footer__state");
    await expect(legalState).toHaveText("Unsaved changes");

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

    // Restoring the order keeps the open editor and its unsaved edit.
    await expect(
      legal.locator("details.studio-footer__details"),
    ).toHaveAttribute("open", "");
    await expect(legalLabel).toHaveValue(draft);
    await expect(legalState).toHaveText("Unsaved changes");
    await legalLabel.fill(storedLabel);
    await expect(legalState).toHaveText("Saved");

    // Clean up through the UI.
    await openStudio(page, FOOTER);
    await deleteGroup(page, row(page, STALE));
    await expect(row(page, STALE)).toHaveCount(0);
  });

  test("the add form that comes back under the 20-group cap starts clean", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, FOOTER);
    await deleteLeftovers(page);
    await openStudio(page, FOOTER);

    // Fill the footer up to 20 custom groups with the screen's own intent.
    const custom = page.locator(".studio-footer__row").filter({
      has: page.locator(".studio-footer__kind", { hasText: /^Custom links/ }),
    });
    const missing = 20 - (await custom.count());
    expect(missing).toBeGreaterThan(0);
    for (let index = 0; index < missing; index += 1) {
      await postFooter(page, {
        intent: "save-group",
        "label.zh": `上限 ${token} ${index}`,
        "label.en": `${CAP} ${index}`,
      });
    }
    await openStudio(page, FOOTER);
    const add = page.locator("section.studio-footer__add");
    await expect(add).toContainText(
      "The footer holds at most 20 custom groups.",
    );
    await expect(add.locator("form")).toHaveCount(0);

    // Deleting one brings the form back. Typing and clearing it again
    // leaves nothing unsaved, so leaving the screen asks nothing.
    await deleteGroup(page, row(page, `${CAP} 0`));
    const form = page.locator('form[aria-label="New footer group"]');
    await expect(form).toBeVisible();
    const zh = form.locator('input[name="label.zh"]');
    await zh.fill("暫時");
    await zh.fill("");
    await page
      .locator('nav[aria-label="Studio sections"]')
      .getByRole("link", { name: "Social links" })
      .click();
    await expect(page).toHaveURL(/\/studio\/social$/);
    await expect(
      page.getByRole("dialog", { name: "Leave without saving?" }),
    ).toHaveCount(0);

    // Clean up: delete the rest with the screen's own intent.
    await openStudio(page, FOOTER);
    await deleteNamed(page, new RegExp(`^${CAP} `));
  });
});
