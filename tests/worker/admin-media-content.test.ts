import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createDraft,
  ensureContentEntry,
  publishDraft,
} from "../../app/lib/admin/content-service.server";
import {
  replaceDraftMedia,
  replaceLinkGroup,
} from "../../app/lib/admin/media-content-service.server";
import { listFooterGroups } from "../../app/lib/content/footer-repository.server";
import { getPublishedContent } from "../../app/lib/db/content-repository.server";

describe("admin external media and links", () => {
  it("stores URL metadata only on drafts and keeps published versions immutable", async () => {
    await ensureContentEntry({
      db: env.DB,
      entryId: "empty-work",
      kind: "work",
      slug: "empty-work",
    });
    const draft = await createDraft({
      db: env.DB,
      entryId: "empty-work",
      locale: "zh",
    });
    await replaceDraftMedia({
      db: env.DB,
      versionId: draft.id,
      r2Hosts: new Set(["media.kamelkyp.com"]),
      items: [
        { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Video" },
        {
          url: "https://www.dropbox.com/s/example/demo.wav",
          title: "Download",
        },
      ],
    });
    const stored = await env.DB.prepare(
      "SELECT kind, url, title FROM media_items WHERE content_version_id = ? ORDER BY sort_order",
    )
      .bind(draft.id)
      .all<{ kind: string; url: string; title: string }>();
    expect(stored.results.map((item) => item.kind)).toEqual([
      "youtube",
      "external_link",
    ]);

    await publishDraft({
      db: env.DB,
      versionId: draft.id,
      now: new Date("2026-08-19T00:00:00Z"),
    });
    expect(
      await getPublishedContent(env.DB, "work", "empty-work", "zh"),
    ).toMatchObject({ title: "", body: [] });
    await expect(
      replaceDraftMedia({
        db: env.DB,
        versionId: draft.id,
        r2Hosts: new Set(),
        items: [],
      }),
    ).rejects.toThrow("draft_version_not_found");
  });

  it("publishes more than three Footer links and skips empty groups", async () => {
    await replaceLinkGroup({
      db: env.DB,
      group: {
        key: "footer",
        label: { zh: "更多", en: "More" },
        links: Array.from({ length: 8 }, (_, index) => ({
          label: `Link ${index + 1}`,
          url: `https://example.com/${index + 1}`,
        })),
      },
    });
    await replaceLinkGroup({
      db: env.DB,
      group: { key: "social", label: { zh: "社群", en: "Social" }, links: [] },
    });
    const groups = await listFooterGroups(env.DB, "zh");
    expect(groups.find((group) => group.label === "更多")?.links).toHaveLength(
      8,
    );
    expect(groups.some((group) => group.label === "社群")).toBe(false);
  });
});
