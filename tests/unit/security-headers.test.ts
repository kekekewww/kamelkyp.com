import { describe, expect, it } from "vitest";
import {
  buildSecurityHeaders,
  requiresNoStore,
} from "../../app/lib/security/headers.server";
import { createCspNonce } from "../../app/lib/security/csp-nonce.server";

describe("strict response security headers", () => {
  it("builds a nonce-only CSP with the approved media origins", () => {
    const headers = buildSecurityHeaders({ nonce: "nonce-value", mode: "production" });
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-nonce-value' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com https://drive.google.com https://challenges.cloudflare.com");
    expect(csp).toContain("connect-src 'self' https://challenges.cloudflare.com");
    expect(csp).toContain("media-src 'self' https:");
    expect(csp).toContain("img-src 'self' https: data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it("uses a different nonce per request and omits HSTS outside production", () => {
    expect(createCspNonce()).not.toBe(createCspNonce());
    expect(buildSecurityHeaders({ nonce: "preview", mode: "preview" }).has("Strict-Transport-Security")).toBe(false);
  });

  it("marks admin, commission, submission and errors no-store", () => {
    expect(requiresNoStore("/admin/content", 200)).toBe(true);
    expect(requiresNoStore("/zh/commission/mixing/full", 200)).toBe(true);
    expect(requiresNoStore("/api/commission/submit", 200)).toBe(true);
    expect(requiresNoStore("/zh/works/demo", 500)).toBe(true);
    expect(requiresNoStore("/zh/works/demo", 200)).toBe(false);
  });
});
