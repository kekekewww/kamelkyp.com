/**
 * wp7 (plan §9 C3 g): the terms change while the wizard is open. The submit
 * answers 409 `terms_changed`; Reload loads the page data again, and the new
 * term versions reset the acceptance, so the visitor accepts them before the
 * next submit, which carries them. The draft stays.
 *
 * A test cannot publish terms in the loopback or preview database, so the
 * reload's `.data` response is rewritten as a publication would change it:
 * every term version id the page was loaded with gets a new id.
 */
import { expect, test } from "@playwright/test";
import {
  completeValidFullMix,
  installTurnstileMock,
} from "./helpers/commission";

const NEW_CASE = "KAM-20260810-0000000004";
const MESSAGE =
  "The terms were updated. Reload the page, read and accept the new version, then submit again.";

interface SubmitBody {
  draft?: unknown;
  termVersionIds?: string[];
  existingCaseId?: string;
}

test("terms changed: Reload brings the new versions, resets the acceptance and keeps the draft", async ({
  page,
}) => {
  await installTurnstileMock(page);
  const bodies: SubmitBody[] = [];
  await page.route("**/api/commission/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "terms_changed", message: MESSAGE },
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
  const republished = (id: string) => `${id}-republished`;
  let reloads = 0;
  await page.route(
    /\/en\/commission\/mixing\/full\.data(\?|$)/,
    async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      for (const id of bodies[0]?.termVersionIds ?? []) {
        body = body.replaceAll(
          JSON.stringify(id),
          JSON.stringify(republished(id)),
        );
      }
      reloads += 1;
      await route.fulfill({ response, body });
    },
  );

  await completeValidFullMix(page);
  await page.getByRole("button", { name: "Submit commission" }).click();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  const accepted = bodies[0]?.termVersionIds ?? [];
  expect(accepted).toHaveLength(3);
  // Submitting again would fail the same way: the forward action reloads.
  await expect(
    page.getByRole("button", { name: "Submit commission" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Reload", exact: true }).click();
  // The terms step reopens, and the new versions cleared the acceptance.
  const agree = page.getByLabel(/I have read and agree/);
  await expect(agree).toBeVisible();
  await expect(agree).not.toBeChecked();
  expect(reloads).toBeGreaterThan(0);
  await agree.check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Continue to verification" }).click();
  const submit = page.getByRole("button", { name: "Submit commission" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText(NEW_CASE)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.termVersionIds).toEqual(accepted.map(republished));
  expect(bodies[1]?.draft).toEqual(bodies[0]?.draft);
  expect(bodies[1]).not.toHaveProperty("existingCaseId");
});
