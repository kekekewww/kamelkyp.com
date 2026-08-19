export const REQUIRED_COMMON_TERM_KEYS = [
  "payment_methods",
  "deposit",
  "final_payment",
  "minor_revisions",
  "major_revisions",
  "client_cancellation",
  "provider_delay_completed",
  "provider_failure",
  "client_inactivity",
  "queue_and_timing",
  "delivery_and_retention",
  "project_file_purchase",
  "ownership",
  "confidentiality",
  "credit_and_portfolio",
  "progress_contact",
  "purpose_no_price_effect",
] as const;

export const REQUIRED_SERVICE_TERM_KEYS = [
  "full_mix",
  "vocal_mix",
  "mixing_source",
  "simple_transition",
  "edit_transition",
  "transition_delivery",
  "schedule_adjustment",
] as const;
