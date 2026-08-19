import { describe, expect, it } from "vitest";
import {
  getCategoryServices,
  getService,
} from "../../app/lib/services/catalog";

describe("service catalog", () => {
  it("shows only two mixing choices", () => {
    expect(getCategoryServices("mixing").map((service) => service.id)).toEqual([
      "full_mix",
      "vocal_mix",
    ]);
  });

  it("shows only two transition choices", () => {
    expect(
      getCategoryServices("song_transition").map((service) => service.id),
    ).toEqual(["simple_transition", "edit_transition"]);
  });

  it("keeps approved TWD base prices", () => {
    expect(getService("full_mix").basePriceTwd).toBe(8000);
    expect(getService("vocal_mix").basePriceTwd).toBe(4000);
    expect(getService("simple_transition").basePriceTwd).toBe(1000);
    expect(getService("edit_transition").basePriceTwd).toBe(4000);
  });
});
