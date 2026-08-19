export const COMMISSION_STEPS = [
  "details",
  "terms",
  "review",
  "verify",
] as const;

export type CommissionStep = (typeof COMMISSION_STEPS)[number];

export function nextStep(current: CommissionStep): CommissionStep {
  return COMMISSION_STEPS[
    Math.min(COMMISSION_STEPS.indexOf(current) + 1, COMMISSION_STEPS.length - 1)
  ];
}

export function previousStep(current: CommissionStep): CommissionStep {
  return COMMISSION_STEPS[Math.max(COMMISSION_STEPS.indexOf(current) - 1, 0)];
}
