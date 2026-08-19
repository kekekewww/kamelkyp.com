import { z } from "zod";

const HttpsUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "https_required");

const Common = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    contacts: z
      .array(
        z
          .object({
            platform: z.string().trim().min(1).max(80),
            account: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    projectLinks: z.array(HttpsUrl).min(1).max(50),
    usagePurpose: z.string().trim().min(1).max(2000),
    desiredDate: z.string().trim().max(40),
    adultStatus: z.enum(["adult", "minor"]),
    guardianAuthorized: z.boolean(),
    studentRequested: z.boolean(),
    studentProofUrl: z.union([z.literal(""), HttpsUrl]),
    creditAccountId: z.string().trim().min(1).max(100),
    portfolioConsent: z.boolean(),
    rush: z.boolean(),
    sourcePrep: z.boolean(),
  })
  .strict();

const MixFields = {
  genre: z.string().trim().min(1).max(200),
  referenceUrls: z.array(HttpsUrl).min(1).max(20),
  bpm: z.string().trim().min(1).max(40),
  key: z.string().trim().min(1).max(80),
  direction: z.string().trim().min(1).max(4000),
};

const FullMix = Common.extend({
  serviceId: z.literal("full_mix"),
  ...MixFields,
});

const VocalMix = Common.extend({
  serviceId: z.literal("vocal_mix"),
  ...MixFields,
});

const SimpleTransition = Common.extend({
  serviceId: z.literal("simple_transition"),
  songs: z
    .array(
      z
        .object({
          order: z.number().int().positive(),
          url: HttpsUrl,
          transitionAt: z.string().trim().max(40),
        })
        .strict(),
    )
    .min(1)
    .max(100),
  sequenceConfirmed: z.boolean(),
  targetDuration: z.string().trim().min(1).max(40),
  seamless: z.boolean(),
  transitionStyle: z.string().trim().min(1).max(1000),
  consultation: z.boolean(),
});

const EditedTransition = Common.extend({
  serviceId: z.literal("edit_transition"),
  songs: z
    .array(
      z
        .object({
          order: z.number().int().positive(),
          url: HttpsUrl,
          segmentDuration: z.string().trim().min(1).max(40),
          transitionPoint: z.string().trim().min(1).max(40),
        })
        .strict(),
    )
    .min(1)
    .max(100),
  targetDuration: z.string().trim().min(1).max(40),
  transitionStyle: z.string().trim().min(1).max(1000),
  referenceUrls: z.array(HttpsUrl).max(20),
  cuts: z.string().trim().max(4000),
  reorderNotes: z.string().trim().max(4000),
  tempoPitchNotes: z.string().trim().max(4000),
  introOutroNotes: z.string().trim().max(4000),
  effectNotes: z.string().trim().max(4000),
});

export const CommissionDraftSchema = z
  .discriminatedUnion("serviceId", [
    FullMix,
    VocalMix,
    SimpleTransition,
    EditedTransition,
  ])
  .superRefine((draft, context) => {
    if (draft.adultStatus === "minor" && !draft.guardianAuthorized) {
      context.addIssue({
        code: "custom",
        path: ["guardianAuthorized"],
        message: "guardian_authorization_required",
      });
    }
    if (draft.studentRequested && !draft.studentProofUrl) {
      context.addIssue({
        code: "custom",
        path: ["studentProofUrl"],
        message: "student_proof_required",
      });
    }
    if (
      draft.serviceId === "simple_transition" &&
      (!draft.sequenceConfirmed ||
        draft.songs.some((song) => !song.transitionAt)) &&
      !draft.consultation
    ) {
      context.addIssue({
        code: "custom",
        path: ["consultation"],
        message: "consultation_required_without_sequence_and_points",
      });
    }
  });

export type CommissionDraft = z.infer<typeof CommissionDraftSchema>;
