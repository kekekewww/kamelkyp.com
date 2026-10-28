/**
 * wp7 (plan §9 C3 g): a "terms changed" answer while a notification retry is
 * pending. The stored case was hashed with the previous term versions, so it
 * can never be retried with the new ones: the wizard forgets it, and after
 * Reload the visitor submits the draft as a new commission.
 */
import { expect, test } from "@playwright/test";
import {
  completeValidFullMix,
  installTurnstileMock,
} from "./helpers/commission";

const RETRY_CASE = "KAM-20260810-0000000003";
const NEW_CASE = "KAM-20260810-0000000004";
const ATTEMPT_KEY = "kamel:commission-attempt:v1:full_mix";

test("terms changed during a pending retry: Reload, accept, submit a new case", async ({
  page,
}) => {
  await installTurnstileMock(page);
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/commission/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "retry_required",
            message: "The form or notification is still syncing.",
            retryCaseId: RETRY_CASE,
          },
        }),
      });
    }
    if (bodies.length === 2) {
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "terms_changed",
            message:
              "The terms were updated. Reload the page, read and accept the new version, then submit again.",
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
          caseId: NEW_CASE,
          serviceId: "full_mix",
          submittedAt: "2026-08-10T12:00:00.000Z",
        },
      }),
    });
  });
  await completeValidFullMix(page);
  await page.getByRole("button", { name: "Submit commission" }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), ATTEMPT_KEY))
    .toBe(RETRY_CASE);

  const retry = page.getByRole("button", { name: "Retry notification" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(
    page.getByText(
      "The terms were updated. Reload the page, read and accept the new version, then submit again.",
    ),
  ).toBeVisible();
  expect(bodies[1]?.existingCaseId).toBe(RETRY_CASE);
  // The pending case can never match the new terms: the wizard forgets it.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), ATTEMPT_KEY))
    .toBeNull();

  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Continue to verification" }).click();
  const submit = page.getByRole("button", { name: "Submit commission" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText(NEW_CASE)).toBeVisible();
  expect(bodies).toHaveLength(3);
  expect(bodies[2]).not.toHaveProperty("existingCaseId");
});
