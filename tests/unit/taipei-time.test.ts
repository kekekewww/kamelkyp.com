import { describe, expect, it } from "vitest";
import { formatLegalDate } from "../../app/components/legal/legal-document";
import { serializeForm } from "../../app/components/studio/ui/editor-state";
import {
  formatTaipei,
  isoToTaipeiLocal,
  STUDIO_TIME_ZONE,
  taipeiDate,
  taipeiLocalToIso,
} from "../../app/lib/time/taipei";

describe("Taipei time helpers", () => {
  it("names the Studio time zone", () => {
    expect(STUDIO_TIME_ZONE).toBe("Asia/Taipei");
  });

  it("reads a datetime-local value at +08:00", () => {
    expect(taipeiLocalToIso("2027-01-01T00:00")).toBe(
      "2026-12-31T16:00:00.000Z",
    );
    expect(taipeiLocalToIso("2099-01-01T00:00")).toBe(
      "2098-12-31T16:00:00.000Z",
    );
    expect(taipeiLocalToIso("2026-10-13T18:02")).toBe(
      "2026-10-13T10:02:00.000Z",
    );
  });

  it("refuses malformed or impossible values", () => {
    for (const value of [
      "",
      "2027-01-01",
      "2027-01-01 00:00",
      "2027-1-1T00:00",
      "2027-02-30T00:00",
      "2027-13-01T00:00",
      "2027-01-01T24:00",
      "2027-01-01T00:60",
      "2027-01-01T00:00:00",
      "tomorrow",
    ]) {
      expect(taipeiLocalToIso(value), value).toBeNull();
    }
  });

  it("round-trips through the datetime-local format", () => {
    for (const value of [
      "2027-01-01T00:00",
      "2026-10-13T07:59",
      "2026-12-31T23:30",
    ]) {
      const iso = taipeiLocalToIso(value);
      expect(iso).not.toBeNull();
      expect(isoToTaipeiLocal(iso as string)).toBe(value);
    }
    expect(isoToTaipeiLocal("2026-10-12T17:30:00.000Z")).toBe(
      "2026-10-13T01:30",
    );
  });

  it("formats Studio times and Taipei calendar days", () => {
    expect(formatTaipei("2026-08-10T00:00:00Z")).toBe("2026-08-10 08:00");
    expect(formatTaipei("2098-12-31T16:00:00.000Z")).toBe("2099-01-01 00:00");
    expect(taipeiDate("2026-10-12T17:30:00.000Z")).toBe("2026-10-13");
    expect(taipeiDate("2026-10-12T15:59:59.000Z")).toBe("2026-10-12");
    expect(taipeiDate("2026-08-10T00:00:00Z")).toBe("2026-08-10");
  });

  it("prints the legal effective date as the Taipei calendar day", () => {
    expect(formatLegalDate("2026-08-10T00:00:00Z")).toBe("2026.08.10");
    expect(formatLegalDate("2026-10-12T17:30:00.000Z")).toBe("2026.10.13");
  });

  it("never treats the legal review checkbox as form content", () => {
    const without = new FormData();
    without.append("clauses.0.key", "deposit");
    without.append("clauses.0.title", "Deposit");
    const withBox = new FormData();
    withBox.append("clauses.0.key", "deposit");
    withBox.append("legalReviewConfirmed", "on");
    withBox.append("clauses.0.title", "Deposit");
    expect(serializeForm(withBox)).toBe(serializeForm(without));
  });
});
