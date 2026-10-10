import { expect, test } from "@playwright/test";
import {
  completeValidFullMix,
  installTurnstileMock,
} from "./helpers/commission";

test("successful submit clears draft and shows limited confirmation", async ({
  page,
}) => {
  await installTurnstileMock(page);
  await page.route("**/api/commission/submit", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          caseId: "KAM-20260810-0000000001",
          serviceId: "full_mix",
          submittedAt: "2026-08-10T12:00:00.000Z",
        },
      }),
    }),
  );
  await completeValidFullMix(page);
  const submit = page.getByRole("button", { name: "Submit commission" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("KAM-20260810-0000000001")).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Full Song Mixing"),
  ).toBeVisible();
  await expect(page.getByText("artist@example.com")).toHaveCount(0);
  await expect(page.getByText("https://drive.google.com")).toHaveCount(0);
  const draftKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("kamel:commission"),
    ),
  );
  expect(draftKeys).toEqual([]);
});

test("a pending draft autosave cannot restore the draft after submit", async ({
  page,
}) => {
  // Paused timers keep the 300 ms draft autosave pending through submit; the
  // success navigation is held open while time advances past the debounce.
  await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-08-10T12:00:01Z"));
  // Issues the token synchronously so no timer has to run before submit.
  await page.route("**/turnstile/v0/api.js?render=explicit", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={render:function(_el,options){options.callback('test-token');return 'widget-1'},remove:function(){}};",
    }),
  );
  await page.route("**/api/commission/submit", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          caseId: "KAM-20260810-0000000002",
          serviceId: "full_mix",
          submittedAt: "2026-08-10T12:00:00.000Z",
        },
      }),
    }),
  );
  let releaseSuccess: () => void = () => {};
  const successHeld = new Promise<void>((resolve) => {
    releaseSuccess = resolve;
  });
  let successRequested: () => void = () => {};
  const successRequest = new Promise<void>((resolve) => {
    successRequested = resolve;
  });
  await page.route("**/en/commission/success.data*", async (route) => {
    successRequested();
    await successHeld;
    await route.continue();
  });
  await completeValidFullMix(page);
  const submit = page.getByRole("button", { name: "Submit commission" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await successRequest;
  await page.clock.runFor(1_000);
  releaseSuccess();

  await expect(page.getByText("KAM-20260810-0000000002")).toBeVisible();
  const draftKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("kamel:commission"),
    ),
  );
  expect(draftKeys).toEqual([]);
});
