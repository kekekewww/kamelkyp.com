import { expect, test } from "@playwright/test";

/*
 * Studio preview routes (admin-architecture §2.4): owner-only behind
 * Cloudflare Access, never cached, never indexed, never linked publicly. The
 * loopback Worker has no Access in front of it, so every preview URL must
 * fail closed with 403 (the owner flow itself is covered by worker tests of
 * the preview read layer and the dev-server Studio suite).
 */
const PREVIEW_URLS = [
  "/studio/preview/home?locale=en&drafts=1",
  "/studio/preview/projects/e2e-cms-draft?locale=en",
  "/studio/preview/projects/seed-p-001?locale=zh",
  "/studio/preview/music/e2e-cms-showreel",
  "/studio/preview/recognition/e2e-cms-award",
  "/studio/preview/writing/e2e-cms-note-draft",
  "/studio/preview/services/svc-full_mix",
];

test("preview routes fail closed without the owner: 403, no-store, noindex", async ({
  request,
}) => {
  for (const url of PREVIEW_URLS) {
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(403);
    expect(response.headers()["cache-control"], url).toContain("no-store");
    expect(response.headers()["x-robots-tag"], url).toContain("noindex");
    const body = await response.text();
    expect(body, url).not.toContain("Fixture Draft");
    expect(body, url).not.toContain("Sample:");
  }
});

test("an unsaved-form preview POST is refused before it is read", async ({
  request,
}) => {
  const response = await request.post(
    "/studio/preview/projects/e2e-cms-draft?locale=en",
    {
      multipart: {
        csrfToken: "forged",
        "title.en": "Injected title",
      },
      maxRedirects: 0,
    },
  );
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("Injected title");
});

test("public pages never link to the Studio or leak drafts", async ({
  request,
}) => {
  for (const path of [
    "/en",
    "/zh",
    "/en/works",
    "/en/works/fixture-signal-map",
    "/en/writing",
  ]) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/href="\/studio/);
    expect(html, path).not.toContain("Fixture Draft Project");
    expect(html, path).not.toContain("Fixture Draft Note");
    expect(html, path).not.toMatch(/Sample:|示意：/);
  }
});
