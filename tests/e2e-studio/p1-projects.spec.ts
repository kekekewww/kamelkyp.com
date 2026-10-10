/**
 * P1 Projects acceptance (content-architecture §9, brief §6–8, §23–25) on the
 * dev-server Studio harness. Titles carry a per-run token because the local
 * D1 keeps rows between runs.
 */
import type { Page } from "@playwright/test";
import { expect, openStudio, test } from "./harness";

const token = `${Date.now().toString(36)}`;

async function createProject(page: Page, en: string, zh = "測試專案") {
  await openStudio(page, "/studio/projects/new");
  await page.locator('input[name="title.zh"]').fill(zh);
  const titleEn = page.locator('input[name="title.en"]');
  // The slug follows the EN title once the page is interactive (retry until
  // hydrated rather than racing it).
  await expect(async () => {
    await titleEn.fill("");
    await titleEn.pressSequentially(en);
    await expect(page.locator('input[name="slug"]')).not.toHaveValue("", {
      timeout: 500,
    });
  }).toPass();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
  await expect(page.locator(".studio-topbar .studio-save-state")).toHaveText(
    /SAVED|NO CHANGES/,
  );
}

async function saveState(page: Page) {
  return page.locator(".studio-topbar .studio-save-state");
}

test.describe("projects", () => {
  test("draft with a title only, refused publish, complete, publish, slug change", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const firstSlug = `p1-flow-${token}`;
    await createProject(page, `P1 Flow ${token}`);

    // Publishing a title-only draft does not submit: the checklist opens.
    const publish = page.locator('header button[value="publish"]');
    await expect(publish).toHaveText(/Publish · 4 issues/);
    await publish.click();
    const checklist = page.locator(".studio-checklist");
    await expect(checklist).toContainText("Year is required.");
    await expect(checklist).toContainText("Choose a primary category.");
    await expect(checklist).toContainText(
      "Short description is required in ZH.",
    );
    await expect(checklist).toContainText(
      "Short description is required in EN.",
    );
    await expect(
      page.locator(".studio-topbar .studio-badge").first(),
    ).toHaveText("Draft");

    // Complete the required fields; the checklist follows the typing.
    await page.locator('input[name="year:number"]').fill("2026");
    // A checklist item opens its (collapsed) section and focuses the field.
    await checklist.getByRole("button", { name: /primary category/ }).click();
    const primary = page.locator('select[name="primaryCategoryId"]');
    await expect(primary).toBeFocused();
    await primary.selectOption("term-project_category-software");
    await page.locator('textarea[name="shortDescription.zh"]').fill("摘要");
    await page.locator('textarea[name="shortDescription.en"]').fill("Summary");
    await expect(await saveState(page)).toHaveText("UNSAVED CHANGES");
    await expect(publish).toHaveText("Publish");

    // Keyboard save.
    await page.keyboard.press("ControlOrMeta+s");
    await expect(await saveState(page)).toHaveText(/SAVED \d\d:\d\d/);

    await publish.click();
    await expect(
      page.locator(".studio-topbar .studio-badge").first(),
    ).toHaveText("Published");
    await expect(page.locator(".studio-publication__links")).toContainText(
      "View live",
    );

    // Typing into the slug of a published project sticks and warns about the redirect.
    const slug = page.locator('input[name="slug"]');
    await slug.fill(`${firstSlug}-renamed`);
    await expect(slug).toHaveValue(`${firstSlug}-renamed`);
    await expect(page.locator(".studio-slug")).toContainText(
      `/en/works/${firstSlug} will redirect here`,
    );
    await page.locator('header button[value="publish"]').click();
    await expect(page.locator(".projects-redirects")).toContainText(
      `/en/works/${firstSlug}`,
    );

    // The old public URL answers 301 to the new one (public routes: P5).
    const old = await request.get(`/en/works/${firstSlug}`, {
      maxRedirects: 0,
    });
    expect(old.status()).toBe(301);
    expect(old.headers().location).toContain(`/en/works/${firstSlug}-renamed`);
  });

  test("guards unsaved changes when leaving the editor", async ({ page }) => {
    await createProject(page, `P1 Guard ${token}`);
    await page.locator('input[name="role.en"]').fill("Sound");
    await expect(await saveState(page)).toHaveText("UNSAVED CHANGES");
    await page
      .locator("header")
      .getByRole("link", { name: "Projects" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
    await expect(page.locator('input[name="role.en"]')).toHaveValue("Sound");

    await page
      .locator("header")
      .getByRole("link", { name: "Projects" })
      .click();
    await dialog.getByRole("button", { name: "Save and leave" }).click();
    await expect(page).toHaveURL(/\/studio\/projects$/);
  });

  test("features from the list and reorders the homepage with the keyboard", async ({
    page,
  }) => {
    await createProject(page, `P1 Home A ${token}`, `首頁甲${token}`);
    await createProject(page, `P1 Home B ${token}`, `首頁乙${token}`);
    await openStudio(page, "/studio/projects");

    for (const name of [`首頁甲${token}`, `首頁乙${token}`]) {
      await page.locator(`summary[aria-label="Actions for ${name}"]`).click();
      await page
        .locator("details[open] .projects-menu__item", {
          hasText: "Feature on homepage",
        })
        .click();
      await expect(page.locator(".studio-toast").last()).toContainText(
        "on the homepage",
      );
    }

    const home = page.locator(".projects-home__item");
    const titles = () =>
      home.locator(".projects-home__title").allTextContents();
    const before = await titles();
    const b = before.indexOf(`首頁乙${token}`);
    expect(b).toBeGreaterThan(0);
    await page
      .getByRole("button", {
        name: `Reorder: 首頁乙${token}, position ${b + 1} of ${before.length}`,
      })
      .press("Alt+ArrowUp");
    await expect(page.locator(".studio-toast").last()).toContainText(
      "Order saved",
    );
    await page.reload();
    const after = await titles();
    expect(after.indexOf(`首頁乙${token}`)).toBe(b - 1);
  });

  test("editor | preview split on desktop, single column with a save bar on phones", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await createProject(page, `P1 Layout ${token}`);
    await expect(page.locator('iframe[name="studio-preview"]')).toBeVisible();
    await expect(page.locator(".studio-editor__index")).toBeVisible();

    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.locator('iframe[name="studio-preview"]')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".projects-editor__mobilebar")).toBeVisible();
    await expect(page.locator(".projects-editor__actions")).toBeHidden();
    await page.locator('input[name="role.en"]').fill("Code");
    await page
      .locator(".projects-editor__mobilebar")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(await saveState(page)).toHaveText(/SAVED \d\d:\d\d/);
  });

  test("archives with undo and never offers delete for published projects", async ({
    page,
  }) => {
    await createProject(page, `P1 Archive ${token}`, `封存${token}`);
    await expect(page.getByText("Danger zone")).toBeVisible();
    await openStudio(page, "/studio/projects");
    await page
      .locator(`summary[aria-label="Actions for 封存${token}"]`)
      .click();
    await page
      .locator("details[open] .projects-menu__item", { hasText: "Archive" })
      .click();
    const toast = page.locator(".studio-toast").last();
    await expect(toast).toContainText(`Archived "封存${token}"`);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".studio-toast").last()).toContainText(
      "Restored",
    );
  });
});
