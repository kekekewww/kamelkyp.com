/**
 * Block keys survive hydration: a freshly loaded project editor renders the
 * stored blocks with the same `data-block-key` on the server and in the
 * browser (React does not patch a mismatched attribute while hydrating), so
 * the editor's focus lookup finds the block it means after a move.
 *
 * Titles carry a per-run token because the local D1 keeps rows between runs;
 * the project ends archived, also when a step fails.
 */
import type { Page } from "@playwright/test";
import { expect as baseExpect, openStudio, test } from "./harness";

const token = Date.now().toString(36);
const expect = baseExpect.configure({ timeout: 20_000 });

function topSaveState(page: Page) {
  return page.locator(".studio-topbar .studio-save-state");
}

test("a freshly loaded editor keeps its block keys through moves", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openStudio(page, "/studio/projects/new");
  await page.locator('input[name="title.zh"]').fill("區塊鍵測試");
  const titleEn = page.locator('input[name="title.en"]');
  await expect(async () => {
    await titleEn.fill("");
    await titleEn.pressSequentially(`block keys ${token}`);
    await expect(page.locator('input[name="slug"]')).not.toHaveValue("", {
      timeout: 2_000,
    });
  }).toPass();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
  const editorPath = new URL(page.url()).pathname;
  const texts = ["A", "B", "C"].map((name) => `段落 ${name} ${token}`);
  const section = page.locator("#section-case-study");
  const blocks = section.getByRole("group", {
    name: "Additional content blocks",
  });
  const paragraphs = blocks.getByRole("textbox", { name: "Paragraph" });
  const openSection = async () => {
    if ((await section.getAttribute("open")) === null) {
      await page.locator("#section-case-study > summary").click();
    }
  };
  try {
    await openSection();
    for (const text of texts) {
      await blocks.getByRole("button", { name: "Paragraph (ZH)" }).click();
      await expect(paragraphs.last()).toBeFocused();
      await paragraphs.last().fill(text);
    }
    await page.keyboard.press("ControlOrMeta+s");
    await expect(topSaveState(page)).toHaveText(/^SAVED \d{2}:\d{2}$/);

    // Two fresh loads: the first one renders the blocks on the server once
    // more, as another request in the same isolate would.
    await openStudio(page, editorPath);
    const mismatches: string[] = [];
    page.on("console", (message) => {
      if (/hydrat|didn't match/i.test(message.text())) {
        mismatches.push(message.text());
      }
    });
    await openStudio(page, editorPath);
    await openSection();
    await expect(paragraphs).toHaveCount(3);
    expect(mismatches).toEqual([]);

    // A moved block keeps the focus on its own move button.
    await blocks.getByRole("button", { name: "Move block 1 down" }).click();
    await expect(paragraphs.nth(0)).toHaveValue(texts[1] as string);
    await expect(paragraphs.nth(1)).toHaveValue(texts[0] as string);
    await expect(
      blocks.getByRole("button", { name: "Move block 2 down" }),
    ).toBeFocused();
    await blocks.getByRole("button", { name: "Move block 3 up" }).click();
    await expect(paragraphs.nth(1)).toHaveValue(texts[2] as string);
    await expect(paragraphs.nth(2)).toHaveValue(texts[0] as string);
    await expect(
      blocks.getByRole("button", { name: "Move block 2 up" }),
    ).toBeFocused();

    // An added block is focused, not a loaded block with a colliding key.
    await blocks.getByRole("button", { name: "Paragraph (ZH)" }).click();
    await expect(paragraphs).toHaveCount(4);
    await expect(paragraphs.last()).toBeFocused();
    const keys = await blocks
      .locator("[data-block-key]")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-block-key")),
      );
    expect(new Set(keys).size).toBe(4);
  } finally {
    page.on("dialog", (dialog) => {
      dialog.accept().catch(() => {});
    });
    await openStudio(page, editorPath);
    const archive = page.getByRole("button", { name: "Archive", exact: true });
    if (await archive.isVisible()) {
      await archive.click();
      await expect(
        page.getByRole("button", { name: "Restore to draft" }),
      ).toBeVisible();
    }
  }
});
