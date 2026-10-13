/**
 * Public SEO basics (WP4 §6.3): robots.txt, sitemap.xml, head tags, static
 * brand assets and deployment-level noindex. The loopback is a preview
 * deployment by construction (its APP_ORIGIN is the preview origin), so
 * robots.txt disallows everything and every Worker response carries
 * `X-Robots-Tag`, while the HTML head is exactly what production serves.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";
import { personalNameHits } from "./helpers/brand";

const loopback = process.env.E2E_LOOPBACK === "1";
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1] ?? "",
  );
}

/** The configured origin, read from the sitemap (it is not the loopback host). */
async function siteOrigin(request: APIRequestContext): Promise<string> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const [first] = locs(xml);
  expect(first, "sitemap has a <loc>").toBeTruthy();
  return new URL(first ?? "").origin;
}

test("robots.txt disallows everything outside production", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body).toBe("User-agent: *\nDisallow: /\n");
  expect(body).not.toContain("Sitemap:");
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(personalNameHits(body)).toEqual([]);
});

test("sitemap.xml lists published, listed public pages in their locales", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/xml");
  const xml = await response.text();
  expect(xml.startsWith("<?xml")).toBe(true);
  expect(personalNameHits(xml)).toEqual([]);

  const urls = locs(xml);
  expect(urls.length).toBeGreaterThan(20);
  const origins = new Set(urls.map((url) => new URL(url).origin));
  expect(origins.size).toBe(1);
  const [origin] = [...origins];
  expect(origin).toMatch(/^https:\/\//);
  expect(origin).not.toContain("127.0.0.1");

  const paths = urls.map((url) => new URL(url).pathname);
  for (const path of [
    "/zh",
    "/en",
    "/en/works",
    "/zh/services",
    "/en/mixing/full",
    "/zh/song-transition/edit",
    "/en/services/software",
    "/en/about",
    "/zh/writing",
    "/en/commission",
    "/en/terms",
    "/zh/privacy",
    "/en/works/fixture-signal-map",
    "/zh/works/fixture-signal-map",
    "/en/writing/fixture-building-notes",
  ]) {
    expect(paths, path).toContain(path);
  }
  for (const fragment of [
    "fixture-draft-project",
    "fixture-draft-note",
    "fixture-thread-on-mixing",
    "audio-test",
    "media-test",
    "fixture-old-signal-map",
    "sample-",
    "/studio",
    "/admin",
    "/api/",
    "/commission/",
  ]) {
    expect(
      urls.filter((url) => url.includes(fragment)),
      fragment,
    ).toEqual([]);
  }

  const zhEntry = xml
    .split("<url>")
    .find((chunk) =>
      chunk.includes(`<loc>${origin}/zh/works/fixture-signal-map</loc>`),
    );
  expect(zhEntry).toBeDefined();
  expect(zhEntry).toContain(
    `<xhtml:link rel="alternate" hreflang="zh-Hant" href="${origin}/zh/works/fixture-signal-map"/>`,
  );
  expect(zhEntry).toContain(
    `<xhtml:link rel="alternate" hreflang="en" href="${origin}/en/works/fixture-signal-map"/>`,
  );
  expect(zhEntry).toContain(
    `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/en/works/fixture-signal-map"/>`,
  );
});

test("a bilingual project carries canonical, hreflang, og:url and its own image", async ({
  page,
  request,
}) => {
  const origin = await siteOrigin(request);
  const url = `${origin}/en/works/fixture-signal-map`;
  await page.goto("/en/works/fixture-signal-map");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    url,
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="zh-Hant"]'),
  ).toHaveAttribute("href", `${origin}/zh/works/fixture-signal-map`);
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]'),
  ).toHaveAttribute("href", url);
  await expect(
    page.locator('link[rel="alternate"][hreflang="x-default"]'),
  ).toHaveAttribute("href", url);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    url,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://media.kamelkyp.com/e2e/cover.jpg",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1600",
  );
  await expect(
    page.locator('meta[property="og:image:height"]'),
  ).toHaveAttribute("content", "1000");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("a filtered work index canonicalizes to the bare path", async ({
  page,
  request,
}) => {
  const origin = await siteOrigin(request);
  await page.goto("/zh/works?category=ai");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/zh/works`,
  );
});

test("a case or percent-encoded spelling canonicalizes to the lowercase path", async ({
  request,
}) => {
  // React Router matches segments case-insensitively and after decoding, so
  // these render; their head must point to the one lowercase URL. (Requested
  // without a browser, which would normalize the escape before sending.)
  const origin = await siteOrigin(request);
  for (const [path, canonical] of [
    ["/en/Works/fixture-signal-map", "/en/works/fixture-signal-map"],
    ["/en/%61bout", "/en/about"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head, path).toContain(
      `rel="canonical" href="${origin}${canonical}"`,
    );
    expect(head, path).toContain(
      `property="og:url" content="${origin}${canonical}"`,
    );
    const siteUrls = [...head.matchAll(/"(https?:\/\/[^"]+)"/g)]
      .map((match) => match[1] ?? "")
      .filter((url) => url.startsWith(`${origin}/`));
    expect(siteUrls.length, path).toBeGreaterThan(2);
    expect(
      siteUrls.filter((url) => /[A-Z%]/.test(url.slice(origin.length))),
      path,
    ).toEqual([]);
  }
});

test("an unlisted, one-locale project is noindex without canonical or alternates", async ({
  page,
}) => {
  const response = await page.goto("/en/works/audio-test");
  expect(response?.status()).toBe(200);
  await expect(
    page.locator('meta[name="robots"][content="noindex"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
});

test("commission workflow pages are noindex; the landing page is canonical", async ({
  page,
  request,
}) => {
  const origin = await siteOrigin(request);
  for (const path of ["/en/commission/mixing", "/en/commission/mixing/full"]) {
    await page.goto(path);
    await expect(
      page.locator('meta[name="robots"][content="noindex"]'),
      path,
    ).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(0);
  }
  await page.goto("/en/commission");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/en/commission`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("a page without an image of its own shares the built-in Kamel card", async ({
  page,
  request,
}) => {
  // Site settings decide this; the owner may set an OG image on a deployed
  // preview, so it is asserted on the loopback only.
  test.skip(!loopback, "depends on the seeded site settings");
  const origin = await siteOrigin(request);
  await page.goto("/en/about");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${origin}/og/kamel-default.png`,
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(
    page.locator('meta[property="og:image:height"]'),
  ).toHaveAttribute("content", "630");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const image = await request.get("/og/kamel-default.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
});

test("the web app manifest and icons are served", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/json/);
  const body = await response.text();
  expect(personalNameHits(body)).toEqual([]);
  const manifest = JSON.parse(body) as {
    name: string;
    icons: Array<{ src: string }>;
  };
  expect(manifest.name).toBe("Kamel");
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const path of [
    ...manifest.icons.map((icon) => icon.src),
    "/apple-touch-icon.png",
    "/icons/icon-32.png",
  ]) {
    const icon = await request.get(path);
    expect(icon.status(), path).toBe(200);
    expect(icon.headers()["content-type"], path).toContain("image/png");
  }
  expect((await request.get("/favicon.ico")).status()).toBe(200);
});

test("public pages link the manifest and are noindex on a preview deployment", async ({
  request,
}) => {
  const response = await request.get("/en");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const html = await response.text();
  expect(html).toContain('rel="manifest"');
  expect(html).toContain('rel="apple-touch-icon"');

  const ld = [
    ...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g),
  ].map((match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>);
  expect(ld.length).toBeGreaterThan(0);
  for (const object of ld) {
    for (const key of ["email", "author", "sameAs"]) {
      expect(object, key).not.toHaveProperty(key);
    }
    for (const value of Object.values(object)) {
      if (typeof value === "string") expect(value).not.toMatch(EMAIL);
    }
  }
});

test("error pages are noindex and carry no canonical", async ({ request }) => {
  const response = await request.get("/en/not-a-real-page");
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).toContain('name="robots" content="noindex"');
  expect(html).not.toContain('rel="canonical"');
});
