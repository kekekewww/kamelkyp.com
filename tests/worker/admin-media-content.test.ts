import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { replaceLinkGroup } from "../../app/lib/admin/media-content-service.server";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import { createTestEnv } from "../helpers/test-env";

// The legacy /admin/links writer, live until Studio -> Footer (wp3) replaces
// it; the legacy media half was retired with /admin/works (wp5 §4.7).
describe("legacy footer link groups", () => {
  it("shows more than three Footer links publicly and skips empty groups", async () => {
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
    // The public footer (site context) composes D1 link groups with the code
    // structure; the legacy "social" group is replaced by social_links.
    const { footerGroups: groups } = await getPublicSiteContext(
      env.DB,
      createTestEnv({ DB: env.DB }),
      "zh",
    );
    expect(groups.find((group) => group.label === "更多")?.links).toHaveLength(
      8,
    );
    expect(groups.some((group) => group.label === "社群")).toBe(false);
  });
});
