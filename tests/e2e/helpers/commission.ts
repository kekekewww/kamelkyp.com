import type { Page } from "@playwright/test";

export async function installTurnstileMock(page: Page) {
  await page.route("**/turnstile/v0/api.js?render=explicit", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile={render:function(_el,options){setTimeout(function(){options.callback('test-token')},0);return 'widget-1'},remove:function(){}};`,
    }),
  );
}

export async function completeValidFullMix(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/en/commission/mixing/full");
  await page.locator('[data-draft-ready="true"]').waitFor();
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
  await page.getByLabel("Preferred name").fill("Artist K");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Continue to verification" }).click();
}
