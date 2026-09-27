import { expect, test } from "@playwright/test";

// The loopback server has no Access identity and no dev owner, so every
// Studio surface must refuse the request before any data is read.
const STUDIO_PATHS = [
  "/studio",
  "/studio/projects",
  "/studio/projects/seed-p-001",
  "/studio/settings/brand",
  "/studio/preview/home?drafts=1",
  "/studio/preview/projects/seed-p-001?locale=en",
  "/api/studio/session",
  "/api/studio/slug-check?type=project&slug=x",
  "/api/studio/media-search?q=x",
];

for (const path of STUDIO_PATHS) {
  test(`GET ${path} is refused without an owner identity`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const body = await response.text();
    expect(body).not.toContain("seed-p-001");
    expect(body).not.toContain("csrfToken");
  });
}

test("Studio mutations are refused without an owner identity", async ({
  request,
}) => {
  const upload = await request.put("/api/studio/media/x/content", {
    data: "not a file",
    headers: { "Content-Type": "application/octet-stream" },
  });
  expect(upload.status()).toBe(403);
  expect(upload.headers()["cache-control"]).toContain("no-store");

  const register = await request.post("/api/studio/media-register", {
    data: { url: "https://example.com/a.jpg" },
  });
  expect(register.status()).toBe(403);

  const status = await request.post("/studio/commissions/status", {
    form: { caseId: "x", status: "accepted" },
  });
  expect(status.status()).toBe(403);
});

test("the public site does not link to the Studio", async ({ request }) => {
  const home = await request.get("/en");
  expect(home.status()).toBe(200);
  expect(await home.text()).not.toContain("/studio");
  expect(home.headers()["x-robots-tag"]).toBeUndefined();
});
