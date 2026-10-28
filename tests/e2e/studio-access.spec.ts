import { expect, test } from "@playwright/test";
import { behindAccess, expectOwnerGate } from "./helpers/owner-gate";

// The loopback server has no Access identity and no dev owner, so every
// Studio surface must refuse the request before any data is read; a deployed
// Preview redirects it to the Access login instead.
const STUDIO_PATHS = [
  "/studio",
  "/studio/commissions",
  "/studio/commissions?status=pending_review&service=full_mix",
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
    await expectOwnerGate(response);
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
  await expectOwnerGate(upload, "upload");

  const register = await request.post("/api/studio/media-register", {
    data: { url: "https://example.com/a.jpg" },
    maxRedirects: 0,
  });
  await expectOwnerGate(register, "media-register");

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
  expect(home.headers()["x-robots-tag"]).toBeUndefined();
});
