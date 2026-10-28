import { type APIResponse, expect } from "@playwright/test";

/**
 * A deployed Preview sits behind the Cloudflare Access application for the
 * Studio and admin paths (docs/runbooks/cloudflare-setup.md §5), so an
 * anonymous request is redirected to the Access login before the Worker sees
 * it. The loopback and dev servers have no Access in front of them, so the
 * Worker itself must refuse with 403. The preview workflow sets
 * E2E_ACCESS_GATE=1 for the deployed run only.
 */
export const behindAccess = process.env.E2E_ACCESS_GATE === "1";

export function expectOwnerGate(response: APIResponse, label?: string) {
  if (behindAccess) {
    expect(response.status(), label).toBe(302);
    const location = response.headers().location ?? "";
    expect(
      new URL(location, "https://invalid.example").hostname,
      label,
    ).toMatch(/\.cloudflareaccess\.com$/);
  } else {
    expect(response.status(), label).toBe(403);
  }
  expect(response.headers()["cache-control"], label).toContain("no-store");
}
