import { describe, expect, it } from "vitest";
import {
  commissionServicePath,
  getCategoryServices,
  getService,
  SERVICE_CATALOG,
} from "../../app/lib/services/catalog";

describe("service catalog (structure only)", () => {
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

  it("maps each commission service to its fixed public route", () => {
    expect(commissionServicePath("full_mix")).toBe("/mixing/full");
    expect(commissionServicePath("vocal_mix")).toBe("/mixing/vocal");
    expect(commissionServicePath("simple_transition")).toBe(
      "/song-transition/simple",
    );
    expect(commissionServicePath("edit_transition")).toBe(
      "/song-transition/edit",
    );
    expect(getService("edit_transition").slug).toBe("edit");
  });

  it("holds no price or marketing copy (prices are the active price rule)", () => {
    for (const service of SERVICE_CATALOG) {
      expect(service).not.toHaveProperty("basePriceTwd");
      expect(service).not.toHaveProperty("shortDescription");
      expect(service).not.toHaveProperty("standardDays");
      expect(service).not.toHaveProperty("deliverables");
    }
  });
});
