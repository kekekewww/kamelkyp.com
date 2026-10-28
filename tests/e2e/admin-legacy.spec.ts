import { type APIResponse, expect, test } from "@playwright/test";
import { behindAccess, expectOwnerGate } from "./helpers/owner-gate";

// The retired /admin (wp5 §6.3). Every legacy URL is owner-checked before
// the redirect: without an Access identity the Worker answers 403 for GET,
// HEAD and POST alike, never a 301 that reveals the Studio target and never
// a 410. A deployed Preview answers with the Access login redirect instead
// (helpers/owner-gate.ts). /admin/services, /admin/terms and /admin/works
// are the regression guard for the route ranking: with a lone admin/* splat
// they would reach the public layout and answer 404.
const LEGACY_PATHS = [
  "/admin",
  "/admin/",
  "/admin/content",
  "/admin/content/v-1/edit",
  "/admin/content/v-1/preview",
  "/admin/services",
  "/admin/services/",
  "/admin/terms",
  "/admin/works",
  "/admin/links",
  "/admin/posts",
  "/admin/posts/v-1/edit",
  "/admin/cases",
  "/admin/cases?status=paused",
  "/admin/cases/status",
  "/admin/cases/student-discount",
  "/admin/cases/cleanup",
  "/admin/unknown",
  "/admin/a/b/c",
];

// Whether Access path matching ignores case is not documented, so on a
// deployed Preview these may reach the Worker: either refusal is fail-closed.
const MIXED_CASE_PATHS = ["/ADMIN/Works", "/Admin/Cases"];

async function expectWorkerRefusal(response: APIResponse, label: string) {
  expect(response.status(), label).toBe(403);
  expect(response.headers()["cache-control"], label).toContain("no-store");
  expect(response.headers().location, label).toBeUndefined();
  expect(await response.text(), label).not.toContain("/studio");
}

for (const path of LEGACY_PATHS) {
  test(`GET ${path} is refused before any redirect`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    await expectOwnerGate(response, path);
    if (!behindAccess) await expectWorkerRefusal(response, path);
  });
}

for (const path of MIXED_CASE_PATHS) {
  test(`GET ${path} is refused before any redirect`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    if (behindAccess && response.status() !== 403) {
      await expectOwnerGate(response, path);
    } else {
      await expectWorkerRefusal(response, path);
    }
  });
}

test("HEAD and legacy form posts are refused without an owner", async ({
  request,
}) => {
  const head = await request.head("/admin", { maxRedirects: 0 });
  await expectOwnerGate(head, "HEAD /admin");
  if (!behindAccess) expect(head.headers().location).toBeUndefined();

  // 403, not 410: the owner check runs before the method is answered.
  const status = await request.post("/admin/cases/status", {
    form: { caseId: "x", status: "paused" },
    maxRedirects: 0,
  });
  await expectOwnerGate(status, "POST /admin/cases/status");
  if (!behindAccess) await expectWorkerRefusal(status, "POST status");

  const links = await request.post("/admin/links", {
    form: {},
    maxRedirects: 0,
  });
  await expectOwnerGate(links, "POST /admin/links");
  if (!behindAccess) await expectWorkerRefusal(links, "POST links");
});

test("the public pages do not link to the retired admin", async ({
  request,
}) => {
  for (const path of ["/en", "/zh"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    // Routes match case-insensitively: `/Admin/cases` is the same surface.
    const html = (await response.text()).toLowerCase();
    expect(html, path).not.toContain('href="/admin');
  }
});

test("a never-legacy public child under /admin stays the public 404", async ({
  request,
}) => {
  // wp5 §9 R6, pinned on purpose. On a deployed Preview Access answers
  // every /admin/* path first, so this runs on loopback only.
  test.skip(behindAccess, "Access answers /admin/* on a deployed Preview");
  const response = await request.get("/admin/about", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("/studio");
});
