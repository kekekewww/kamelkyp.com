import { expect, type Page, test } from "@playwright/test";

async function fillFullMix(page: Page) {
  await page.getByLabel("Preferred name").fill("Artist K");
  await page.getByLabel("Email").fill("artist@example.com");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Contact platform").fill("Discord");
  await page.getByLabel("Contact account").fill("artist-k");
  await page
    .getByLabel("Project link")
    .fill("https://drive.google.com/file/d/example/view");
  await page.getByLabel("Purpose").fill("Single release");
  await page.getByLabel("Credit name or account").fill("@artist-k");
  await page.getByLabel("Genre").fill("Pop");
  await page.getByLabel("Reference link").fill("https://youtu.be/example");
  await page.getByLabel("BPM").fill("unknown");
  await page.getByLabel("Key").fill("unknown");
  await page.getByLabel("Direction").fill("Clear vocal");
}

test("full mix can be reviewed and edited before validation", async ({
  page,
}) => {
  await page.goto("/en/commission/mixing/full");
  await fillFullMix(page);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/bank transfer/i)).toBeVisible();
  await expect(page.getByText(/PayPal/)).toBeVisible();
  await expect(page.getByText(/first 5/i)).toBeVisible();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Artist K", { exact: true })).toBeVisible();
  await expect(
    page.getByText("US$260.00", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit project details" }).click();
  await expect(page.getByLabel("Direction")).toHaveValue("Clear vocal");
});

test("refresh restores the valid draft but not term acceptance", async ({
  page,
}) => {
  await page.goto("/en/commission/mixing/full");
  await page.evaluate(() => localStorage.clear());
  await fillFullMix(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/I have read and agree/).check();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("kamel:commission:v1:en:full_mix"),
      ),
    )
    .not.toBeNull();

  await page.reload();
  await expect(page.getByLabel("Preferred name")).toHaveValue("Artist K");
  await expect(page.getByLabel(/I have read and agree/)).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel(/I have read and agree/)).not.toBeChecked();
});
