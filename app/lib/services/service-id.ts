export const SERVICE_IDS = [
  "full_mix",
  "vocal_mix",
  "simple_transition",
  "edit_transition",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export function isServiceId(value: string): value is ServiceId {
  return (SERVICE_IDS as readonly string[]).includes(value);
}
