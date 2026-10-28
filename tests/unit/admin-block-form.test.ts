import { describe, expect, it } from "vitest";
import { parseAdminLinkGroup } from "../../app/lib/admin/media-content-service.server";

// The legacy /admin/links form parser, live until Studio -> Footer (wp3)
// replaces it; the media form half was retired with /admin/works.
describe("legacy footer link group form", () => {
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
