import { describe, expect, it } from "vitest";
import { parseMediaUrl } from "../../app/lib/media/parse-media-url";

const productionR2Hosts = new Set(["media.kamelkyp.com"]);

const defaultOptions = {
  startSeconds: null,
  endSeconds: null,
  r2Hosts: productionR2Hosts,
};

describe("media URL parser", () => {
  it("creates a privacy-enhanced YouTube embed with preview bounds", () => {
    expect(
      parseMediaUrl("https://youtu.be/dQw4w9WgXcQ", {
        startSeconds: 12,
        endSeconds: 42,
        r2Hosts: productionR2Hosts,
      }),
    ).toEqual({
      kind: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl:
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=12&end=42&autoplay=0",
      provider: "youtube",
    });
  });

  it("classifies Google Drive without trusting arbitrary Drive paths", () => {
    expect(
      parseMediaUrl(
        "https://drive.google.com/file/d/1Example-File_Id/view?usp=sharing",
        defaultOptions,
      ),
    ).toEqual({
      kind: "google_drive",
      canonicalUrl:
        "https://drive.google.com/file/d/1Example-File_Id/view?usp=sharing",
      embedUrl:
        "https://drive.google.com/file/d/1Example-File_Id/preview",
      provider: "google_drive",
    });
  });

  it("classifies GitHub Raw and the approved R2 custom host as audio", () => {
    expect(
      parseMediaUrl(
        "https://raw.githubusercontent.com/kekekewww/audio/main/demo.wav",
        defaultOptions,
      ).kind,
    ).toBe("github_raw_audio");

    expect(
      parseMediaUrl(
        "https://media.kamelkyp.com/showreel/demo.mp3",
        defaultOptions,
      ).kind,
    ).toBe("cloudflare_r2_audio");
  });

  it("keeps MediaFire as an external link", () => {
    expect(
      parseMediaUrl(
        "https://www.mediafire.com/file/abc/demo/file",
        defaultOptions,
      ),
    ).toMatchObject({ kind: "external_link", embedUrl: null });
  });

  it("rejects dangerous, insecure and credential-bearing URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "http://example.com/demo.mp3",
      "https://user:password@example.com/demo.mp3",
    ]) {
      expect(() => parseMediaUrl(value, defaultOptions)).toThrow(
        "https_required",
      );
    }
  });

  it("rejects an end time that is not after the start time", () => {
    expect(() =>
      parseMediaUrl("https://youtu.be/dQw4w9WgXcQ", {
        startSeconds: 30,
        endSeconds: 20,
        r2Hosts: productionR2Hosts,
      }),
    ).toThrow("invalid_preview_range");
  });
});
