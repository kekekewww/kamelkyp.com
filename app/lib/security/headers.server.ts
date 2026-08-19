export type DeploymentMode = "production" | "preview";

export function buildSecurityHeaders({
  nonce,
  mode,
}: {
  nonce: string;
  mode: DeploymentMode;
}): Headers {
  const headers = new Headers({
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      "frame-src https://www.youtube-nocookie.com https://drive.google.com https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      "media-src 'self' https:",
      "img-src 'self' https: data:",
      "font-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });

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
    pathname.includes("/commission/") ||
    pathname === "/api/commission/submit"
  );
}
