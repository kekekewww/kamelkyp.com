import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("cloud project configuration", () => {
  it("keeps SSR enabled and the Worker entry explicit", async () => {
    const routerConfig = await readFile("react-router.config.ts", "utf8");
    const wranglerConfig = JSON.parse(
      await readFile("wrangler.base.jsonc", "utf8"),
    );

    expect(routerConfig).toContain("ssr: true");
    expect(wranglerConfig.main).toBe("./workers/app.ts");
    expect(wranglerConfig.compatibility_flags).toContain("nodejs_compat");
  });

  it("keeps production D1 identifiers out of the committed base config", async () => {
    const wranglerConfig = JSON.parse(
      await readFile("wrangler.base.jsonc", "utf8"),
    );

    expect(wranglerConfig.d1_databases[0]).not.toHaveProperty("database_id");
  });
});
