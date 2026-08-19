import { describe, expect, it } from "vitest";
import { CommissionDraftSchema } from "../../app/lib/commission/schema";

const common = {
  displayName: "Artist K",
  email: "artist@example.com",
  contacts: [{ platform: "Discord", account: "artist-k" }],
  projectLinks: ["https://drive.google.com/file/d/example/view"],
  usagePurpose: "Dance performance",
  desiredDate: "",
  adultStatus: "adult",
  guardianAuthorized: false,
  studentRequested: false,
  studentProofUrl: "",
  creditAccountId: "@artist-k",
  portfolioConsent: false,
  rush: false,
  sourcePrep: false,
};

describe("commission schema", () => {
  it("accepts full mix fields and allows unknown BPM or key", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "full_mix",
      genre: "Pop",
      referenceUrls: ["https://youtu.be/example"],
      bpm: "unknown",
      key: "unknown",
      direction: "Clear vocal and wide instruments",
    });
    expect(result.success).toBe(true);
  });

  it("requires guardian authorization for a minor", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "vocal_mix",
      adultStatus: "minor",
      genre: "Pop",
      referenceUrls: ["https://youtu.be/example"],
      bpm: "120",
      key: "C major",
      direction: "Natural",
    });
    expect(result.success).toBe(false);
  });

  it("requires student proof only when requesting the discount", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "simple_transition",
      studentRequested: true,
      songs: [
        {
          order: 1,
          url: "https://example.com/one.wav",
          transitionAt: "00:45",
        },
      ],
      targetDuration: "03:00",
      seamless: true,
      transitionStyle: "Smooth",
      sequenceConfirmed: true,
      consultation: false,
    });
    expect(result.success).toBe(false);
  });

  it("requires consultation when simple transition decisions are missing", () => {
    const input = {
      ...common,
      serviceId: "simple_transition",
      songs: [
        { order: 1, url: "https://example.com/one.wav", transitionAt: "" },
      ],
      sequenceConfirmed: false,
      targetDuration: "03:00",
      seamless: true,
      transitionStyle: "Smooth",
    };
    expect(
      CommissionDraftSchema.safeParse({ ...input, consultation: false })
        .success,
    ).toBe(false);
    expect(
      CommissionDraftSchema.safeParse({ ...input, consultation: true }).success,
    ).toBe(true);
  });

  it("requires all edited transition timing fields but not references", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "edit_transition",
      songs: [
        {
          order: 1,
          url: "https://example.com/song.wav",
          segmentDuration: "00:45",
          transitionPoint: "00:40",
        },
      ],
      targetDuration: "04:00",
      transitionStyle: "Energetic",
      referenceUrls: [],
      cuts: "",
      reorderNotes: "",
      tempoPitchNotes: "",
      introOutroNotes: "",
      effectNotes: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-HTTPS links, missing contacts and forbidden identity fields", () => {
    const base = {
      ...common,
      serviceId: "full_mix",
      genre: "Pop",
      referenceUrls: ["https://youtu.be/example"],
      bpm: "unknown",
      key: "unknown",
      direction: "Natural",
    };
    expect(
      CommissionDraftSchema.safeParse({
        ...base,
        projectLinks: ["http://example.com/source.wav"],
      }).success,
    ).toBe(false);
    expect(
      CommissionDraftSchema.safeParse({ ...base, contacts: [] }).success,
    ).toBe(false);
    expect(
      CommissionDraftSchema.safeParse({ ...base, birthday: "2000-01-01" })
        .success,
    ).toBe(false);
  });
});
