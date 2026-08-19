import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ServiceChoice } from "../../app/components/services/service-choice";
import { ServiceOverview } from "../../app/components/services/service-overview";
import { loader as publicLayoutLoader } from "../../app/routes/public/layout";

function render(element: React.ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
}

describe("service pages", () => {
  it("renders only mixing services in the mixing chooser", () => {
    const html = render(<ServiceChoice category="mixing" locale="zh" />);

    expect(html).toContain("完整歌曲混音");
    expect(html).toContain("Vocal 混音");
    expect(html).not.toContain("單純歌曲銜接");
    expect(html).not.toContain("編輯／剪輯歌曲銜接");
  });

  it("renders only transition services in the transition chooser", () => {
    const html = render(
      <ServiceChoice category="song_transition" locale="en" />,
    );

    expect(html).toContain("Simple Song Transition");
    expect(html).toContain("Edited Song Transition");
    expect(html).not.toContain("Full Song Mixing");
    expect(html).not.toContain("Vocal Mixing");
  });

  it("renders the approved localized service details", () => {
    const html = render(
      <ServiceOverview serviceId="full_mix" locale="zh" />,
    );

    expect(html).toContain("完整歌曲混音");
    expect(html).toContain("NT$8,000");
    expect(html).toContain("7–14 個工作日");
    expect(html).toContain("Instrumental Mix Stem");
  });
});

describe("public locale layout", () => {
  it("provides a supported locale to its child routes", () => {
    expect(publicLayoutLoader({ params: { lang: "zh" } } as never)).toEqual({
      locale: "zh",
    });
  });

  it("rejects an unsupported public locale", () => {
    expect(() =>
      publicLayoutLoader({ params: { lang: "fr" } } as never),
    ).toThrowError(Response);
  });
});
