import { describe, expect, it } from "vitest";
import {
  previewMeta,
  publicMeta,
  siteFromMatches,
} from "../../app/lib/cms/public/meta";
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
});
