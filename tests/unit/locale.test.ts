import { describe, expect, it } from "vitest";
import {
  getPreferredLocale,
  parseLocaleCookie,
} from "../../app/lib/i18n/locale-cookie.server";
import { localePath, switchLocalePath } from "../../app/lib/i18n/path";

describe("locale selection", () => {
  it("prefers an explicit cookie over Accept-Language", () => {
    expect(
      getPreferredLocale({
        cookieHeader: "kamel_locale=en",
        acceptLanguage: "zh-TW,zh;q=0.9",
      }),
    ).toBe("en");
  });

  it("uses zh only when the browser preference starts with zh", () => {
    expect(
      getPreferredLocale({ cookieHeader: null, acceptLanguage: "zh-TW" }),
    ).toBe("zh");
    expect(
      getPreferredLocale({ cookieHeader: null, acceptLanguage: "ja-JP" }),
    ).toBe("en");
  });

  it("rejects an invalid locale cookie", () => {
    expect(parseLocaleCookie("kamel_locale=fr")).toBeNull();
  });

  it("switches locale without changing the rest of the path", () => {
    expect(switchLocalePath("/zh/mixing/full", "en")).toBe(
      "/en/mixing/full",
    );
    expect(localePath("zh", "/works")).toBe("/zh/works");
  });
});
