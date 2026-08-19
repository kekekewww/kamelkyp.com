import { describe, expect, it } from "vitest";
import { ContentBlocksSchema } from "../../app/lib/content/block-schema";

describe("safe content blocks", () => {
  it("accepts text and HTTPS external resources", () => {
    expect(
      ContentBlocksSchema.safeParse([
        { type: "heading", level: 2, text: "Title" },
        {
          type: "external_link",
          url: "https://example.com",
          label: "Open",
        },
        {
          type: "external_image",
          url: "https://example.com/image.jpg",
          alt: "Example",
          caption: null,
        },
      ]).success,
    ).toBe(true);
  });

  it("rejects raw HTML, scripts and non-HTTPS URLs", () => {
    expect(
      ContentBlocksSchema.safeParse([
        { type: "html", value: "<script>alert(1)</script>" },
      ]).success,
    ).toBe(false);
    expect(
      ContentBlocksSchema.safeParse([
        {
          type: "external_link",
          url: "javascript:alert(1)",
          label: "Bad",
        },
      ]).success,
    ).toBe(false);
    expect(
      ContentBlocksSchema.safeParse([
        {
          type: "external_image",
          url: "http://example.com/image.jpg",
          alt: "Insecure",
          caption: null,
        },
      ]).success,
    ).toBe(false);
  });
});
