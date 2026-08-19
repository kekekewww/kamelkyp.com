import { describe, expect, it } from "vitest";
import { loader as languagePreferenceLoader } from "../../app/routes/language-preference";
import { loader as languageRedirectLoader } from "../../app/routes/language-redirect";

describe("language routes", () => {
  it("redirects the root with the locale cookie taking priority", () => {
    const response = languageRedirectLoader({
      request: new Request("https://kamelkyp.com/", {
        headers: {
          "accept-language": "zh-TW,zh;q=0.9",
          cookie: "kamel_locale=en",
        },
      }),
    } as never);

    expect(response.headers.get("location")).toBe("/en");
  });

  it("stores a valid preference and returns to a local path", () => {
    const response = languagePreferenceLoader({
      params: { locale: "en" },
      request: new Request(
        "https://kamelkyp.com/language/en?returnTo=%2Fen%2Fmixing%2Ffull",
      ),
    } as never);

    expect(response.headers.get("location")).toBe("/en/mixing/full");
    expect(response.headers.get("set-cookie")).toContain("kamel_locale=en");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("does not redirect a preference request to another origin", () => {
    const response = languagePreferenceLoader({
      params: { locale: "zh" },
      request: new Request(
        "https://kamelkyp.com/language/zh?returnTo=https%3A%2F%2Fevil.example",
      ),
    } as never);

    expect(response.headers.get("location")).toBe("/zh");
  });

  it("rejects unsupported locale preferences", () => {
    expect(() =>
      languagePreferenceLoader({
        params: { locale: "fr" },
        request: new Request("https://kamelkyp.com/language/fr"),
      } as never),
    ).toThrowError(Response);
  });
});
