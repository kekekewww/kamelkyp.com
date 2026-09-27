export type DeploymentMode = "production" | "preview";

/**
 * Header surface by path (admin-architecture §3.8):
 * - `studio`: /studio/* (except preview) and /api/studio/* — local `blob:`
 *   previews for uploads, may frame its own preview route;
 * - `studio-preview`: /studio/preview/* — public CSP, framable by the Studio;
 * - `public`: everything else (unchanged).
 */
export type SecuritySurface = "public" | "studio" | "studio-preview";

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function securitySurface(pathname: string): SecuritySurface {
  if (within(pathname, "/studio/preview")) return "studio-preview";
  if (within(pathname, "/studio") || within(pathname, "/api/studio")) {
    return "studio";
  }
  return "public";
}

export function buildSecurityHeaders({
  nonce,
  mode,
  surface = "public",
}: {
  nonce: string;
  mode: DeploymentMode;
  surface?: SecuritySurface;
}): Headers {
  const studio = surface === "studio";
  const headers = new Headers({
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      surface === "studio-preview"
        ? "frame-ancestors 'self'"
        : "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      studio
        ? "frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com"
        : "frame-src https://www.youtube-nocookie.com https://drive.google.com https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      studio ? "media-src 'self' https: blob:" : "media-src 'self' https:",
      studio
        ? "img-src 'self' https: data: blob:"
        : "img-src 'self' https: data:",
      "font-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });

  if (surface !== "public") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (mode === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return headers;
}

export function requiresNoStore(pathname: string, status: number): boolean {
  return (
    status >= 400 ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    within(pathname, "/studio") ||
    within(pathname, "/api/studio") ||
    pathname.includes("/commission/") ||
    pathname === "/api/commission/submit"
  );
}
