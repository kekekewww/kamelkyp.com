import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getStudioCounts } from "../../app/lib/cms/studio/attention.server";
import { insertProject, publishViaView } from "../helpers/cms";

describe("studio sidebar counts", () => {
  it("counts the seeded brand confirmations as needing attention", async () => {
    const counts = await getStudioCounts(env.DB);
    // contact email unconfirmed + redesign copy unacknowledged + no showreel
    expect(counts.attention).toBeGreaterThanOrEqual(3);
    expect(counts.pendingCommissions).toBeGreaterThanOrEqual(0);
  });

  it("adds published entries whose working copy has unpublished changes", async () => {
    const before = await getStudioCounts(env.DB);
    const id = await insertProject(env.DB);
    await publishViaView(env.DB, "projects", id);
    const published = await getStudioCounts(env.DB);
    await env.DB.prepare(
      "UPDATE projects SET revision = revision + 1 WHERE id = ?",
    )
      .bind(id)
      .run();
    const changed = await getStudioCounts(env.DB);
    expect(changed.attention).toBe(published.attention + 1);
    // publishing a non-featured project never lowers the count
    expect(published.attention).toBeGreaterThanOrEqual(before.attention);
  });
});
