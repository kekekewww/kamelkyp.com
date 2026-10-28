import { expect, test } from "@playwright/test";
import { behindAccess, expectOwnerGate } from "./helpers/owner-gate";

// The loopback server has no Access identity and no dev owner, so every
// Studio surface must refuse the request before any data is read; a deployed
// Preview redirects it to the Access login instead.
const STUDIO_PATHS = [
  "/studio",
  "/studio/commissions",
  "/studio/commissions?status=pending_review&service=full_mix",
  "/studio/commissions.data",
  "/studio/projects",
  "/studio/projects/seed-p-001",
  "/studio/projects/seed-p-001.data",
  "/studio/services/pricing",
  "/studio/services/pricing/full_mix",
  "/studio/services/terms",
  "/studio/services/terms/common/zh",
  "/studio/settings/brand",
  "/studio/settings/footer",
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
    await expectOwnerGate(response);
    // A single-fetch data answer (*.data) carries no page headers.
    if (!behindAccess && !new URL(response.url()).pathname.endsWith(".data")) {
      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    }
    const body = await response.text();
    expect(body).not.toContain("seed-p-001");
    expect(body).not.toContain("csrfToken");
  });
}

// The single-fetch data URLs of the two owner roots lie outside the Access
// paths (/studio, /studio/*, /admin, /admin/*), so even on a deployed Preview
// they reach the Worker: its own owner guard must refuse them there too.
for (const path of ["/studio.data", "/admin.data"]) {
  test(`GET ${path} is refused by the Worker itself`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.text();
    expect(body).toContain("Forbidden");
    expect(body).not.toContain("seed-p-001");
    expect(body).not.toContain("csrfToken");
    expect(body).not.toContain("@");
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
  await expectOwnerGate(upload, "upload");

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
  await expectOwnerGate(register, "media-register");

  const footer = await request.post("/studio/settings/footer", {
    form: { intent: "reorder", ids: "[]" },
    maxRedirects: 0,
  });
  expectOwnerGate(footer);

  const status = await request.post("/studio/commissions/status", {
    form: { caseId: "x", status: "accepted" },
    maxRedirects: 0,
  });
  await expectOwnerGate(status, "commission status");

  const student = await request.post("/studio/commissions/student-discount", {
    form: { intent: "accept-student-price", caseId: "KAM-20261001-E2E0000003" },
    maxRedirects: 0,
  });
  await expectOwnerGate(student, "student discount");

  const cleanup = await request.post("/studio/commissions/cleanup", {
    form: {
      intent: "confirm-cleanup",
      caseId: "KAM-20261001-E2E0000004",
      googleRecordsDeleted: "on",
      gmailDeleted: "on",
      otherSensitiveCopiesDeleted: "on",
    },
    maxRedirects: 0,
  });
  await expectOwnerGate(cleanup, "commission cleanup");
});

test("the public site does not link to the Studio", async ({ request }) => {
  const home = await request.get("/en");
  expect(home.status()).toBe(200);
  expect(await home.text()).not.toContain("/studio");
  // The loopback renders the preview config (run-loopback-e2e.mjs), and preview
  // deployments are noindex by design (WP4). Production indexability is proven
  // by security-headers.test.ts and the isIndexableRequest table in seo.test.ts.
  expect(home.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
