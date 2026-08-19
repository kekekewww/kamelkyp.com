import { expect, test } from "@playwright/test";

test("HTML responses use one nonce and the strict approved CSP", async ({
  request,
}) => {
  const first = await request.get("/en");
  const second = await request.get("/en");
  const firstCsp = first.headers()["content-security-policy"] ?? "";
  const secondCsp = second.headers()["content-security-policy"] ?? "";
  const firstNonce = firstCsp.match(/'nonce-([^']+)'/)?.[1];
  const secondNonce = secondCsp.match(/'nonce-([^']+)'/)?.[1];

  expect(first.status()).toBe(200);
  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
  expect(await first.text()).toContain(`nonce="${firstNonce}"`);
  expect(firstCsp).toContain("frame-ancestors 'none'");
  expect(firstCsp).toContain(
    "frame-src https://www.youtube-nocookie.com https://drive.google.com https://challenges.cloudflare.com",
  );
  expect(firstCsp).not.toMatch(/unsafe-inline|unsafe-eval/);
});

test("private workflows and failures are never cached", async ({ request }) => {
  const commission = await request.get("/en/commission/mixing/full");
  const admin = await request.get("/admin");
  const missing = await request.get("/en/not-a-real-page");

  expect(commission.headers()["cache-control"]).toContain("no-store");
  expect(admin.headers()["cache-control"]).toContain("no-store");
  expect(missing.headers()["cache-control"]).toContain("no-store");
  expect(admin.status()).toBe(403);
  expect(missing.status()).toBe(404);
});

test("approved embeds load on click while Dropbox remains a link", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("https://drive.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Drive preview</p>" }),
  );
  await page.goto("/en/works/security-media-test");

  await expect(page.locator("iframe")).toHaveCount(0);
  const loadPreview = page.getByRole("button", { name: "Load preview" });
  const driveFrame = page.locator(
    'iframe[title="Google Drive: Drive preview"]',
  );
  await expect(async () => {
    if ((await driveFrame.count()) === 0) await loadPreview.click();
    await expect(driveFrame).toBeVisible();
  }).toPass();
  await expect(page.locator('iframe[src*="dropbox.com"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open external media" }),
  ).toHaveAttribute("href", /dropbox\.com/);
  const localVite = process.env.PREVIEW_URL?.includes(":5173") ?? false;
  expect(
    browserErrors.filter((message) => {
      if (/hydrated but some attributes/i.test(message)) return true;
      if (/Loading the font 'data:font\//i.test(message)) return false;
      return !localVite && /content security policy/i.test(message);
    }),
  ).toEqual([]);
});
