import { type APIResponse, expect } from "@playwright/test";

/**
 * A deployed Preview sits behind the Cloudflare Access application for the
 * Studio and admin paths (docs/runbooks/cloudflare-setup.md §5), so an
 * anonymous request is redirected to the Access login before the Worker sees
 * it. The loopback and dev servers have no Access in front of them, so the
 * Worker itself must refuse with 403. The preview workflow sets
 * E2E_ACCESS_GATE=1 for the deployed run only, with ACCESS_TEAM_DOMAIN: the
 * team whose JWTs the Worker accepts, so the only login it may redirect to.
 */
export const behindAccess = process.env.E2E_ACCESS_GATE === "1";

/** In the app's pages and data answers, never in Access's 302 stub. */
const APP_MARKERS = [
  "<script",
  "<main",
  "__reactRouter",
  "csrfToken",
  "seed-p-001",
];

function accessTeamOrigin(): string {
  let team: URL | null = null;
  try {
    team = new URL(process.env.ACCESS_TEAM_DOMAIN ?? "");
  } catch {
    team = null;
  }
  if (
    team?.protocol !== "https:" ||
    !team.hostname.endsWith(".cloudflareaccess.com")
  ) {
    throw new Error(
      "E2E_ACCESS_GATE=1 needs ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com",
    );
  }
  return team.origin;
}

/**
 * Behind Access: a 302 to the configured team's login for this hostname that
 * carries none of the app's markup or data. Otherwise: the Worker's 403.
 * Never cached either way. Make the request with `maxRedirects: 0`.
 */
export async function expectOwnerGate(response: APIResponse, label?: string) {
  if (behindAccess) {
    expect(response.status(), label).toBe(302);
    const location = new URL(
      response.headers().location ?? "",
      "https://invalid.example",
    );
    expect(location.origin, label).toBe(accessTeamOrigin());
    expect(location.pathname, label).toBe(
      `/cdn-cgi/access/login/${new URL(response.url()).hostname}`,
    );
    const body = await response.text();
    for (const marker of APP_MARKERS) {
      expect(body, label).not.toContain(marker);
    }
  } else {
    expect(response.status(), label).toBe(403);
  }
  expect(response.headers()["cache-control"], label).toContain("no-store");
}
