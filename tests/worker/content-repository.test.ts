import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createDraftVersion,
  getPublishedContent,
  publishVersion,
} from "../../app/lib/db/content-repository.server";

describe("content publication", () => {
  it("keeps the previous publication live until the draft is published", async () => {
    const first = await createDraftVersion(env.DB, {
      entryId: "home",
      kind: "page",
      slug: "home",
      locale: "zh",
      title: "第一版",
      summary: null,
      body: [{ type: "paragraph", text: "first" }],
    });
    await publishVersion(env.DB, first.versionId, "2026-08-10T00:00:00Z");

    const second = await createDraftVersion(env.DB, {
      entryId: "home",
      kind: "page",
      slug: "home",
      locale: "zh",
      title: "第二版草稿",
      summary: null,
      body: [{ type: "paragraph", text: "second" }],
    });

    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第一版");

    await publishVersion(env.DB, second.versionId, "2026-08-11T00:00:00Z");
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第二版草稿");
  });
});
