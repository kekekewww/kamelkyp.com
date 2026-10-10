import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PreviewBar } from "../../app/components/layout/preview-bar";

describe("preview bar", () => {
  it("says the page is not published and keeps the query when switching locale", () => {
    const html = renderToStaticMarkup(
      <PreviewBar locale="en" search="?locale=en&drafts=1" />,
    );
    expect(html).toContain("Preview · not published");
    expect(html).toContain('href="?locale=zh&amp;drafts=1"');
    expect(html).toMatch(/href="\?locale=en&amp;drafts=1" aria-current="page"/);
    expect(html).toContain('href="/studio"');
    expect(html).toContain("Links on this page open the live site.");
    expect(html).not.toMatch(/\sstyle="/);
  });

  it("defaults to adding the locale when the URL has no query", () => {
    const html = renderToStaticMarkup(<PreviewBar locale="zh" search="" />);
    expect(html).toContain('href="?locale=en"');
    expect(html).toMatch(/href="\?locale=zh" aria-current="page"/);
  });
});
