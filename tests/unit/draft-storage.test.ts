import { describe, expect, it } from "vitest";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type DraftStorage,
} from "../../app/lib/commission/draft.client";
import type { CommissionDraft } from "../../app/lib/commission/schema";

function memoryStorage(): DraftStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const draft: CommissionDraft = {
  serviceId: "full_mix",
  displayName: "Artist K",
  email: "artist@example.com",
  contacts: [{ platform: "Discord", account: "artist-k" }],
  projectLinks: ["https://drive.google.com/file/d/example/view"],
  usagePurpose: "Single release",
  desiredDate: "",
  adultStatus: "adult",
  guardianAuthorized: false,
  studentRequested: false,
  studentProofUrl: "",
  creditAccountId: "@artist-k",
  portfolioConsent: false,
  rush: false,
  sourcePrep: false,
  genre: "Pop",
  referenceUrls: ["https://youtu.be/example"],
  bpm: "unknown",
  key: "unknown",
  direction: "Clear vocal",
};

describe("local-only commission drafts", () => {
  it("isolates drafts by locale and service", () => {
    const storage = memoryStorage();
    saveDraft("en", draft, storage);

    expect(loadDraft("en", "full_mix", storage)).toEqual(draft);
    expect(loadDraft("zh", "full_mix", storage)).toBeNull();
    expect(loadDraft("en", "vocal_mix", storage)).toBeNull();
  });

  it("clears only the selected locale and service", () => {
    const storage = memoryStorage();
    saveDraft("en", draft, storage);
    saveDraft("zh", draft, storage);
    clearDraft("en", "full_mix", storage);

    expect(loadDraft("en", "full_mix", storage)).toBeNull();
    expect(loadDraft("zh", "full_mix", storage)).toEqual(draft);
  });

  it("removes corrupt or obsolete values without exposing them", () => {
    const storage = memoryStorage();
    storage.setItem("kamel:commission:v1:en:full_mix", "{not-json");
    expect(loadDraft("en", "full_mix", storage)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("stores no verification token, acceptance time or case id", () => {
    const storage = memoryStorage();
    saveDraft("en", draft, storage);
    const serialized = [...storage.values.values()][0] ?? "";
    expect(serialized).not.toContain("turnstile");
    expect(serialized).not.toContain("termsAcceptedAt");
    expect(serialized).not.toContain("caseId");
  });
});
