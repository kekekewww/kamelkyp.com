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
