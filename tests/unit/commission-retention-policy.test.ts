/**
 * Retention policy (site spec §16.3; plan 05 "does not auto-confirm seven-day
 * cleanup"; integration plan decision D7): the 7-day cleanup of a case's
 * temporary records stays owner-confirmed. The owner deletes the Google
 * Form, Sheet and Gmail copies by hand, then confirms the three-item
 * checklist in Studio → Commissions, which writes the Apps Script ledger
 * first. The nightly cron never confirms a cleanup.
 */
import { describe, expect, it } from "vitest";

// Source text of every app and Worker module, keyed by repository path.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      ["../../app/**/*.{ts,tsx}", "../../workers/**/*.{ts,tsx}"],
      { query: "?raw", import: "default", eager: true },
    ),
  ).map(([path, source]) => [path.replace(/^(\.\.\/)+/, ""), source]),
);

const worker = sources["workers/app.ts"] ?? "";

function referencing(pattern: RegExp): string[] {
  return Object.entries(sources)
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();
}

describe("commission retention policy", () => {
  it("reads the app and Worker sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(worker).not.toBe("");
  });

  it("keeps the nightly orphan cleanup in the cron", () => {
    expect(worker).toMatch(/\bdeleteOrphanAttempts\b/);
  });

  it("never confirms a case cleanup from the cron", () => {
    for (const name of [
      /\bconfirmVerifiedCleanup\b/,
      /\bconfirmCleanup\b/,
      /\bcleanupGoogleLedger\b/,
    ]) {
      expect(worker).not.toMatch(name);
    }
    expect(worker).not.toMatch(/cleanup-service\.server/);
    expect(worker).not.toMatch(/repositories\/commissions\.server/);
  });

  it("confirms cleanups only through the owner-confirmed paths", () => {
    const allowed = new Set([
      "app/lib/admin/cleanup-service.server.ts",
      "app/lib/cms/repositories/commissions.server.ts",
    ]);
    const callers = referencing(/\bconfirmVerifiedCleanup\b/);
    for (const path of callers) {
      expect(allowed.has(path), path).toBe(true);
    }
    expect(callers).toContain("app/lib/cms/repositories/commissions.server.ts");
  });

  it("never uses the checklist-free cleanup outside its definition", () => {
    expect(referencing(/\bconfirmCleanup\b/)).toEqual([
      "app/lib/cases/retention.server.ts",
    ]);
  });
});
