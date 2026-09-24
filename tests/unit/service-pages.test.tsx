import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ServiceChoice } from "../../app/components/services/service-choice";
import { ServiceOverview } from "../../app/components/services/service-overview";
import type { PublicServiceItem } from "../../app/lib/cms/public/view-models";
import {
  loader as publicLayoutLoader,
  meta as publicLayoutMeta,
} from "../../app/routes/public/layout";
import { fixtureSiteContext } from "./public-fixtures";

function render(element: React.ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
}

function service(
  overrides: Partial<PublicServiceItem> & Pick<PublicServiceItem, "name">,
): PublicServiceItem {
  return {
    id: `svc-${overrides.commissionServiceId ?? overrides.name}`,
    slug: "fixture-service",
    commissionServiceId: null,
    area: "mixing",
    group: { slug: "mixing", label: "Mixing" },
    shortDescription: "",
    description: [],
    priceMode: "starting_from",
    price: null,
    turnaround: "",
    revisions: "",
    deliverables: [],
    requirements: [],
    process: [],
    faq: [],
    inquirySubject: "",
    featured: false,
    todoContent: false,
    ...overrides,
  };
}

const FULL_MIX = service({
  commissionServiceId: "full_mix",
  name: "完整歌曲混音",
  shortDescription: "包含人聲、各式樂器、完整混音與母帶。",
  price: { amount: 8000, currency: "TWD" },
  turnaround: "7–14 個工作日",
  deliverables: ["24-bit / 48 kHz WAV Final Master", "Instrumental Mix Stem"],
});
const VOCAL_MIX = service({
  commissionServiceId: "vocal_mix",
  name: "Vocal 混音",
  price: { amount: 4000, currency: "TWD" },
  turnaround: "5–7 個工作日",
});

describe("service pages", () => {
  it("renders the services it is given, priced from the active rule", () => {
    const html = render(
      <ServiceChoice
        services={[FULL_MIX, VOCAL_MIX]}
        locale="zh"
        fxSnapshot={null}
      />,
    );

    expect(html).toContain('<section class="service-choice"');
    expect(html).toContain("完整歌曲混音");
    expect(html).toContain("Vocal 混音");
    expect(html).toContain("NT$8,000");
    expect(html).toContain('href="/zh/mixing/full"');
    expect(html).toContain('href="/zh/mixing/vocal"');
  });

  it("quotes a service without a price instead of inventing one", () => {
    const html = render(
      <ServiceChoice
        services={[service({ name: "Mastering", priceMode: "custom_quote" })]}
        locale="en"
        fxSnapshot={null}
      />,
    );
    expect(html).toContain("Mastering");
    expect(html).toContain("Contact for quote");
    expect(html).not.toMatch(/NT\$|US\$/);
  });

  it("renders the localized service details from the service view", () => {
    const html = render(
      <ServiceOverview
        service={FULL_MIX}
        category="mixing"
        locale="zh"
        fxSnapshot={null}
      />,
    );

    expect(html).toContain("完整歌曲混音");
    expect(html).toContain("NT$8,000");
    expect(html).toContain("7–14 個工作日");
    expect(html).toContain("Instrumental Mix Stem");
    expect(html).toContain('href="/zh/commission?service=full_mix"');
  });
});

describe("public locale layout", () => {
  it("falls back to the Kamel defaults when D1 is unavailable", async () => {
    const result = await publicLayoutLoader({
      params: { lang: "zh" },
    } as never);

    expect(result.locale).toBe("zh");
    expect(result.site.brand.brandName).toBe("Kamel");
    expect(result.site.footerGroups.map((group) => group.id)).toEqual([
      "navigate",
      "services",
      "legal",
    ]);
    expect(JSON.stringify(result.site)).not.toContain("mailto:");
  });

  it("rejects an unsupported public locale", async () => {
    await expect(
      publicLayoutLoader({ params: { lang: "fr" } } as never),
    ).rejects.toBeInstanceOf(Response);
  });

  it("builds the default head from brand and site settings", () => {
    const site = fixtureSiteContext();
    const tags = publicLayoutMeta({
      loaderData: { locale: "en", site },
      matches: [],
    } as never) as Array<Record<string, unknown>>;
    expect(tags[0]).toEqual({ title: site.site.siteTitle });
    expect(tags).toContainEqual({
      property: "og:site_name",
      content: "Kamel",
    });
  });
});
