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

test.describe("C3 e: project body blocks", () => {
  test("adds a ZH and an EN paragraph, saves, and the preview shows them after the case study", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openStudio(page, "/studio/projects/new");
    await page.locator('input[name="title.zh"]').fill("區塊測試");
    const titleEn = page.locator('input[name="title.en"]');
    // The slug follows the EN title once the page is interactive.
    await expect(async () => {
      await titleEn.fill("");
      await titleEn.pressSequentially(`wp7 blocks ${token}`);
      await expect(page.locator('input[name="slug"]')).not.toHaveValue("", {
        timeout: 2_000,
      });
    }).toPass();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
    await expect(topSaveState(page)).toHaveText(/SAVED|NO CHANGES/);
    const editorPath = new URL(page.url()).pathname;
    const story = `案例背景 ${token}`;
    const zh = `案例之後的段落 ${token}`;
    const en = `A paragraph after the case study ${token}`;
    try {
      const section = page.locator("#section-case-study");
      const openSection = async () => {
        if ((await section.getAttribute("open")) === null) {
          await page.locator("#section-case-study > summary").click();
        }
      };
      await openSection();
      await section.locator('textarea[name="story.context.zh"]').fill(story);
      const blocks = section.getByRole("group", {
        name: "Additional content blocks",
      });
      await expect(blocks).toContainText(
        "Shown after the case study on the public page.",
      );
      await blocks.getByRole("button", { name: "Paragraph (ZH)" }).click();
      await blocks.getByRole("textbox", { name: "Paragraph" }).fill(zh);
      await blocks.getByRole("tab", { name: /^EN/ }).click();
      await blocks.getByRole("button", { name: "Paragraph (EN)" }).click();
      await blocks.getByRole("textbox", { name: "Paragraph" }).fill(en);
      await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
      await page.keyboard.press("ControlOrMeta+s");
      await expect(topSaveState(page)).toHaveText(/^SAVED \d{2}:\d{2}$/);

      // A fresh page starts from the stored blocks.
      await openStudio(page, editorPath);
      await openSection();
      await expect(
        blocks.getByRole("tab", { name: /^ZH · 1 block$/ }),
      ).toBeVisible();
      await expect(
        blocks.getByRole("textbox", { name: "Paragraph" }),
      ).toHaveValue(zh);
      await blocks.getByRole("tab", { name: /^EN/ }).click();
      await expect(
        blocks.getByRole("textbox", { name: "Paragraph" }),
      ).toHaveValue(en);

      // The preview renders the working copy: the blocks follow the story.
      const id = editorPath.split("/").pop();
      for (const [locale, text] of [
        ["zh", zh],
        ["en", en],
      ] as const) {
        await page.goto(`/studio/preview/projects/${id}?locale=${locale}`);
        const body = page.locator(".project-doc__body");
        await expect(body).toContainText(text);
        if (locale === "zh") {
          const content = await body.innerText();
          expect(content.indexOf(story)).toBeGreaterThanOrEqual(0);
          expect(content.indexOf(story)).toBeLessThan(content.indexOf(text));
        }
      }
    } finally {
      await archiveEntry(page, editorPath);
    }
  });
});
