import { describe, expect, it } from "vitest";
import { SERVICE_IDS, isServiceId } from "../../app/lib/services/service-id";

describe("ServiceId contract", () => {
  it("contains exactly the four approved services", () => {
    expect(SERVICE_IDS).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
  });

  it("rejects values outside the stable service identifiers", () => {
    expect(isServiceId("full_mix")).toBe(true);
    expect(isServiceId("mastering_only")).toBe(false);
  });
});
