import { describe, expect, it } from "vitest";
import { createCaseId } from "../../app/lib/cases/case-id";

describe("Case ID", () => {
  it("contains a UTC date and non-sequential Crockford suffix", () => {
    const id = createCaseId(
      new Date("2026-08-10T12:00:00Z"),
      new Uint8Array([1, 31, 10, 20, 30, 5]),
    );
    expect(id).toMatch(/^KAM-20260810-[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it("rejects entropy that is not exactly six bytes", () => {
    expect(() =>
      createCaseId(new Date("2026-08-10T12:00:00Z"), new Uint8Array(5)),
    ).toThrow("case_id_entropy_invalid");
  });
});
