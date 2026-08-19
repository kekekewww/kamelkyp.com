import { describe, expect, it } from "vitest";
import { enforcePreviewBounds } from "../../app/components/media/direct-audio-preview";

describe("direct audio preview bounds", () => {
  it("continues only while playback stays inside the selected segment", () => {
    expect(enforcePreviewBounds(12, 12, 42)).toBe("continue");
    expect(enforcePreviewBounds(30, 12, 42)).toBe("continue");
    expect(enforcePreviewBounds(11.9, 12, 42)).toBe("stop");
    expect(enforcePreviewBounds(42, 12, 42)).toBe("stop");
  });

  it("supports an unbounded full-file preview", () => {
    expect(enforcePreviewBounds(0, null, null)).toBe("continue");
    expect(enforcePreviewBounds(500, null, null)).toBe("continue");
  });
});
