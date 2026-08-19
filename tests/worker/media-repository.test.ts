import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  createDraftVersion,
  publishVersion,
} from "../../app/lib/db/content-repository.server";
import { listMediaForVersion } from "../../app/lib/media/media-repository.server";

const r2Hosts = new Set(["media.kamelkyp.com"]);

async function createWork(entryId: string) {
  return createDraftVersion(env.DB, {
    entryId,
    kind: "work",
    slug: entryId,
    locale: "en",
    title: entryId,
    summary: null,
    body: [],
  });
}

async function insertMedia(
  contentVersionId: string,
  input: { id: string; kind: string; url: string; sortOrder?: number },
) {
  await env.DB.prepare(
    "INSERT INTO media_items " +
      "(id, content_version_id, kind, url, title, start_seconds, end_seconds, sort_order) " +
      "VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)",
  )
    .bind(
      input.id,
      contentVersionId,
      input.kind,
      input.url,
      input.id,
      input.sortOrder ?? 0,
    )
    .run();
}

describe("published media repository", () => {
  it("returns only media attached to the requested published version", async () => {
    const published = await createWork("media-published");
    const draft = await createWork("media-draft");
    await insertMedia(published.versionId, {
      id: "published-youtube",
      kind: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    await insertMedia(draft.versionId, {
      id: "draft-youtube",
      kind: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(
      await listMediaForVersion(env.DB, published.versionId, r2Hosts),
    ).toEqual([]);

    await publishVersion(env.DB, published.versionId, "2026-08-19T00:00:00Z");

    expect(
      (await listMediaForVersion(env.DB, published.versionId, r2Hosts)).map(
        (item) => item.id,
      ),
    ).toEqual(["published-youtube"]);
    expect(await listMediaForVersion(env.DB, draft.versionId, r2Hosts)).toEqual(
      [],
    );
  });

  it("uses the parsed URL kind instead of trusting the stored kind", async () => {
    const draft = await createWork("media-kind-mismatch");
    await insertMedia(draft.versionId, {
      id: "kind-mismatch",
      kind: "external_link",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    await publishVersion(env.DB, draft.versionId, "2026-08-19T01:00:00Z");

    const items = await listMediaForVersion(env.DB, draft.versionId, r2Hosts);

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("youtube");
  });

  it("skips an unsafe stored URL without logging the URL", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const draft = await createWork("media-invalid-url");
    await insertMedia(draft.versionId, {
      id: "unsafe-media-id",
      kind: "external_link",
      url: "javascript:alert(secret-value)",
    });
    await publishVersion(env.DB, draft.versionId, "2026-08-19T02:00:00Z");

    expect(await listMediaForVersion(env.DB, draft.versionId, r2Hosts)).toEqual(
      [],
    );
    const logged = warning.mock.calls.flat().join(" ");
    expect(logged).toContain("unsafe-media-id");
    expect(logged).not.toContain("secret-value");
    warning.mockRestore();
  });
});
