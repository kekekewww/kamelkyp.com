const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createCaseId(now: Date, entropy: Uint8Array): string {
  if (entropy.length !== 6) throw new Error("case_id_entropy_invalid");
  if (Number.isNaN(now.getTime())) throw new Error("case_id_date_invalid");

  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  let value = 0n;
  for (const byte of entropy) value = (value << 8n) | BigInt(byte);

  let suffix = "";
  for (let index = 0; index < 10; index += 1) {
    suffix = CROCKFORD[Number(value & 31n)] + suffix;
    value >>= 5n;
  }
  return `KAM-${date}-${suffix}`;
}

export function createRandomCaseId(now = new Date()): string {
  return createCaseId(now, crypto.getRandomValues(new Uint8Array(6)));
}
