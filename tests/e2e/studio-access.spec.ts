import { type APIResponse, expect, test } from "@playwright/test";
import { expectOwnerOnlyRefusal } from "./helpers/access";

// The loopback server has no Access identity and no dev owner, so every
// Studio surface must refuse the request before any data is read. On a
// deployed preview Cloudflare Access may refuse it first (helpers/access.ts).
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
    await expectOwnerOnlyRefusal(response, (refusal) => {
      expect(refusal.status()).toBe(403);
      expect(refusal.headers()["cache-control"]).toContain("no-store");
      expect(refusal.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    });
    const body = await response.text();
    expect(body).not.toContain("seed-p-001");
    expect(body).not.toContain("csrfToken");
  });
}

test("Studio mutations are refused without an owner identity", async ({
  request,
}) => {
  const refusedUncached = (refusal: APIResponse) => {
    expect(refusal.status()).toBe(403);
    expect(refusal.headers()["cache-control"]).toContain("no-store");
  };

  const upload = await request.put("/api/studio/media/x/content", {
    data: "not a file",
    headers: { "Content-Type": "application/octet-stream" },
    maxRedirects: 0,
  });
  await expectOwnerOnlyRefusal(upload, refusedUncached);

  const register = await request.post("/api/studio/media-register", {
    data: { url: "https://example.com/a.jpg" },
    maxRedirects: 0,
  });
  await expectOwnerOnlyRefusal(register, (refusal) => {
    expect(refusal.status()).toBe(403);
  });

  const status = await request.post("/studio/commissions/status", {
    form: { caseId: "x", status: "accepted" },
    maxRedirects: 0,
  });
  await expectOwnerOnlyRefusal(status, refusedUncached);

  const student = await request.post("/studio/commissions/student-discount", {
    form: { intent: "accept-student-price", caseId: "KAM-20261001-E2E0000003" },
    maxRedirects: 0,
  });
  await expectOwnerOnlyRefusal(student, refusedUncached);

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
  await expectOwnerOnlyRefusal(cleanup, refusedUncached);
});

test("the public site does not link to the Studio", async ({ request }) => {
  const home = await request.get("/en");
  expect(home.status()).toBe(200);
  expect(await home.text()).not.toContain("/studio");
  expect(home.headers()["x-robots-tag"]).toBeUndefined();
});
