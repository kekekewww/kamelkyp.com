import { expect, openStudio, test } from "./harness";

test("the dev owner reaches the Studio shell and its navigation", async ({
  page,
}) => {
  await openStudio(page);
  await expect(page).toHaveTitle(/KAMEL STUDIO/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const nav = page.getByRole("navigation", { name: "Studio sections" });
  await nav.getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/studio\/projects$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" }),
  ).toBeVisible();
});

test("the session endpoint issues a CSRF token for the dev owner", async ({
  request,
}) => {
  const response = await request.get("/api/studio/session");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = (await response.json()) as {
    ownerEmail: string;
    csrfToken: string;
  };
  expect(body.ownerEmail).toBe("studio-e2e-owner@example.com");
  expect(body.csrfToken.length).toBeGreaterThan(20);
});
