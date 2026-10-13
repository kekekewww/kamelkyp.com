/**
 * Percent ↔ basis points (client-safe). Rates are stored as integer basis
 * points; the Studio and the wizard show them as percent. Conversion uses
 * string and integer arithmetic only (`0.07 * 100` is not 7 in floating
 * point), so what the owner types is exactly what is stored.
 */

const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

/** "30" → 3000, "12.5" → 1250, "0.07" → 7; null unless 0-100 with ≤ 2 decimals. */
export function percentInputToBps(value: string): number | null {
  const text = value.trim();
  if (!PERCENT.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** 3000 → "30", 1250 → "12.5", 7 → "0.07" (no rounding). */
export function bpsToPercentLabel(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
