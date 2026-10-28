/**
 * Retired /admin (wp5 §4.4, §6.2): owner check first, then GET/HEAD → 301 to
 * the Studio equivalent and every other method → 410. Version paths resolve
 * through the legacy tables and `legacy_source`; nothing is read without an
 * owner.
 */
import { env } from "cloudflare:workers";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import {
  discardRequestBody,
  ownerContext,
} from "../../app/lib/cms/studio/auth.server";
import type { Env } from "../../app/lib/env.server";
import {
  action,
  legacyAdminTarget,
  loader,
} from "../../app/routes/admin-legacy-redirect";
import { insertProject } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const owner = { subject: "owner-subject", email: "admin@example.com" };
const NOW = "2026-10-01T00:00:00Z";

const ENTRIES = [
  ["legacy-work-1", "work", "wp5-legacy-work"],
  ["legacy-work-orphan", "work", "wp5-legacy-orphan"],
  ["legacy-post-1", "post", "wp5-legacy-post"],
  ["legacy-page-home", "page", "home"],
  ["legacy-page-about", "page", "about"],
] as const;

const version = (entryId: string) => `${entryId}-v1`;

/** Legacy rows plus the Studio rows 0007 imported from two of them. */
async function seedLegacyContent(): Promise<void> {
  const exists = await env.DB.prepare(
    "SELECT 1 FROM content_entries WHERE id = 'legacy-work-1'",
  ).first();
  if (exists) return;
  await env.DB.batch(
    ENTRIES.flatMap(([id, kind, slug]) => [
      env.DB.prepare(
        "INSERT INTO content_entries (id, kind, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(id, kind, slug, NOW, NOW),
      env.DB.prepare(
        "INSERT INTO content_versions (id, entry_id, locale, version_number, state, title, body_json, created_at) VALUES (?, ?, 'zh', 1, 'draft', ?, '[]', ?)",
      ).bind(version(id), id, slug, NOW),
    ]),
  );
  await insertProject(env.DB, { id: "legacy-work-1", slug: "wp5-legacy-work" });
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE projects SET legacy_source = 'content_entries:legacy-work-1' WHERE id = 'legacy-work-1'",
    ),
    env.DB.prepare(
      "INSERT INTO writings (id, slug, created_at, updated_at, legacy_source) VALUES ('writing-from-legacy', 'wp5-legacy-post', ?, ?, 'content_entries:legacy-post-1')",
    ).bind(NOW, NOW),
  ]);
}

const url = (path: string) => new URL(path, "https://kamelkyp.com");

function contextFor(testEnv: Env, identity?: typeof owner) {
  const context = createCloudflareContextProvider(
    testEnv,
    {} as ExecutionContext,
    { nonce: "n", requestId: "r" },
  );
  if (identity) context.set(ownerContext, identity);
  return context;
}

function args(request: Request, testEnv: Env, identity?: typeof owner) {
  return {
    request,
    params: {},
    context: contextFor(testEnv, identity),
  } as unknown as LoaderFunctionArgs & ActionFunctionArgs;
}

/** The owner-free env of the worker pool: no dev owner can apply. */
function strangerEnv(db: D1Database = env.DB) {
  const testEnv = createTestEnv({ DB: db });
  expect(testEnv.STUDIO_DEV_OWNER_EMAIL).toBeUndefined();
  return testEnv;
}

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown Response");
}

describe("legacyAdminTarget", () => {
  it("resolves version paths through legacy_source", async () => {
    await seedLegacyContent();
    const target = (path: string) => legacyAdminTarget(env.DB, url(path));
    expect(
      await target(`/admin/content/${version("legacy-work-1")}/edit`),
    ).toBe("/studio/projects/legacy-work-1");
    expect(
      await target(`/admin/content/${version("legacy-work-orphan")}/edit`),
    ).toBe("/studio/projects");
    expect(
      await target(`/admin/content/${version("legacy-post-1")}/edit`),
    ).toBe("/studio/writing/writing-from-legacy");
    expect(await target(`/admin/posts/${version("legacy-post-1")}/edit`)).toBe(
      "/studio/writing/writing-from-legacy",
    );
    expect(
      await target(`/admin/content/${version("legacy-work-1")}/preview`),
    ).toBe("/studio/projects/legacy-work-1");
    expect(
      await target(`/admin/content/${version("legacy-page-home")}/edit`),
    ).toBe("/studio/homepage");
    expect(
      await target(`/admin/content/${version("legacy-page-about")}/edit`),
    ).toBe("/studio");
    expect(await target("/admin/content/does-not-exist/edit")).toBe("/studio");
    expect(await target("/admin/content/%E0%A4%A/edit")).toBe("/studio");
    expect(
      await target(`/ADMIN/Content/${version("legacy-work-1")}/EDIT`),
    ).toBe("/studio/projects/legacy-work-1");
  });

  it("maps static paths without reading D1", async () => {
    const prepare = vi.fn();
    const db = { prepare } as unknown as D1Database;
    expect(await legacyAdminTarget(db, url("/admin/works"))).toBe(
      "/studio/projects",
    );
    expect(await legacyAdminTarget(db, url("/admin/cases?status=paused"))).toBe(
      "/studio/commissions?status=paused",
    );
    expect(await legacyAdminTarget(db, url("/admin/a/b/c"))).toBe("/studio");
    expect(
      await legacyAdminTarget(
        db,
        url(`/admin/content/${"x".repeat(129)}/edit`),
      ),
    ).toBe("/studio");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("falls back to the Studio home when the lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.reject(new Error("no such table")),
        }),
      }),
    } as unknown as D1Database;
    await expect(
      legacyAdminTarget(db, url("/admin/content/secret-version/edit")),
    ).resolves.toBe("/studio");
    expect(warn).toHaveBeenCalledWith("legacy_admin_lookup_failed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-version");
    warn.mockRestore();
  });
});

describe("legacy /admin loader", () => {
  it("answers the owner with an uncached 301 to the Studio", async () => {
    const testEnv = createTestEnv({ DB: env.DB });
    const get = async (path: string, method = "GET") =>
      (await loader(
        args(new Request(url(path), { method }), testEnv, owner),
      )) as Response;

    const works = await get("/admin/works");
    expect(works.status).toBe(301);
    expect(works.headers.get("Location")).toBe("/studio/projects");
    expect(works.headers.get("Cache-Control")).toBe("no-store");
    expect(works.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    const head = await get("/admin", "HEAD");
    expect(head.status).toBe(301);
    expect(head.headers.get("Location")).toBe("/studio");

    expect(
      (await get("/admin/cases?status=paused")).headers.get("Location"),
    ).toBe("/studio/commissions?status=paused");
    expect((await get("/ADMIN/Works")).headers.get("Location")).toBe(
      "/studio/projects",
    );
    expect((await get("/admin/whatever/deep")).headers.get("Location")).toBe(
      "/studio",
    );
  });

  it("refuses a request without an owner before reading anything", async () => {
    const prepare = vi.fn();
    const testEnv = strangerEnv({ prepare } as unknown as D1Database);
    for (const path of [
      "/admin",
      "/admin/works",
      "/admin/content/legacy-work-1-v1/edit",
    ]) {
      const response = await thrown(
        loader(args(new Request(url(path)), testEnv)),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("Location")).toBeNull();
    }
    const forged = new Request(url("/admin/works"), {
      headers: { "Cf-Access-Jwt-Assertion": "" },
    });
    expect((await thrown(loader(args(forged, testEnv)))).status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("legacy /admin action", () => {
  it("answers every owner mutation with 410 and consumes the body", async () => {
    const testEnv = createTestEnv({ DB: env.DB });
    const requests = [
      new Request(url("/admin/cases/status"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "caseId=x&status=paused&csrfToken=stale",
      }),
      new Request(url("/admin/links"), { method: "PUT", body: "{}" }),
      new Request(url("/admin/terms"), { method: "DELETE" }),
      new Request(url("/admin/services"), { method: "PATCH", body: "x" }),
    ];
    for (const request of requests) {
      const response = (await action(
        args(request, testEnv, owner),
      )) as Response;
      expect(response.status, request.method).toBe(410);
      expect(await response.text()).toBe("Gone");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Location")).toBeNull();
      if (request.body) expect(request.bodyUsed, request.method).toBe(true);
    }
  });

  it("refuses a mutation without an owner and still consumes the body", async () => {
    const prepare = vi.fn();
    const testEnv = strangerEnv({ prepare } as unknown as D1Database);
    const request = new Request(url("/admin/cases/status"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "caseId=x&status=paused",
    });
    const response = await thrown(action(args(request, testEnv)));
    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("discardRequestBody", () => {
  it("drains a small body", async () => {
    const request = new Request(url("/admin/links"), {
      method: "POST",
      headers: { "Content-Length": "5" },
      body: "hello",
    });
    await discardRequestBody(request);
    expect(request.bodyUsed).toBe(true);
  });

  it("cancels an unsized or oversized stream instead of reading it", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16));
      },
    });
    const unsized = new Request(url("/admin/links"), {
      method: "PUT",
      body: stream,
    });
    await discardRequestBody(unsized);
    expect(unsized.bodyUsed).toBe(true);
    expect(pulled).toBeLessThan(4);

    const oversized = new Request(url("/admin/links"), {
      method: "PUT",
      headers: { "Content-Length": String(2 * 1024 * 1024) },
      body: "x",
    });
    await discardRequestBody(oversized);
    expect(oversized.bodyUsed).toBe(true);
  });

  it("is a no-op without a body or after the body was read", async () => {
    await expect(
      discardRequestBody(new Request(url("/admin"))),
    ).resolves.toBeUndefined();
    const read = new Request(url("/admin/links"), {
      method: "POST",
      body: "x",
    });
    await read.text();
    await expect(discardRequestBody(read)).resolves.toBeUndefined();
  });
});
