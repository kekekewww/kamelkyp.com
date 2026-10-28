/**
 * wp7 (plan §9 C3): the Studio leftovers the six specs deferred.
 *
 * Titles carry a per-run token because the local D1 keeps rows between runs.
 * Nothing a run creates stays live: every entry ends archived (drafts never
 * reach the public site), also when a step fails.
 */
import type { Page } from "@playwright/test";
import {
  expect as baseExpect,
  openStudio,
  STUDIO_E2E_ORIGIN,
  test,
} from "./harness";

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

      // Stored as 195 s; the editor shows durations as mm:ss.
      await openStudio(page, editorPath);
      await expect(page.getByRole("textbox", { name: "Duration" })).toHaveValue(
        "03:15",
      );
    } finally {
      await archiveEntry(page, editorPath);
    }
  });

  test("asset detail: a value the browser refuses keeps the dialog usable, then Save and leave saves", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const file = `wp7-leave-${token}.mp3`;
    await openStudio(page, "/studio/media");
    await page.getByRole("button", { name: "Register URL" }).click();
    await page
      .getByRole("textbox", { name: "Address (https://)" })
      .fill(`https://audio.example.com/${file}`);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(page.getByText(`Registered ${file}`)).toBeVisible();
    await page.getByRole("link", { name: file }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: file }),
    ).toBeVisible();
    const detailPath = new URL(page.url()).pathname;
    try {
      // The media form validates natively (no `noValidate`): 12.5 is off the
      // whole-seconds step, so the browser sends nothing, and behind the
      // modal dialog it shows no message either.
      const start = page.getByRole("spinbutton", {
        name: "Preview starts (seconds)",
      });
      await start.fill("12.5");
      await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
      // The breadcrumb back to the library.
      const library = page
        .locator("header")
        .getByRole("link", { name: "Media", exact: true });
      await library.click();
      const dialog = page.getByRole("dialog", {
        name: "Leave without saving?",
      });
      const saveAndLeave = dialog.getByRole("button", {
        name: "Save and leave",
      });
      await saveAndLeave.click();
      await expect(dialog.getByRole("alert")).toHaveText(
        "“Preview starts (seconds)” has a value this form cannot save. Stay to correct it, or discard the changes.",
      );
      // Not stuck on "Saving…": the button can be used again, Stay works.
      await expect(saveAndLeave).not.toHaveAttribute("aria-busy", "true");
      await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
      await dialog.getByRole("button", { name: "Stay" }).click();
      await expect(dialog).toBeHidden();

      await start.fill("12");
      await library.click();
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await saveAndLeave.click();
      await expect(page).toHaveURL(/\/studio\/media$/);
      await expect(dialog).toBeHidden();
      await openStudio(page, detailPath);
      await expect(start).toHaveValue("12");
    } finally {
      // An unused registered URL: delete it, as the media library flow does.
      acceptDialogs(page);
      await openStudio(page, detailPath);
      await page.getByRole("button", { name: "Delete…" }).click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await expect(page).toHaveURL(/\/studio\/media\?deleted=/);
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
    const story = {
      zh: `案例背景 ${token}`,
      en: `Case study context ${token}`,
    };
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
      await section.locator('textarea[name="story.context.zh"]').fill(story.zh);
      await section.locator('textarea[name="story.context.en"]').fill(story.en);
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

      // The preview renders the working copy: in each locale the blocks
      // follow that locale's case study.
      const id = editorPath.split("/").pop();
      for (const [locale, text] of [
        ["zh", zh],
        ["en", en],
      ] as const) {
        await page.goto(`/studio/preview/projects/${id}?locale=${locale}`);
        const body = page.locator(".project-doc__body");
        await expect(body).toContainText(story[locale]);
        await expect(body).toContainText(text);
        const content = await body.innerText();
        expect(content.indexOf(story[locale])).toBeLessThan(
          content.indexOf(text),
        );
      }

      // Live preview while a block is still being written (a link with only
      // its label, which a save refuses): the preview keeps following the
      // rest of the form instead of answering 422.
      await openStudio(page, editorPath);
      await openSection();
      await blocks.getByRole("button", { name: "Link (ZH)" }).click();
      await blocks
        .getByRole("textbox", { name: "Link label" })
        .fill(`label-${token}`);
      const live = `livestory-${token}`;
      const livePost = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes(`/studio/preview/projects/${id}`) &&
          (response.request().postData() ?? "").includes(live),
      );
      await section
        .locator('textarea[name="story.context.zh"]')
        .fill(`${story.zh} ${live}`);
      expect((await livePost).status()).toBe(200);
      const frame = page.frameLocator('iframe[name="studio-preview"]');
      await expect(frame.locator(".project-doc__body")).toContainText(live);
      await expect(frame.locator(".project-doc__body")).toContainText(zh);
    } finally {
      await archiveEntry(page, editorPath);
    }
  });
});

test.describe("C3 d: a failed reorder restores the server order", () => {
  const SOCIAL = "/studio/social";
  const PREFIX = "wp7 social ";
  const first = `${PREFIX}A ${token}`;
  const second = `${PREFIX}B ${token}`;
  const stale = `${PREFIX}stale ${token}`;

  /** Row names in screen order (each row form is labelled "Link: name"). */
  const names = async (page: Page) =>
    (
      await page
        .locator('form[data-social-row][aria-label^="Link: "]')
        .evaluateAll((forms) =>
          forms.map((form) => form.getAttribute("aria-label") ?? ""),
        )
    ).map((name) => name.slice("Link: ".length));

  const row = (page: Page, name: string) =>
    page.locator("li.p3-social__row").filter({
      has: page.locator(`form[aria-label="Link: ${name}"]`),
    });

  /** Adds a hidden link (nothing this spec adds reaches the footer). */
  async function addHiddenLink(page: Page, name: string) {
    const form = page.locator("form.p3-social__form--new");
    await form.locator('select[name="platform"]').selectOption("other");
    await form.locator('input[name="label.zh"]').fill(name);
    await form.locator('input[name="label.en"]').fill(name);
    await form
      .locator('input[name="url"]')
      .fill(`https://example.com/${name.replaceAll(" ", "-")}`);
    await form.getByRole("checkbox", { name: "Show on the site" }).uncheck();
    await form.getByRole("button", { name: "Add link" }).click();
    await expect(page.locator(".studio-toasts")).toContainText(
      `Added “${name}”`,
    );
    await expect(row(page, name)).toHaveCount(1);
  }

  /** Deletes this spec's links (also a failed run's) with the screen's intent. */
  async function deleteSpecLinks(page: Page) {
    await openStudio(page, SOCIAL);
    const csrfToken = await page
      .locator('input[name="csrfToken"]')
      .first()
      .inputValue();
    const ids = await page
      .locator("li.p3-social__row")
      .filter({
        has: page.locator(`form[aria-label^="Link: ${PREFIX}"]`),
      })
      .locator('input[name="id"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
    for (const id of ids) {
      const response = await page.request.post(SOCIAL, {
        headers: { Origin: STUDIO_E2E_ORIGIN },
        form: { csrfToken, intent: "delete", id },
      });
      expect(response.status()).toBe(200);
    }
    await openStudio(page, SOCIAL);
    expect(
      (await names(page)).filter((name) => name.startsWith(PREFIX)),
    ).toEqual([]);
  }

  test("/studio/social: a stale order answers an error toast and the list returns to the server order", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    acceptDialogs(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await deleteSpecLinks(page);
    try {
      await addHiddenLink(page, first);
      await addHiddenLink(page, second);
      await openStudio(page, SOCIAL);
      const recorded = await names(page);
      expect(recorded.slice(-2)).toEqual([first, second]);

      // An unsaved edit in another row survives the restore.
      const draftRow = row(page, second);
      const username = draftRow.locator('input[name="username"]');
      await username.fill(`draft-${token}`);
      const state = draftRow.locator(".p3-social__state");
      await expect(state).toHaveText("Unsaved changes");

      // Another tab adds a link, so this tab's list is stale.
      const other = await context.newPage();
      await other.setViewportSize({ width: 1440, height: 900 });
      await openStudio(other, SOCIAL);
      await addHiddenLink(other, stale);
      await other.close();

      // Moving a link here sends the old list: 409, error toast, and the
      // list back in the server order.
      await row(page, first).getByRole("button", { name: "Move down" }).click();
      await expect(
        page.locator(".studio-toasts .studio-toast--error").filter({
          hasText: "The order changed elsewhere. Reload and try again.",
        }),
      ).toBeVisible();
      await expect
        .poll(async () => (await names(page)).filter((name) => name !== stale))
        .toEqual(recorded);
      // The restore keeps the rows mounted: the unsaved edit is still there.
      await expect(username).toHaveValue(`draft-${token}`);
      await expect(state).toHaveText("Unsaved changes");
      await username.fill("");
      await expect(state).toHaveText("Saved");

      // A fresh page shows the stored order: nothing was written.
      await openStudio(page, SOCIAL);
      expect((await names(page)).filter((name) => name !== stale)).toEqual(
        recorded,
      );
    } finally {
      await deleteSpecLinks(page);
    }
  });
});
