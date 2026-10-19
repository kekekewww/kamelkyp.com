import { describe, expect, expectTypeOf, it } from "vitest";
import {
  pageMeta,
  previewMeta,
  publicMeta,
  seoFromMatches,
  siteFromMatches,
} from "../../app/lib/cms/public/meta";
import { DEFAULT_OG_IMAGE } from "../../app/lib/seo/brand-assets";
import {
  fixtureBrand,
  fixtureImage,
  fixtureSite,
  fixtureSiteContext,
} from "./public-fixtures";

type Descriptor = Record<string, unknown>;

function find(tags: Descriptor[], key: string, value: string) {
  return tags.find((tag) => tag[key] === value);
}

describe("public meta", () => {
  it("uses the site title on home and '<page> — <brand>' elsewhere", () => {
    const site = fixtureSiteContext();
    expect(publicMeta({ site })[0]).toEqual({
      title: "Kamel — Sound, Software & Interactive Work",
    });
    const page = publicMeta({ site, title: "Work" }) as Descriptor[];
    expect(page[0]).toEqual({ title: "Work — Kamel" });
    expect(find(page, "property", "og:title")?.content).toBe("Work — Kamel");
  });

  it("reads description, site name and locale from settings", () => {
    const site = fixtureSiteContext({ locale: "zh" });
    const tags = publicMeta({ site }) as Descriptor[];
    expect(find(tags, "name", "description")?.content).toBe(
      "Kamel's work and services: mixing and software.",
    );
    expect(find(tags, "property", "og:description")?.content).toBe(
      "Kamel's work and services: mixing and software.",
    );
    expect(find(tags, "property", "og:site_name")?.content).toBe("Kamel");
    expect(find(tags, "property", "og:locale")?.content).toBe("zh_TW");
    expect(find(tags, "property", "og:type")?.content).toBe("website");
  });

  it("describes the site as one WebSite named after the brand, never a Person", () => {
    const site = fixtureSiteContext({
      brand: fixtureBrand({ brandName: "Kamel Studio" }),
    });
    const tags = publicMeta({ site, title: "About" }) as Descriptor[];
    const ld = tags.find((tag) => "script:ld+json" in tag)?.[
      "script:ld+json"
    ] as Record<string, unknown>;
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Kamel Studio",
      description: "Kamel's work and services.",
    });
    expect(JSON.stringify(tags)).not.toMatch(/"Person"|author/);
  });

  it("adds og:image only when an image exists (page image beats site image)", () => {
    const withoutImage = publicMeta({
      site: fixtureSiteContext(),
    }) as Descriptor[];
    expect(find(withoutImage, "property", "og:image")).toBeUndefined();
    expect(find(withoutImage, "name", "twitter:card")?.content).toBe("summary");

    const site = fixtureSiteContext({
      site: fixtureSite({
        ogImage: fixtureImage({ src: "https://images.example.com/og.png" }),
      }),
    });
    const siteImage = publicMeta({ site }) as Descriptor[];
    expect(find(siteImage, "property", "og:image")?.content).toBe(
      "https://images.example.com/og.png",
    );
    const pageImage = publicMeta({
      site,
      image: fixtureImage({ src: "https://images.example.com/page.jpg" }),
    }) as Descriptor[];
    expect(find(pageImage, "property", "og:image")?.content).toBe(
      "https://images.example.com/page.jpg",
    );
    expect(find(pageImage, "name", "twitter:card")?.content).toBe(
      "summary_large_image",
    );
  });

  it("links the favicon from brand settings and marks noindex pages", () => {
    const site = fixtureSiteContext({
      brand: fixtureBrand({
        favicon: {
          src: "https://media.example.com/icon.png",
          type: "image/png",
        },
      }),
    });
    const tags = publicMeta({ site, noindex: true }) as Descriptor[];
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "icon",
      href: "https://media.example.com/icon.png",
      type: "image/png",
    });
    expect(find(tags, "name", "robots")?.content).toBe("noindex");
  });

  it("falls back to the brand name when settings text is empty", () => {
    const site = fixtureSiteContext({
      site: fixtureSite({ siteTitle: "", seoDescription: "" }),
    });
    const tags = publicMeta({ site }) as Descriptor[];
    expect(tags[0]).toEqual({ title: "Kamel" });
    expect(find(tags, "name", "description")).toBeUndefined();
  });

  it("marks every preview page noindex,nofollow with a Studio title", () => {
    expect(previewMeta("Signal Garden")).toEqual([
      { title: "Preview: Signal Garden — KAMEL STUDIO" },
      { name: "robots", content: "noindex,nofollow" },
    ]);
    expect(previewMeta("")[0]).toEqual({
      title: "Preview: Untitled — KAMEL STUDIO",
    });
  });

  it("finds the site context in public and preview layout matches", () => {
    const site = fixtureSiteContext();
    expect(
      siteFromMatches([
        { id: "root", loaderData: undefined },
        { id: "routes/public/layout", loaderData: { locale: "en", site } },
      ]),
    ).toBe(site);
    expect(
      siteFromMatches([
        { id: "routes/studio/preview/layout", loaderData: { site } },
      ]),
    ).toBe(site);
    expect(siteFromMatches([{ id: "root", loaderData: null }])).toBeNull();
  });

  it("no longer accepts the (matches, page) call shape (WP4 K10)", () => {
    // Checked by the typecheck: a bare matches array is not a pageMeta input.
    expectTypeOf<Parameters<typeof siteFromMatches>[0]>().not.toExtend<
      Parameters<typeof pageMeta>[0]
    >();
  });
});

describe("public meta: canonical, hreflang, sharing and icons (WP4)", () => {
  const ORIGIN = "https://kamelkyp.com";
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

  function links(tags: Descriptor[], rel: string) {
    return tags.filter((tag) => tag.tagName === "link" && tag.rel === rel);
  }

  it("emits canonical, og:url, alternates and the JSON-LD url with an seo context", () => {
    const tags = publicMeta({
      site: fixtureSiteContext({ locale: "en" }),
      title: "Work",
      seo: { origin: ORIGIN, pathname: "/en/works/a/" },
    }) as Descriptor[];
    expect(links(tags, "canonical")).toEqual([
      { tagName: "link", rel: "canonical", href: `${ORIGIN}/en/works/a` },
    ]);
    expect(find(tags, "property", "og:url")?.content).toBe(
      `${ORIGIN}/en/works/a`,
    );
    expect(links(tags, "alternate")).toEqual([
      {
        tagName: "link",
        rel: "alternate",
        hrefLang: "zh-Hant",
        href: `${ORIGIN}/zh/works/a`,
      },
      {
        tagName: "link",
        rel: "alternate",
        hrefLang: "en",
        href: `${ORIGIN}/en/works/a`,
      },
      {
        tagName: "link",
        rel: "alternate",
        hrefLang: "x-default",
        href: `${ORIGIN}/en/works/a`,
      },
    ]);
    expect(
      tags
        .filter((tag) => tag.property === "og:locale:alternate")
        .map((tag) => tag.content),
    ).toEqual(["zh_TW"]);
    const ld = tags.find((tag) => "script:ld+json" in tag)?.[
      "script:ld+json"
    ] as Record<string, unknown>;
    expect(ld.url).toBe(`${ORIGIN}/en`);
    expect(tags[0]).toEqual({ title: "Work — Kamel" });
  });

  it("gives a one-locale page no alternates and no og:locale:alternate", () => {
    const tags = publicMeta({
      site: fixtureSiteContext({ locale: "en" }),
      title: "Audio",
      locales: ["en"],
      seo: { origin: ORIGIN, pathname: "/en/works/audio" },
    }) as Descriptor[];
    expect(links(tags, "canonical")).toHaveLength(1);
    expect(links(tags, "alternate")).toEqual([]);
    expect(find(tags, "property", "og:locale:alternate")).toBeUndefined();
  });

  it("keeps a noindex page out of canonical, alternates and og:url", () => {
    const tags = publicMeta({
      site: fixtureSiteContext(),
      title: "Hidden",
      noindex: true,
      seo: { origin: ORIGIN, pathname: "/en/works/hidden" },
    }) as Descriptor[];
    expect(find(tags, "name", "robots")?.content).toBe("noindex");
    expect(links(tags, "canonical")).toEqual([]);
    expect(links(tags, "alternate")).toEqual([]);
    expect(find(tags, "property", "og:url")).toBeUndefined();
    expect(find(tags, "property", "og:locale:alternate")).toBeUndefined();
  });

  it("falls back to the built-in Kamel card, absolute and localized", () => {
    const tags = publicMeta({
      site: fixtureSiteContext({ locale: "zh" }),
      title: "關於",
      seo: { origin: ORIGIN, pathname: "/zh/about" },
    }) as Descriptor[];
    expect(find(tags, "property", "og:image")?.content).toBe(
      `${ORIGIN}/og/kamel-default.png`,
    );
    expect(find(tags, "property", "og:image:width")?.content).toBe("1200");
    expect(find(tags, "property", "og:image:height")?.content).toBe("630");
    expect(find(tags, "property", "og:image:type")?.content).toBe("image/png");
    expect(find(tags, "property", "og:image:alt")?.content).toBe(
      DEFAULT_OG_IMAGE.alt.zh,
    );
    expect(find(tags, "name", "twitter:card")?.content).toBe(
      "summary_large_image",
    );
  });

  it("uses the OG image on home and the default social image elsewhere", () => {
    const site = fixtureSiteContext({
      site: fixtureSite({
        ogImage: fixtureImage({ src: "https://images.example.com/og.png" }),
        defaultSocialImage: fixtureImage({
          src: "https://images.example.com/social.png",
        }),
      }),
    });
    const home = publicMeta({ site }) as Descriptor[];
    expect(find(home, "property", "og:image")?.content).toBe(
      "https://images.example.com/og.png",
    );
    const page = publicMeta({ site, title: "Work" }) as Descriptor[];
    expect(find(page, "property", "og:image")?.content).toBe(
      "https://images.example.com/social.png",
    );
    const own = publicMeta({
      site,
      title: "Work",
      image: fixtureImage({ src: "https://images.example.com/page.jpg" }),
      seo: { origin: ORIGIN, pathname: "/en/works/a" },
    }) as Descriptor[];
    expect(find(own, "property", "og:image")?.content).toBe(
      "https://images.example.com/page.jpg",
    );
    expect(find(own, "property", "og:image:type")).toBeUndefined();
  });

  it("declares image dimensions only when they describe the emitted URL", () => {
    const site = fixtureSiteContext();
    const original = publicMeta({
      site,
      title: "Work",
      image: fixtureImage({ width: 1600, height: 1000 }),
    }) as Descriptor[];
    expect(find(original, "property", "og:image:width")?.content).toBe("1600");
    expect(find(original, "property", "og:image:height")?.content).toBe("1000");
    expect(find(original, "property", "og:image:alt")?.content).toBe(
      "Fixture cover",
    );

    const variant = publicMeta({
      site,
      title: "Work",
      image: fixtureImage({
        src: "https://media.example.com/cdn-cgi/image/width=1440/a.jpg",
        srcSet: "https://media.example.com/cdn-cgi/image/width=480/a.jpg 480w",
        width: 1600,
        height: 1000,
      }),
    }) as Descriptor[];
    expect(find(variant, "property", "og:image:width")).toBeUndefined();
    expect(find(variant, "property", "og:image:height")).toBeUndefined();
  });

  it("links the built-in icon, apple-touch-icon and manifest", () => {
    const tags = publicMeta({ site: fixtureSiteContext() }) as Descriptor[];
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "icon",
      href: "/icons/icon-32.png",
      type: "image/png",
      sizes: "32x32",
    });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "apple-touch-icon",
      href: "/apple-touch-icon.png",
    });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "manifest",
      href: "/manifest.webmanifest",
    });

    const branded = publicMeta({
      site: fixtureSiteContext({
        brand: fixtureBrand({
          favicon: {
            src: "https://media.example.com/icon.png",
            type: "image/png",
          },
        }),
      }),
    }) as Descriptor[];
    expect(links(branded, "icon")).toEqual([
      {
        tagName: "link",
        rel: "icon",
        href: "https://media.example.com/icon.png",
        type: "image/png",
      },
    ]);
    expect(links(branded, "manifest")).toHaveLength(1);
  });

  it("reads the seo context from the public layout only", () => {
    const site = fixtureSiteContext();
    const location = { pathname: "/en/about" };
    const publicTags = pageMeta(
      {
        matches: [
          { id: "root", loaderData: undefined },
          {
            id: "routes/public/layout",
            loaderData: { locale: "en", site, seo: { origin: ORIGIN } },
          },
        ],
        location,
      },
      { title: "About" },
    ) as Descriptor[];
    expect(links(publicTags, "canonical")[0]?.href).toBe(`${ORIGIN}/en/about`);

    const previewTags = pageMeta(
      {
        matches: [
          {
            id: "routes/studio/preview/layout",
            loaderData: { site, seo: { origin: ORIGIN } },
          },
        ],
        location,
      },
      { title: "About" },
    ) as Descriptor[];
    expect(links(previewTags, "canonical")).toEqual([]);

    expect(
      seoFromMatches([
        { id: "routes/public/layout", loaderData: { site, seo: null } },
      ]),
    ).toBeNull();
    expect(seoFromMatches([{ id: "root", loaderData: null }])).toBeNull();
    expect(
      seoFromMatches([
        { id: "routes/public/layout", loaderData: { seo: { origin: ORIGIN } } },
      ]),
    ).toEqual({ origin: ORIGIN });
  });

  it("never emits a Person, an author or an email address", () => {
    const tags = publicMeta({
      site: fixtureSiteContext(),
      title: "About",
      seo: { origin: ORIGIN, pathname: "/en/about" },
    });
    const serialized = JSON.stringify(tags);
    expect(serialized).not.toMatch(/"Person"|author/);
    expect(serialized).not.toMatch(EMAIL);
  });
});
