const SCALE = 100_000_000n;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseRateScaled(rate: string): number {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new Error("invalid_fx_rate");
  const [whole, fraction = ""] = rate.split(".");
  const padded = `${fraction}00000000`.slice(0, 8);
  const scaled = BigInt(whole) * SCALE + BigInt(padded);
  if (scaled <= 0n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("invalid_fx_rate");
  }
  return Number(scaled);
}

export function convertTwdToUsdCents(twd: number, rateScaled: number): number {
  if (!Number.isInteger(twd) || twd < 0) throw new Error("invalid_twd");
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) {
    throw new Error("invalid_fx_rate");
  }
  const numerator = BigInt(twd) * BigInt(rateScaled) * 100n;
  return Number((numerator + SCALE / 2n) / SCALE);
}

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error("invalid_fx_date");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("invalid_fx_date");
  }
  return date;
}

export function businessDaysBetween(from: string, to: string): number {
  const start = parseDate(from);
  const end = parseDate(to);
  if (start > end) throw new Error("invalid_fx_date_range");

  let count = 0;
  for (
    let cursor = new Date(start.getTime() + 86_400_000);
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}
