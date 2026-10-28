/**
 * Legal documents and their expected clause keys (client-safe). Keys and
 * English Studio topics only, never legal text: the Studio warns when an
 * expected clause is missing, and the owner's legal reviewer has the last
 * word. Keys follow the commission terms outline (design spec §11-14).
 */
import type { ServiceId } from "../services/service-id";

export const TERM_DOCUMENT_IDS = [
  "common",
  "privacy",
  "full-mix",
  "vocal-mix",
  "simple-transition",
  "edit-transition",
] as const;

export type TermDocumentId = (typeof TERM_DOCUMENT_IDS)[number];

export function isTermDocumentId(value: string): value is TermDocumentId {
  return (TERM_DOCUMENT_IDS as readonly string[]).includes(value);
}

/** The service document each commission service needs (plus common + privacy). */
export const SERVICE_TERM_DOCUMENT: Record<ServiceId, TermDocumentId> = {
  full_mix: "full-mix",
  vocal_mix: "vocal-mix",
  simple_transition: "simple-transition",
  edit_transition: "edit-transition",
};

export const TERM_DOCUMENT_SERVICE: Partial<Record<TermDocumentId, ServiceId>> =
  {
    "full-mix": "full_mix",
    "vocal-mix": "vocal_mix",
    "simple-transition": "simple_transition",
    "edit-transition": "edit_transition",
  };

export type OutlineItem = { key: string; topic: string };

const MIXING_SOURCE: OutlineItem = {
  key: "mixing_source",
  topic: "Mixing source material",
};
const TRANSITION_COMMON: OutlineItem[] = [
  { key: "transition_delivery", topic: "Sources and delivery" },
  { key: "schedule_adjustment", topic: "Schedule and rush" },
];

export const TERM_OUTLINE: Record<TermDocumentId, readonly OutlineItem[]> = {
  common: [
    { key: "payment_methods", topic: "Payment methods" },
    { key: "deposit", topic: "Deposit and start of work" },
    { key: "final_payment", topic: "Final payment" },
    { key: "minor_revisions", topic: "Minor revisions" },
    { key: "major_revisions", topic: "Major revisions" },
    { key: "client_cancellation", topic: "Client cancellation" },
    {
      key: "provider_delay_completed",
      topic: "Provider delay with completion",
    },
    { key: "provider_failure", topic: "Provider cannot complete" },
    { key: "client_inactivity", topic: "Client inactivity" },
    { key: "queue_and_timing", topic: "Queue and timing" },
    { key: "delivery_and_retention", topic: "Delivery and retention" },
    { key: "project_file_purchase", topic: "Project files" },
    { key: "ownership", topic: "Ownership" },
    { key: "confidentiality", topic: "Confidentiality" },
    { key: "credit_and_portfolio", topic: "Credit and portfolio" },
    { key: "progress_contact", topic: "Progress contact" },
    {
      key: "purpose_no_price_effect",
      topic: "Purpose does not affect the quote",
    },
  ],
  privacy: [],
  "full-mix": [
    { key: "full_mix", topic: "Full song mixing scope" },
    MIXING_SOURCE,
  ],
  "vocal-mix": [
    { key: "vocal_mix", topic: "Vocal mixing scope" },
    MIXING_SOURCE,
  ],
  "simple-transition": [
    { key: "simple_transition", topic: "Simple transition scope" },
    ...TRANSITION_COMMON,
  ],
  "edit-transition": [
    { key: "edit_transition", topic: "Edited transition scope" },
    ...TRANSITION_COMMON,
  ],
};
