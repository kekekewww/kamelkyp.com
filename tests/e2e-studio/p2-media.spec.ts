/**
 * P2 browser flows against the dev server (admin-architecture §3.6): music
 * entry lifecycle and the single homepage showreel, media library URL
 * registration, metadata, usage-safe deletion, and the upload API refusing
 * with 503 while no media base URL is configured (the harness sets none).
 */
import { expect, openStudio, STUDIO_E2E_ORIGIN, test } from "./harness";

test("a music entry goes from quick create to published homepage showreel", async ({
  page,
}) => {
  const title = `E2E reel ${Date.now()}`;
  await openStudio(page, "/studio/music/new");
  await page.getByRole("textbox", { name: /ZH/ }).first().fill(title);
  await page.getByRole("textbox", { name: /EN/ }).first().fill(title);
  await page.getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/\/studio\/music\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  // Publishing without a playable source saves, then lists what is missing.
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(
    page.getByText("Saved as a draft. Fix the checklist"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Add preview audio, full audio or a Spotify, YouTube or SoundCloud link.",
    ),
  ).toBeVisible();

  await page.locator("#section-links > summary").click();
  await page
    .getByRole("textbox", { name: "YouTube" })
    .fill("https://www.youtube.com/watch?v=e2eReel01");
  await expect(page.getByRole("status").first()).toHaveText("UNSAVED CHANGES");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("status").first()).toHaveText(
    /^SAVED \d{2}:\d{2}$/,
  );

  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Make homepage showreel" }).click();
  await expect(
    page.getByRole("button", { name: "Remove from homepage showreel" }),
  ).toBeVisible();

  await openStudio(page, "/studio/music");
  const slot = page.getByRole("region", { name: "Homepage showreel" });
  await expect(slot.getByRole("link", { name: title })).toBeVisible();
  await expect(slot.getByText("Never autoplays")).toBeVisible();
  expect(await page.locator("audio[autoplay], video[autoplay]").count()).toBe(
    0,
  );
});

test("the media library registers a URL, edits alt text and deletes an unused asset", async ({
  page,
}) => {
  const file = `e2e-${Date.now()}.jpg`;
  await openStudio(page, "/studio/media");
  await expect(page.getByText("Uploads off")).toBeVisible();

  await page.getByRole("button", { name: "Register URL" }).click();
  await page
    .getByRole("textbox", { name: "Address (https://)" })
    .fill(`https://images.example.com/${file}`);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText(`Registered ${file}`)).toBeVisible();

  await page.getByRole("link", { name: file }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: file }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: /ZH/ }).nth(1).fill("測試圖片");
  await page.getByRole("textbox", { name: /EN/ }).nth(1).fill("Test image");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByRole("status").first()).toHaveText(/^SAVED/);
  // Scoped: the closed delete dialog also says "It is not used anywhere."
  await expect(
    page
      .getByRole("region", { name: "Used in" })
      .getByText("Not used anywhere"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/studio\/media\?deleted=/);
  await expect(page.getByText(`Deleted ${file}`)).toBeVisible();
});

test("the upload API answers 503 uploads_not_configured without a base URL", async ({
  request,
}) => {
  const session = await request.get("/api/studio/session");
  const { csrfToken } = (await session.json()) as { csrfToken: string };
  const response = await request.post("/api/studio/media", {
    headers: {
      "X-Studio-CSRF": csrfToken,
      "Content-Type": "application/json",
      Origin: STUDIO_E2E_ORIGIN,
    },
    data: { filename: "a.png", mimeType: "image/png", sizeBytes: 10 },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toMatchObject({
    code: "uploads_not_configured",
  });
});
