import { describe, expect, it } from "vitest";
import {
  isNavSectionActive,
  legacyWritingTarget,
} from "../../app/lib/i18n/path";
import { loader } from "../../app/routes/public/other-redirect";

describe("legacy /other redirect", () => {
  it("maps legacy paths to writing, keeping locale, slug and query", () => {
    expect(legacyWritingTarget("/zh/other", "?x=1")).toBe("/zh/writing?x=1");
    expect(legacyWritingTarget("/en/other/abc")).toBe("/en/writing/abc");
    expect(legacyWritingTarget("/en/other/")).toBe("/en/writing");
    expect(legacyWritingTarget("/en/works")).toBeNull();
    expect(legacyWritingTarget("/fr/other")).toBeNull();
  });

  it("answers with a 301", () => {
    const response = loader({
      request: new Request("https://kamelkyp.com/zh/other?x=1"),
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/zh/writing?x=1");

    const detail = loader({
      request: new Request("https://kamelkyp.com/en/other/abc"),
    });
    expect(detail.headers.get("location")).toBe("/en/writing/abc");
  });
});

describe("primary navigation active state", () => {
  it("follows the IA prefixes", () => {
    expect(isNavSectionActive("/zh", "home")).toBe(true);
    expect(isNavSectionActive("/zh/works", "home")).toBe(false);
    expect(isNavSectionActive("/en/works/sample-x", "work")).toBe(true);
    expect(isNavSectionActive("/en/mixing/full", "services")).toBe(true);
    expect(isNavSectionActive("/en/song-transition", "services")).toBe(true);
    expect(isNavSectionActive("/en/services/software", "services")).toBe(true);
    expect(isNavSectionActive("/en/writing/hello", "writing")).toBe(true);
    expect(isNavSectionActive("/en/workshop", "work")).toBe(false);
    expect(isNavSectionActive("/en/commission", "cta")).toBe(true);
    expect(isNavSectionActive("/en/commission/mixing", "cta")).toBe(false);
  });
});
