import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { AboutTeaser } from "../../app/components/home/about-teaser";
import { Capabilities } from "../../app/components/home/capabilities";
import { Hero } from "../../app/components/home/hero";
import { PricingPreview } from "../../app/components/home/pricing-preview";
import { Recognition } from "../../app/components/home/recognition";
import { SelectedWork } from "../../app/components/home/selected-work";
import { ServicesOverview } from "../../app/components/home/services-overview";
import { WritingPreview } from "../../app/components/home/writing-preview";
import { ContactBand } from "../../app/components/layout/contact-band";
import { SiteFooter } from "../../app/components/layout/site-footer";
import { SiteHeader } from "../../app/components/layout/site-header";
import { PlaybackProvider } from "../../app/components/media/playback-provider";
import {
  fixtureBrand,
  fixtureImage,
  fixtureProject,
  fixtureRecognition,
  fixtureSite,
  fixtureWriting,
} from "./public-fixtures";

/** Data router + playback provider, as the public layout renders them. */
function render(element: React.ReactNode) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <PlaybackProvider>{element}</PlaybackProvider>,
    },
  ]);
  return renderToStaticMarkup(<Stub />);
}

describe("home sections hide when their collection is empty", () => {
  it("renders nothing for every empty section", () => {
    expect(render(<SelectedWork items={[]} locale="en" />)).toBe("");
    expect(render(<Capabilities items={[]} locale="en" />)).toBe("");
    expect(render(<Recognition items={[]} locale="en" />)).toBe("");
    expect(render(<ServicesOverview areas={[]} locale="en" />)).toBe("");
    expect(
      render(<PricingPreview rows={[]} fxSnapshot={null} locale="en" />),
    ).toBe("");
    expect(render(<AboutTeaser body="" locale="en" />)).toBe("");
    expect(render(<WritingPreview items={[]} locale="en" />)).toBe("");
  });
});

describe("home sections render their data (no portfolio data in components)", () => {
  it("selected work shows one project without a list and badges nothing public", () => {
    const html = render(
      <SelectedWork
        items={[fixtureProject({ title: "Fixture Signal" })]}
        locale="en"
      />,
    );
    expect(html).toContain("Fixture Signal");
    expect(html).toContain('href="/en/works/fixture-project"');
    expect(html).toContain("AI");
    expect(html).not.toContain("project-list");
    expect(html).not.toContain("PLACEHOLDER");
  });

  it("selected work draws real covers with focal classes and no inline style", () => {
    const html = render(
      <SelectedWork
        items={[fixtureProject({ cover: fixtureImage() })]}
        locale="en"
      />,
    );
    expect(html).toContain('src="https://images.example.com/cover.jpg"');
    expect(html).toContain("focal-x-50 focal-y-25");
    expect(html).not.toMatch(/\sstyle="/);
  });

  it("capabilities, recognition, services and writing read their props", () => {
    const brand = fixtureBrand();
    expect(
      render(<Capabilities items={brand.capabilities} locale="en" />),
    ).toContain("Software Systems");
    const recognition = render(
      <Recognition
        items={[
          fixtureRecognition({ url: "https://events.example.com/fixture" }),
        ]}
        locale="en"
      />,
    );
    expect(recognition).toContain("Fixture Festival");
    expect(recognition).toContain('href="https://events.example.com/fixture"');
    const services = render(
      <ServicesOverview areas={fixtureSite().serviceAreas} locale="en" />,
    );
    expect(services).toContain('href="/en/mixing"');
    expect(services).toContain('href="/en/services/software"');
    expect(services).toContain("SERVICES / 03");
    const writing = render(
      <WritingPreview
        items={[
          fixtureWriting(),
          fixtureWriting({
            id: "writing-2",
            title: "Fixture Thread",
            platform: "threads",
            href: "https://www.threads.net/@kamel/post/1",
            external: true,
            hasDetail: false,
          }),
        ]}
        locale="en"
      />,
    );
    expect(writing).toContain('href="/en/writing/fixture-note"');
    expect(writing).toContain("Read on Threads");
  });

  it("pricing lists only the rows it is given", () => {
    const html = render(
      <PricingPreview
        rows={[
          { key: "mixing", name: "Mixing", twd: 4000 },
          { key: "software", name: "Software & Interactive", twd: null },
        ]}
        fxSnapshot={null}
        locale="zh"
      />,
    );
    expect(html).toContain("NT$4,000");
    expect(html).toContain("依專案報價");
    expect(html).not.toContain("Song Transition");
  });

  it("about teaser prints the short bio", () => {
    expect(render(<AboutTeaser body="Same ears." locale="en" />)).toContain(
      "Same ears.",
    );
  });
});

describe("brand identity comes from settings", () => {
  it("the hero shows the brand wordmark, roles and CTAs and no second name line", () => {
    const html = render(
      <Hero
        locale="en"
        brand={fixtureBrand({ brandName: "Kamel" })}
        showreel={null}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>Kamel<\/h1>/);
    expect(html).toContain("Creative Technologist");
    expect(html).toContain('href="/en/commission"');
    expect(html).toContain('href="/en/works"');
    expect(html).not.toContain("real-name");
  });

  it("the hero omits a CTA that has no label", () => {
    const html = render(
      <Hero
        locale="en"
        brand={fixtureBrand({ secondaryCta: null })}
        showreel={null}
      />,
    );
    expect(html).not.toContain('href="/en/works"');
  });

  it("header wordmark and footer read the brand and site settings", () => {
    const header = render(
      <SiteHeader
        locale="en"
        brandName="Kamel Studio"
        navigation={[
          { key: "work", visible: true },
          { key: "services", visible: true },
          { key: "about", visible: false },
          { key: "writing", visible: true },
        ]}
      />,
    );
    expect(header).toContain("Kamel Studio");
    expect(header).toContain('href="/en/works"');
    expect(header).not.toContain('href="/en/about"');

    const footer = render(
      <SiteFooter
        locale="en"
        groups={[]}
        brand={fixtureBrand({ contactEmail: "hello@example.com" })}
        site={fixtureSite({ copyright: "© 2026 Kamel" })}
      />,
    );
    expect(footer).toContain('href="mailto:hello@example.com"');
    expect(footer).toContain("© 2026 Kamel");
    expect(footer).toContain("Tell me what you want to make.");
    expect(footer).toContain("Taiwan / Remote");
  });

  it("footer and contact band omit the email link when none is set", () => {
    const footer = render(
      <SiteFooter
        locale="en"
        groups={[]}
        brand={fixtureBrand({ contactEmail: "" })}
        site={fixtureSite()}
      />,
    );
    expect(footer).not.toContain("mailto:");
    const band = render(
      <ContactBand locale="en" heading="Have a project in mind?" email="" />,
    );
    expect(band).not.toContain("mailto:");
    expect(band).toContain("Have a project in mind?");
  });
});
