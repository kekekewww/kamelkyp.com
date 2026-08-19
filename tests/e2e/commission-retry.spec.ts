import { expect, test } from "@playwright/test";
import {
  completeValidFullMix,
  installTurnstileMock,
} from "./helpers/commission";

test("mail failure preserves the draft and retry Case ID", async ({ page }) => {
  await installTurnstileMock(page);
  let attempts = 0;
  await page.route("**/api/commission/submit", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "retry_required",
            message:
              "Your form is saved in Google, but notification is still pending.",
            retryCaseId: "KAM-20260810-0000000002",
          },
        }),
      });
    }
    return route.fulfill({
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
    });
  });
  await completeValidFullMix(page);
  await page.getByRole("button", { name: "Submit commission" }).click();

  await expect(
    page.getByText(
      "Your form is saved in Google, but notification is still pending.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("kamel:commission:v1:en:full_mix"),
    ),
  ).not.toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("kamel:commission-attempt:v1:full_mix"),
    ),
  ).toBe("KAM-20260810-0000000002");

  const retry = page.getByRole("button", { name: "Retry notification" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByText("KAM-20260810-0000000002")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("kamel:commission:v1:en:full_mix"),
    ),
  ).toBeNull();
});
