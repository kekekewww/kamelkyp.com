import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockRenderer } from "../../app/components/content/block-renderer";

describe("block renderer", () => {
  it("renders content as escaped React text nodes", () => {
    const html = renderToStaticMarkup(
      <BlockRenderer
        blocks={[{ type: "paragraph", text: "<script>alert(1)</script>" }]}
      />,
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
