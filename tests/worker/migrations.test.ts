import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("D1 schema privacy boundary", () => {
  it("does not create PII columns in cases", async () => {
    const rows = await env.DB.prepare("PRAGMA table_info(cases)").all<{
      name: string;
    }>();
    const names = rows.results.map((row) => row.name);

    expect(names).toEqual([
      "case_id",
      "service_id",
      "locked_price_minor",
      "currency",
      "submitted_at",
      "status",
    ]);
  });
});
