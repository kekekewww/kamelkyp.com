import { expect, test } from "@playwright/test";
import { behindAccess, expectOwnerGate } from "./helpers/owner-gate";

// The loopback server has no Access identity and no dev owner, so every
// Studio surface must refuse the request before any data is read; a deployed
// Preview redirects it to the Access login instead.
const STUDIO_PATHS = [
  "/studio",
  "/studio/projects",
  "/studio/projects/seed-p-001",
  "/studio/services/pricing",
  "/studio/services/pricing/full_mix",
  "/studio/services/terms",
  "/studio/services/terms/common/zh",
  "/studio/settings/brand",
  "/studio/preview/home?drafts=1",
  "/studio/preview/projects/seed-p-001?locale=en",
  "/studio/preview/terms/common?locale=zh",
  "/api/studio/session",
  "/api/studio/slug-check?type=project&slug=x",
  "/api/studio/media-search?q=x",
];

for (const path of STUDIO_PATHS) {
  test(`GET ${path} is refused without an owner identity`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expectOwnerGate(response);
    if (!behindAccess) {
      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    }
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
    maxRedirects: 0,
  });
  expectOwnerGate(upload);

  const price = await request.post("/studio/services/pricing/full_mix", {
    form: { intent: "publish-price-version", "baseTwd:number": "1" },
    maxRedirects: 0,
  });
  expectOwnerGate(price);

  const terms = await request.post("/studio/services/terms/common/zh", {
    form: { intent: "publish-term-version", legalReviewConfirmed: "on" },
    maxRedirects: 0,
  });
  expectOwnerGate(terms);

  const register = await request.post("/api/studio/media-register", {
    data: { url: "https://example.com/a.jpg" },
    maxRedirects: 0,
  });
  expectOwnerGate(register);

  const status = await request.post("/studio/commissions/status", {
    form: { caseId: "x", status: "accepted" },
    maxRedirects: 0,
  });
  expectOwnerGate(status);
});

test("the public site does not link to the Studio", async ({ request }) => {
  const home = await request.get("/en");
  expect(home.status()).toBe(200);
  expect(await home.text()).not.toContain("/studio");
  expect(home.headers()["x-robots-tag"]).toBeUndefined();
});
