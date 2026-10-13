import { describe, expect, it } from "vitest";
import {
  deploymentMode,
  isIndexableRequest,
  PRODUCTION_ORIGIN,
  siteOrigin,
} from "../../app/lib/seo/origin.server";
import { buildRobotsTxt } from "../../app/lib/seo/robots";
import {
  buildSitemapXml,
  SITEMAP_STATIC_PATHS,
  xmlEscape,
} from "../../app/lib/seo/sitemap";
import {
  absoluteUrl,
  canonicalPath,
  HREFLANG,
  localeAlternates,
  X_DEFAULT_LOCALE,
} from "../../app/lib/seo/urls";

const PROD = "https://kamelkyp.com";
const PREVIEW = "https://kamelkyp-com-pr-7.example.workers.dev";

describe("seo url helpers", () => {
  it("strips a trailing slash but never the root, a query or a hash", () => {
    expect(canonicalPath("/en/works/")).toBe("/en/works");
    expect(canonicalPath("/zh")).toBe("/zh");
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("/en/works//")).toBe("/en/works");
    expect(absoluteUrl(PROD, "/en/works")).toBe(`${PROD}/en/works`);
  });

  it("matches <html lang> and the negotiation fallback", () => {
    expect(HREFLANG).toEqual({ zh: "zh-Hant", en: "en" });
    expect(X_DEFAULT_LOCALE).toBe("en");
  });

  it("lists zh-Hant, en and x-default (→ en) for a two-locale page", () => {
    expect(localeAlternates(PROD, "/zh/works/a", ["zh", "en"])).toEqual([
      { hrefLang: "zh-Hant", href: `${PROD}/zh/works/a` },
      { hrefLang: "en", href: `${PROD}/en/works/a` },
      { hrefLang: "x-default", href: `${PROD}/en/works/a` },
    ]);
    expect(localeAlternates(PROD, "/en/works/a/", ["en", "zh"])).toEqual([
      { hrefLang: "zh-Hant", href: `${PROD}/zh/works/a` },
      { hrefLang: "en", href: `${PROD}/en/works/a` },
      { hrefLang: "x-default", href: `${PROD}/en/works/a` },
    ]);
    expect(localeAlternates(PROD, "/en", ["zh", "en"])).toEqual([
      { hrefLang: "zh-Hant", href: `${PROD}/zh` },
      { hrefLang: "en", href: `${PROD}/en` },
      { hrefLang: "x-default", href: `${PROD}/en` },
    ]);
  });

  it("gives a one-locale page no alternates", () => {
    expect(localeAlternates(PROD, "/zh/works/a", ["zh"])).toEqual([]);
    expect(localeAlternates(PROD, "/en/works/a", [])).toEqual([]);
  });
});

describe("robots.txt", () => {
  it("disallows the private surfaces and names the sitemap on production", () => {
    const text = buildRobotsTxt({ indexable: true, origin: PROD });
    expect(text).toBe(
      [
        "User-agent: *",
        "Disallow: /admin",
        "Disallow: /api/",
        "Disallow: /language/",
        "Disallow: /studio",
        "",
        "Sitemap: https://kamelkyp.com/sitemap.xml",
        "",
      ].join("\n"),
    );
    expect(text).not.toContain("Disallow: /\n");
    expect(text).not.toContain("commission");
  });

  it("disallows everything on every other deployment", () => {
    expect(buildRobotsTxt({ indexable: false, origin: PREVIEW })).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });
});

describe("sitemap.xml", () => {
  it("writes one <url> per entry and locale, with alternates and lastmod", () => {
    const xml = buildSitemapXml(
      [
        { path: "", locales: ["zh", "en"], lastModified: null },
        {
          path: "/works/a",
          locales: ["zh"],
          lastModified: "2026-09-20T00:00:00Z",
        },
      ],
      PROD,
    );
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        "  <url>",
        "    <loc>https://kamelkyp.com/zh</loc>",
        '    <xhtml:link rel="alternate" hreflang="zh-Hant" href="https://kamelkyp.com/zh"/>',
        '    <xhtml:link rel="alternate" hreflang="en" href="https://kamelkyp.com/en"/>',
        '    <xhtml:link rel="alternate" hreflang="x-default" href="https://kamelkyp.com/en"/>',
        "  </url>",
        "  <url>",
        "    <loc>https://kamelkyp.com/en</loc>",
        '    <xhtml:link rel="alternate" hreflang="zh-Hant" href="https://kamelkyp.com/zh"/>',
        '    <xhtml:link rel="alternate" hreflang="en" href="https://kamelkyp.com/en"/>',
        '    <xhtml:link rel="alternate" hreflang="x-default" href="https://kamelkyp.com/en"/>',
        "  </url>",
        "  <url>",
        "    <loc>https://kamelkyp.com/zh/works/a</loc>",
        "    <lastmod>2026-09-20T00:00:00Z</lastmod>",
        "  </url>",
        "</urlset>",
        "",
      ].join("\n"),
    );
    expect(xml).not.toMatch(/changefreq|priority/);
  });

  it("escapes every text and attribute value", () => {
    expect(xmlEscape(`a&b<'">`)).toBe("a&amp;b&lt;&apos;&quot;&gt;");
    const xml = buildSitemapXml(
      [{ path: "/works/a&b", locales: ["en"], lastModified: null }],
      PROD,
    );
    expect(xml).toContain("<loc>https://kamelkyp.com/en/works/a&amp;b</loc>");
  });

  it("lists the static public paths, locale-less, home first", () => {
    expect(SITEMAP_STATIC_PATHS).toEqual([
      "",
      "/works",
      "/services",
      "/mixing",
      "/song-transition",
      "/services/software",
      "/about",
      "/writing",
      "/commission",
      "/terms",
      "/privacy",
    ]);
  });
});

describe("origin and deployment mode", () => {
  const prod = { APP_ORIGIN: PRODUCTION_ORIGIN };
  const preview = { APP_ORIGIN: PREVIEW };

  it("is indexable only on the production origin of the production Worker", () => {
    expect(PRODUCTION_ORIGIN).toBe(PROD);
    expect(isIndexableRequest(prod, `${PROD}/x`)).toBe(true);
    expect(deploymentMode(prod)).toBe("production");

    const workersDev = "https://kamelkyp-com.x.workers.dev/x";
    expect(siteOrigin(prod, workersDev)).toBe(PROD);
    expect(isIndexableRequest(prod, workersDev)).toBe(false);

    expect(siteOrigin(preview, `${PREVIEW}/en`)).toBe(PREVIEW);
    expect(isIndexableRequest(preview, `${PREVIEW}/en`)).toBe(false);
    expect(isIndexableRequest(preview, `${PROD}/en`)).toBe(false);
    expect(deploymentMode(preview)).toBe("preview");
  });

  it("falls back to the request origin when APP_ORIGIN does not parse", () => {
    const broken = { APP_ORIGIN: "nope" };
    expect(siteOrigin(broken, "http://127.0.0.1:8787/en")).toBe(
      "http://127.0.0.1:8787",
    );
    expect(isIndexableRequest(broken, `${PROD}/en`)).toBe(false);
    expect(deploymentMode(broken)).toBe("preview");
    expect(siteOrigin({ APP_ORIGIN: "ftp://x.example" }, `${PROD}/en`)).toBe(
      PROD,
    );
    expect(
      siteOrigin({ APP_ORIGIN: undefined as never }, "http://localhost:5173/"),
    ).toBe("http://localhost:5173");
  });

  it("strips a trailing slash from APP_ORIGIN", () => {
    expect(
      siteOrigin(
        { APP_ORIGIN: "http://127.0.0.1:5173/" },
        "http://127.0.0.1:5173/en",
      ),
    ).toBe("http://127.0.0.1:5173");
  });
});
