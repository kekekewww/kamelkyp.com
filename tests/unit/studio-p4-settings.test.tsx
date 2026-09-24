import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { BrandSettingsForm } from "../../app/components/studio/settings/brand-form";
import { SettingsIndex } from "../../app/components/studio/settings/settings-index";
import { SiteSettingsForm } from "../../app/components/studio/settings/site-form";
import { TaxonomyManager } from "../../app/components/studio/settings/taxonomy-manager";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import {
  type BrandSettings,
  DEFAULT_BRAND_SETTINGS,
} from "../../app/lib/cms/schemas/brand-settings";
import { DEFAULT_SITE_SETTINGS } from "../../app/lib/cms/schemas/site-settings";

function render(element: React.ReactNode, path = "/studio/settings/brand") {
  const Stub = createRoutesStub([
    {
      path,
      Component: () => (
        <StudioSessionProvider
          initial={{ csrfToken: "csrf", csrfExpiresAt: "", ownerEmail: "o" }}
        >
          <ToastProvider>{element}</ToastProvider>
        </StudioSessionProvider>
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

function brand(overrides: Partial<BrandSettings> = {}) {
  return {
    value: {
      ...structuredClone(DEFAULT_BRAND_SETTINGS),
      contactEmail: "owner@example.com",
      ...overrides,
    },
    revision: 3,
    updatedAt: "2026-09-24T00:00:00Z",
  };
}

describe("BrandSettingsForm", () => {
  it("shows the brand name and saves live", () => {
    const html = render(
      <BrandSettingsForm
        brand={brand()}
        contactNeedsReview={false}
        assets={{}}
        categories={[]}
      />,
    );
    expect(html).toContain('name="brandName"');
    expect(html).toContain('value="Kamel"');
    expect(html).toContain('name="expectedRevision" value="3"');
    expect(html).toContain("goes live immediately");
  });

  it("notes a personal name in the contact email without changing it", () => {
    const html = render(
      <BrandSettingsForm
        brand={brand()}
        contactNeedsReview
        assets={{}}
        categories={[]}
      />,
    );
    expect(html).toContain('value="owner@example.com"');
    expect(html).toContain("contains a personal name");
    expect(html).toContain("kamelkyp.com");
    expect(html).toContain('value="confirm-contact-email"');
    expect(html).toContain('id="contact"');
  });

  it("drops the note and the confirm button when the address is fine and confirmed", () => {
    const html = render(
      <BrandSettingsForm
        brand={brand({ contactEmailConfirmedAt: "2026-09-24T10:00:00Z" })}
        contactNeedsReview={false}
        assets={{}}
        categories={[]}
      />,
    );
    expect(html).not.toContain("contains a personal name");
    expect(html).not.toContain('value="confirm-contact-email"');
    expect(html).toContain("Confirmed 2026-09-24");
  });

  it("asks to review the copy migrated from the redesign", () => {
    const html = render(
      <BrandSettingsForm
        brand={brand()}
        contactNeedsReview={false}
        assets={{}}
        categories={[]}
      />,
    );
    expect(html).toContain('value="acknowledge-redesign-copy"');
    expect(html).toContain('id="review"');
  });
});

describe("SiteSettingsForm", () => {
  it("covers SEO images, contact, navigation, footer, availability and homepage", () => {
    const html = render(
      <SiteSettingsForm
        site={{
          value: structuredClone(DEFAULT_SITE_SETTINGS),
          revision: 1,
          updatedAt: "2026-09-24T00:00:00Z",
        }}
        contactEmail="owner@example.com"
        assets={{}}
      />,
      "/studio/settings/site",
    );
    expect(html).toContain("OpenGraph image");
    expect(html).toContain('name="ogImageId"');
    expect(html).toContain("Default social image");
    expect(html).toContain('name="defaultSocialImageId"');
    expect(html).toContain("owner@example.com");
    expect(html).toContain('href="/studio/settings/brand#contact"');
    expect(html).toContain('name="navigation.items.0.key"');
    expect(html).toContain('name="footerMessage.zh"');
    expect(html).toContain('name="copyright.en"');
    expect(html).toContain('name="availability.status"');
    expect(html).toContain('name="homepage.sections.showreel:bool"');
    expect(html).toContain('name="homepage.featuredProjectCount:number"');
    expect(html).toContain('name="homepage.writingCount:number"');
    expect(html).toContain('name="homepage.recognitionCount:number"');
  });
});

describe("SettingsIndex", () => {
  it("links the four settings screens", () => {
    const html = render(<SettingsIndex />, "/studio/settings");
    for (const href of [
      "/studio/settings/brand",
      "/studio/settings/site",
      "/studio/settings/taxonomies",
      "/studio/settings/footer",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});

describe("TaxonomyManager", () => {
  it("lists terms with usage and only offers delete for unused ones", () => {
    const html = render(
      <TaxonomyManager
        vocabulary="service_group"
        vocabularies={[
          { key: "project_category", label: "Project categories" },
          { key: "service_group", label: "Service groups" },
        ]}
        terms={[
          {
            id: "term-service_group-mixing",
            vocabulary: "service_group",
            slug: "mixing",
            label: { zh: "混音", en: "Mixing" },
            data: { area: "mixing" },
            sortOrder: 10,
            archivedAt: null,
            usage: 3,
          },
          {
            id: "term-service_group-new",
            vocabulary: "service_group",
            slug: "new",
            label: { zh: "新", en: "New" },
            data: { area: "software" },
            sortOrder: 20,
            archivedAt: null,
            usage: 0,
          },
        ]}
      />,
      "/studio/settings/taxonomies",
    );
    expect(html).toContain("Used by 3");
    expect(html).toContain("Not used");
    expect(html.match(/Delete/g)?.length).toBe(1);
    expect(html).toContain(
      'href="/studio/settings/taxonomies?vocabulary=project_category"',
    );
    expect(html).toContain('name="data.area"');
  });
});
