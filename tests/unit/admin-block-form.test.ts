import { describe, expect, it } from "vitest";
import {
  parseAdminLinkGroup,
  parseAdminMediaInput,
} from "../../app/lib/admin/media-content-service.server";

const r2Hosts = new Set(["media.kamelkyp.com"]);

describe("URL-only admin media forms", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube"],
    ["https://drive.google.com/file/d/abc_123/view", "google_drive"],
    [
      "https://raw.githubusercontent.com/kamel/audio/main/demo.wav",
      "github_raw_audio",
    ],
    ["https://media.kamelkyp.com/demo.mp3", "cloudflare_r2_audio"],
    ["https://www.dropbox.com/s/example/demo.wav?dl=0", "external_link"],
    ["https://www.mediafire.com/file/example/demo", "external_link"],
    ["https://example.com/project", "external_link"],
  ])("classifies %s without downloading it", (url, kind) => {
    expect(parseAdminMediaInput({ url }, r2Hosts)).toMatchObject({ kind });
  });

  it("accepts optional metadata and no media at all", () => {
    expect(parseAdminMediaInput(null, r2Hosts)).toBeNull();
    expect(
      parseAdminMediaInput(
        {
          url: "https://example.com/work",
          title: "Work",
          description: "Description",
          thumbnailUrl: "https://example.com/cover.jpg",
          credit: "Kamel",
          publishedAt: "2026-08-19T00:00:00.000Z",
          tags: ["mix", "featured"],
        },
        r2Hosts,
      ),
    ).toMatchObject({ title: "Work", tags: ["mix", "featured"] });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://example.com/file.mp3",
    '<iframe src="https://example.com"></iframe>',
  ])("rejects unsafe media input %s", (url) => {
    expect(() => parseAdminMediaInput({ url }, r2Hosts)).toThrow();
  });

  it("rejects upload-like and raw HTML fields", () => {
    expect(() =>
      parseAdminMediaInput(
        { url: "https://example.com", file: new Blob(["secret"]) },
        r2Hosts,
      ),
    ).toThrow();
    expect(() =>
      parseAdminMediaInput(
        { url: "https://example.com", rawHtml: "<script>alert(1)</script>" },
        r2Hosts,
      ),
    ).toThrow();
  });

  it("keeps arbitrary-length validated link groups", () => {
    const group = parseAdminLinkGroup({
      key: "footer",
      label: { zh: "更多", en: "More" },
      links: Array.from({ length: 8 }, (_, index) => ({
        label: `Link ${index + 1}`,
        url: `https://example.com/${index + 1}`,
      })),
    });
    expect(group.links).toHaveLength(8);
  });
});
