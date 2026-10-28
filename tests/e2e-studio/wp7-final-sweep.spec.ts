/**
 * wp7 (plan §9 C3): the Studio leftovers the six specs deferred.
 *
 * Titles carry a per-run token because the local D1 keeps rows between runs.
 * Nothing a run creates stays live: every entry ends archived (drafts never
 * reach the public site), also when a step fails.
 */
import type { Page } from "@playwright/test";
import { expect as baseExpect, openStudio, test } from "./harness";

const token = Date.now().toString(36);
const expect = baseExpect.configure({ timeout: 20_000 });

/** Clean-up leaves a page whose form may still be dirty (beforeunload). */
function acceptDialogs(page: Page) {
  page.on("dialog", (dialog) => {
    dialog.accept().catch(() => {});
  });
}

function topSaveState(page: Page) {
  return page.locator(".studio-topbar .studio-save-state");
}

/** Archives the entry open at `path`, so nothing a run made stays live. */
async function archiveEntry(page: Page, path: string) {
  acceptDialogs(page);
  await openStudio(page, path);
  const archive = page.getByRole("button", { name: "Archive", exact: true });
  if (await archive.isVisible()) {
    await archive.click();
    await expect(
      page.getByRole("button", { name: "Restore to draft" }),
    ).toBeVisible();
  }
}

test.describe("C3 c: Save and leave from an error state", () => {
  test("music editor: a failed save, a fix, then Save and leave lands on the target", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = `wp7 leave ${token}`;
    await openStudio(page, "/studio/music/new");
    await page.getByRole("textbox", { name: /ZH/ }).first().fill(title);
    await page.getByRole("textbox", { name: /EN/ }).first().fill(title);
    await page.getByRole("button", { name: "Create and edit" }).click();
    await expect(page).toHaveURL(/\/studio\/music\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    const editorPath = new URL(page.url()).pathname;
    try {
      // The server refuses a duration that is not minutes:seconds; the
      // client sends it as typed (the form is `noValidate`, no pattern).
      const duration = page.getByRole("textbox", { name: "Duration" });
      await duration.fill("3m15");
      await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(topSaveState(page)).toHaveText("ERROR — RETRY");
      await expect(
        page.getByText("Use minutes:seconds, for example 3:15."),
      ).toBeVisible();

      // The fix keeps the visible ERROR until the next save answers.
      await duration.fill("3:15");
      await expect(topSaveState(page)).toHaveText("ERROR — RETRY");
      await page
        .locator("header")
        .getByRole("link", { name: "Music", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Leave without saving?",
      });
      await dialog.getByRole("button", { name: "Save and leave" }).click();
      await expect(page).toHaveURL(/\/studio\/music$/);
      await expect(dialog).toBeHidden();

      await openStudio(page, editorPath);
      await expect(page.getByRole("textbox", { name: "Duration" })).toHaveValue(
        "3:15",
      );
    } finally {
      await archiveEntry(page, editorPath);
    }
  });
});
