/**
 * wp6 (a): Studio feedback for every finished action (brief §28–32,
 * admin-architecture §4.6–4.8) on a slow CPU. Throttling widens the window in
 * which React batches the router's transition updates and can skip the
 * "submitting"/"loading" renders; every handler must still report the result
 * (toast, SAVED hh:mm, "Save and leave"). The skipped-render path itself is
 * pinned deterministically by tests/unit/studio-fetcher-settle.test.ts.
 *
 * Titles carry a per-run token because the local D1 keeps rows between runs;
 * the homepage availability message is restored in a `finally` block because
 * that section goes live immediately.
 */
import type { Page } from "@playwright/test";
import { expect as baseExpect, openStudio, test } from "./harness";

const token = Date.now().toString(36);
const expect = baseExpect.configure({ timeout: 20_000 });

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
}

function toast(page: Page, message: string | RegExp) {
  return page.locator(".studio-toast__message").filter({ hasText: message });
}

function topSaveState(page: Page) {
  return page.locator(".studio-topbar .studio-save-state");
}

async function quickCreateMusic(page: Page, title: string) {
  await page.getByRole("textbox", { name: /ZH/ }).first().fill(title);
  await page.getByRole("textbox", { name: /EN/ }).first().fill(title);
  await page.getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/\/studio\/music\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

test.describe("studio feedback on a slow CPU", () => {
  // Every step runs at a sixth of the CPU against the dev server, which
  // serves unbundled modules: a flow takes one to two minutes.
  test.setTimeout(240_000);

  test("music editor: publish, save and placement report their result", async ({
    page,
  }) => {
    const title = `P6 music ${token}`;
    await openStudio(page, "/studio/music/new");
    await throttle(page);
    await quickCreateMusic(page, title);

    // A change first, so SAVED can only come from this submission.
    await page.locator('input[name="role.en"]').fill("Mixing");
    await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
    await page.getByRole("button", { name: "Publish" }).first().click();
    await expect(
      toast(page, "Saved as a draft. Fix the checklist"),
    ).toBeVisible();
    await expect(topSaveState(page)).toHaveText(/^SAVED \d{2}:\d{2}$/);

    await page.locator("#section-links > summary").click();
    await page
      .getByRole("textbox", { name: "YouTube" })
      .fill("https://www.youtube.com/watch?v=p6Feedback");
    await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(topSaveState(page)).toHaveText(/^SAVED \d{2}:\d{2}$/);

    await page.getByRole("button", { name: "Publish" }).first().click();
    await expect(toast(page, /^Published$/)).toBeVisible();

    await page.getByRole("button", { name: "Make homepage showreel" }).click();
    await expect(toast(page, /^Homepage updated$/)).toBeVisible();
    // Leave the showreel as it was, so later runs and specs do not depend on it.
    await page
      .getByRole("button", { name: "Remove from homepage showreel" })
      .click();
    await expect(
      page.getByRole("button", { name: "Make homepage showreel" }),
    ).toBeVisible();
  });

  test("media: register, archive, restore, save and rebuild report their result", async ({
    page,
  }) => {
    const file = `p6-${token}.jpg`;
    await openStudio(page, "/studio/media");
    await throttle(page);

    await page.getByRole("button", { name: "Register URL" }).click();
    const address = page.getByRole("textbox", { name: "Address (https://)" });
    await address.fill(`https://images.example.com/${file}`);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(toast(page, `Registered ${file}`)).toBeVisible();
    // Only the settled handler resets the form; the panel stays open for the
    // next address (`onDone` revalidates the list).
    await expect(address).toHaveValue("");

    await page.getByRole("link", { name: file }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: file }),
    ).toBeVisible();

    // The message follows the action, not the revalidated asset.
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(toast(page, /^Archived$/)).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(toast(page, /^Restored$/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archive", exact: true }),
    ).toBeVisible();

    await page.getByRole("textbox", { name: /EN/ }).nth(1).fill("P6 image");
    await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(toast(page, /^Saved$/)).toBeVisible();
    await expect(topSaveState(page)).toHaveText(/^SAVED \d{2}:\d{2}$/);

    // Clean up, then rebuild the usage index from the library.
    await page.getByRole("button", { name: "Delete…" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/studio\/media\?deleted=/);
    await page.getByRole("button", { name: "Rebuild usage index" }).click();
    await expect(toast(page, /^Usage index rebuilt: /)).toBeVisible();
  });

  test("project: Save and leave saves, then leaves", async ({ page }) => {
    await openStudio(page, "/studio/projects/new");
    await throttle(page);
    await page.locator('input[name="title.zh"]').fill("回饋測試");
    const titleEn = page.locator('input[name="title.en"]');
    // The slug follows the EN title once the page is interactive.
    await expect(async () => {
      await titleEn.fill("");
      await titleEn.pressSequentially(`P6 Leave ${token}`);
      await expect(page.locator('input[name="slug"]')).not.toHaveValue("", {
        timeout: 2_000,
      });
    }).toPass();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
    await expect(topSaveState(page)).toHaveText(/SAVED|NO CHANGES/);
    const editorUrl = page.url();

    const role = `Sound ${token}`;
    await page.locator('input[name="role.en"]').fill(role);
    await expect(topSaveState(page)).toHaveText("UNSAVED CHANGES");
    await page
      .locator("header")
      .getByRole("link", { name: "Projects" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await dialog.getByRole("button", { name: "Save and leave" }).click();
    // The guard proceeds once the save settles; the list route's modules
    // then load at a sixth of the CPU, which can take longer than 20 s.
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/studio\/projects$/, { timeout: 90_000 });

    await openStudio(page, new URL(editorUrl).pathname);
    await expect(page.locator('input[name="role.en"]')).toHaveValue(role);
  });

  test("homepage section: saving reaches SAVED", async ({ page }) => {
    await openStudio(page, "/studio/homepage");
    await throttle(page);
    const form = page.locator('form[data-section-form="availability"]');
    const message = form.locator('input[name="availability.message.en"]');
    const state = form.locator(
      ".studio-homepage-form__save .studio-save-state",
    );
    const save = form.getByRole("button", { name: "Save availability" });
    const original = await message.inputValue();
    try {
      await message.fill(`P6 availability ${token}`);
      await expect(state).toHaveText("UNSAVED CHANGES");
      await save.click();
      await expect(state).toHaveText(/^SAVED \d{2}:\d{2}$/);
    } finally {
      // The section goes live immediately: never leave the token behind.
      await expect(state).not.toHaveText("SAVING…");
      await message.fill(original);
      if ((await state.textContent()) === "UNSAVED CHANGES") {
        await save.click();
        await expect(state).toHaveText(/^SAVED \d{2}:\d{2}$/);
      }
    }
    await expect(message).toHaveValue(original);
  });

  test("localized fields keep their spacing and locale grid", async ({
    page,
  }) => {
    const layout = () =>
      page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.setProperty("margin-top", "var(--space-5)");
        probe.style.setProperty("padding-right", "var(--space-4)");
        document.body.appendChild(probe);
        const { marginTop: space5, paddingRight: space4 } =
          getComputedStyle(probe);
        probe.remove();
        const fieldsets = Array.from(
          document.querySelectorAll("fieldset.studio-localized"),
        ).map((element) => {
          const previous = element.previousElementSibling;
          return {
            after: previous?.matches(".studio-field")
              ? "field"
              : previous?.matches(".studio-localized")
                ? "localized"
                : "other",
            marginTop: getComputedStyle(element).marginTop,
            marginBottom: getComputedStyle(element).marginBottom,
            display: getComputedStyle(element).display,
          };
        });
        const pairs = Array.from(
          document.querySelectorAll(".studio-localized__pair"),
        ).map((pair) => {
          const [first, second] = Array.from(pair.children).map((child) =>
            getComputedStyle(child),
          );
          return {
            display: [first?.display, second?.display],
            firstPaddingRight: first?.paddingRight,
            secondBorderLeft: second?.borderLeftStyle,
          };
        });
        return { space5, space4, fieldsets, pairs };
      });

    await openStudio(page, "/studio/music/new");
    await throttle(page);
    await quickCreateMusic(page, `P6 layout ${token}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    const music = await layout();
    expect(music.fieldsets.length).toBeGreaterThan(2);
    const stacked = music.fieldsets.filter((entry) => entry.after !== "other");
    expect(stacked.length).toBeGreaterThan(0);
    for (const entry of stacked) expect(entry.marginTop).toBe(music.space5);
    for (const entry of music.fieldsets) {
      expect(entry.display).toBe("grid");
      expect(entry.marginBottom).toBe("0px");
      if (entry.after === "other") expect(entry.marginTop).toBe("0px");
    }
    expect(music.pairs.length).toBeGreaterThan(0);
    for (const pair of music.pairs) {
      expect(pair.display).toEqual(["grid", "grid"]);
      expect(pair.firstPaddingRight).toBe(music.space4);
      expect(pair.secondBorderLeft).toBe("solid");
    }

    // A localized field directly after a plain field (Availability).
    await openStudio(page, "/studio/homepage");
    const home = await layout();
    const afterField = home.fieldsets.filter(
      (entry) => entry.after === "field",
    );
    expect(afterField.length).toBeGreaterThan(0);
    for (const entry of afterField) {
      expect(entry.marginTop).not.toBe("0px");
      expect(entry.marginTop).toBe(home.space5);
    }
  });
});
