import { describe, expect, it } from "vitest";
import {
  defaultSocialLabel,
  footerLinks,
  SOCIAL_PLATFORM_OPTIONS,
  socialPlatformName,
  socialUrlPlaceholder,
} from "../../app/components/studio/social/social-model";
import {
  SOCIAL_PLATFORMS,
  type SocialLink,
} from "../../app/lib/cms/schemas/social-link";

const link = (id: string, enabled: boolean): SocialLink => ({
  id,
  platform: "instagram",
  label: { zh: `標籤 ${id}`, en: `Label ${id}` },
  url: `https://instagram.com/${id}`,
  username: null,
  icon: null,
  enabled,
  sortOrder: 0,
});

describe("social links model", () => {
  it("names every platform the schema allows", () => {
    expect(SOCIAL_PLATFORM_OPTIONS.map((option) => option.value)).toEqual([
      ...SOCIAL_PLATFORMS,
    ]);
    expect(socialPlatformName("soundcloud")).toBe("SoundCloud");
  });

  it("suggests labels and address formats per platform", () => {
    expect(defaultSocialLabel("github")).toEqual({
      zh: "GitHub",
      en: "GitHub",
    });
    expect(defaultSocialLabel("email")).toEqual({
      zh: "電子郵件",
      en: "Email",
    });
    expect(defaultSocialLabel("other")).toEqual({ zh: "", en: "" });
    expect(socialUrlPlaceholder("email")).toBe("name@example.com");
    expect(socialUrlPlaceholder("spotify")).toBe("https://");
  });

  it("previews only enabled links, in order, per locale", () => {
    expect(
      footerLinks([link("a", true), link("b", false), link("c", true)], "en"),
    ).toEqual([
      { id: "a", label: "Label a", url: "https://instagram.com/a" },
      { id: "c", label: "Label c", url: "https://instagram.com/c" },
    ]);
    expect(footerLinks([link("a", true)], "zh")[0]?.label).toBe("標籤 a");
  });
});
