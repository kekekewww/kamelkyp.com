import { type APIResponse, expect } from "@playwright/test";

/*
 * Owner-only surfaces (/studio*, /api/studio/*, /admin*) refuse an anonymous
 * request. Nothing stands in front of the loopback Worker, so there the app's
 * own refusal is the only acceptable answer. A deployed preview sits behind
 * Cloudflare Access, which answers those paths before the Worker runs; there
 * the one other acceptable answer is Access failing closed: a redirect to the
 * login of the configured team domain that carries no app HTML or data.
 * Nothing else passes, a 200 least of all.
 */
const LOOPBACK = process.env.E2E_LOOPBACK === "1";

const REDIRECTS = [302, 303];

/** Present in every page or data answer of the app, never in Access's stub. */
const APP_MARKERS = [
  "Kamel",
  "<script",
  "<main",
  "__reactRouter",
  "csrfToken",
  "seed-p-001",
];

function accessTeamOrigin(): string {
  const configured = process.env.ACCESS_TEAM_DOMAIN;
  if (!configured) {
    throw new Error(
      "ACCESS_TEAM_DOMAIN must name the Access team domain (https://<team>.cloudflareaccess.com)",
    );
  }
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".cloudflareaccess.com")
  ) {
    throw new Error(
      "ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com",
    );
  }
  return url.origin;
}

async function expectAccessLoginRedirect(response: APIResponse, label: string) {
  expect(REDIRECTS, `${label} status`).toContain(response.status());
  const headers = response.headers();
  const location = headers.location ?? "";
  let target: URL | null = null;
  try {
    target = new URL(location);
  } catch {
    target = null;
  }
  expect(target?.origin, `${label} Location`).toBe(accessTeamOrigin());
  expect(target?.pathname, `${label} Location`).toMatch(
    /^\/cdn-cgi\/access\/login\//,
  );
  expect(headers["cache-control"], `${label} cache-control`).toContain(
    "no-store",
  );
  expect(headers["content-type"] ?? "", `${label} content-type`).not.toMatch(
    /json/i,
  );
  const body = await response.text();
  expect(body.length, `${label} body`).toBeLessThan(1024);
  for (const marker of APP_MARKERS) {
    expect(body, `${label} body`).not.toContain(marker);
  }
}

/**
 * `appRefusal` holds the app's own refusal assertions and runs unchanged on
 * loopback. On a deployed preview a redirect must instead be Access's login
 * redirect; any other answer still has to pass `appRefusal`. Requests must be
 * made with `maxRedirects: 0`.
 */
export async function expectOwnerOnlyRefusal(
  response: APIResponse,
  appRefusal: (response: APIResponse) => void | Promise<void>,
  label = new URL(response.url()).pathname,
) {
  if (!LOOPBACK && REDIRECTS.includes(response.status())) {
    await expectAccessLoginRedirect(response, label);
    return;
  }
  await appRefusal(response);
}
