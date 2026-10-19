/**
 * Dependency contract (owner rule): every dependency is pinned to an exact
 * version, and every runtime dependency is imported by the app or the Worker.
 * An unused runtime dependency (like `wavesurfer.js`, wp6 c) only adds install
 * time and supply-chain surface. `package-lock.json` changes only through the
 * "Refresh lockfile" workflow.
 */
// `tsconfig.json` has no `resolveJsonModule`, so package.json is read from disk.
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

// Source text of every app and Worker module (TS/TSX are never blanked).
const sources = Object.values(
  import.meta.glob<string>(
    ["../../app/**/*.{ts,tsx}", "../../workers/**/*.{ts,tsx}"],
    { query: "?raw", import: "default", eager: true },
  ),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `from "name"`, `import "name/sub.css"`, `import("name")`; not `name-other`. */
function importPattern(name: string): RegExp {
  return new RegExp(
    `(?:from|import)\\s*\\(?\\s*"${escapeRegExp(name)}(?:/[^"]*)?"`,
  );
}

describe("dependency contract", () => {
  it("reads the manifest and the sources", () => {
    expect(Object.keys(manifest.dependencies).length).toBeGreaterThan(5);
    expect(sources.length).toBeGreaterThan(100);
  });

  it("pins every dependency exactly", () => {
    const loose = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })
      .filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version))
      .map(([name, version]) => `${name}@${version}`);
    expect(loose).toEqual([]);
  });

  it("imports every runtime dependency", () => {
    const unused = Object.keys(manifest.dependencies).filter((name) => {
      const pattern = importPattern(name);
      return !sources.some((source) => pattern.test(source));
    });
    expect(unused).toEqual([]);
  });

  it("does not let a longer package name satisfy a shorter one", () => {
    expect(
      importPattern("react").test('import { Link } from "react-router";'),
    ).toBe(false);
    expect(importPattern("react-dom").test('from "react-dom/server"')).toBe(
      true,
    );
    expect(
      importPattern("@fontsource-variable/archivo").test(
        'import "@fontsource-variable/archivo/wdth.css";',
      ),
    ).toBe(true);
  });
});
