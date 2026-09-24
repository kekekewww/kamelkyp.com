import { describe, expect, it } from "vitest";
import { createCspNonce } from "../../app/lib/security/csp-nonce.server";
import {
  buildSecurityHeaders,
  requiresNoStore,
  securitySurface,
} from "../../app/lib/security/headers.server";

describe("strict response security headers", () => {
  it("builds a nonce-only CSP with the approved media origins", () => {
    const headers = buildSecurityHeaders({
      nonce: "nonce-value",
      mode: "production",
    });
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain(
      "script-src 'self' 'nonce-nonce-value' https://challenges.cloudflare.com",
    );
    expect(csp).toContain(
      "frame-src https://www.youtube-nocookie.com https://drive.google.com https://challenges.cloudflare.com",
    );
    expect(csp).toContain(
      "connect-src 'self' https://challenges.cloudflare.com",
    );
    expect(csp).toContain("media-src 'self' https:");
    expect(csp).toContain("img-src 'self' https: data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
  });

  it("uses a different nonce per request and omits HSTS outside production", () => {
    expect(createCspNonce()).not.toBe(createCspNonce());
    expect(
      buildSecurityHeaders({ nonce: "preview", mode: "preview" }).has(
        "Strict-Transport-Security",
      ),
    ).toBe(false);
  });

  it("marks admin, commission, submission and errors no-store", () => {
    expect(requiresNoStore("/admin/content", 200)).toBe(true);
    expect(requiresNoStore("/zh/commission/mixing/full", 200)).toBe(true);
    expect(requiresNoStore("/api/commission/submit", 200)).toBe(true);
    expect(requiresNoStore("/zh/works/demo", 500)).toBe(true);
    expect(requiresNoStore("/zh/works/demo", 200)).toBe(false);
  });

  it("marks every Studio page, API and preview response no-store", () => {
    expect(requiresNoStore("/studio", 200)).toBe(true);
    expect(requiresNoStore("/studio/projects", 200)).toBe(true);
    expect(requiresNoStore("/studio/preview/home", 200)).toBe(true);
    expect(requiresNoStore("/api/studio/session", 200)).toBe(true);
    expect(requiresNoStore("/studios", 200)).toBe(false);
  });
});

describe("Studio header surfaces", () => {
  it("derives the surface from the path", () => {
    expect(securitySurface("/studio")).toBe("studio");
    expect(securitySurface("/studio/projects/abc")).toBe("studio");
    expect(securitySurface("/api/studio/media-search")).toBe("studio");
    expect(securitySurface("/studio/preview/projects/abc")).toBe(
      "studio-preview",
    );
    expect(securitySurface("/studio/preview")).toBe("studio-preview");
    expect(securitySurface("/en/studio")).toBe("public");
    expect(securitySurface("/studios")).toBe("public");
    expect(securitySurface("/zh")).toBe("public");
  });

  it("allows local previews and the preview frame only on Studio pages", () => {
    const headers = buildSecurityHeaders({
      nonce: "n",
      mode: "production",
      surface: "studio",
    });
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("img-src 'self' https: data: blob:");
    expect(csp).toContain("media-src 'self' https: blob:");
    expect(csp).toContain(
      "frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com",
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("lets only the Studio frame preview responses", () => {
    const headers = buildSecurityHeaders({
      nonce: "n",
      mode: "preview",
      surface: "studio-preview",
    });
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("img-src 'self' https: data:;");
    expect(csp).not.toContain("blob:");
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("keeps public responses indexable and unframeable", () => {
    const headers = buildSecurityHeaders({ nonce: "n", mode: "production" });
    expect(headers.has("X-Robots-Tag")).toBe(false);
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
