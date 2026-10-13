/**
 * Taipei time for the Studio and the public legal dates (client-safe).
 *
 * Asia/Taipei has no daylight saving time, so every conversion is fixed
 * +08:00 arithmetic. No `Intl` time-zone lookups: server render and
 * hydration always agree. Stored values stay UTC ISO strings; only entry
 * (`datetime-local`) and display use Taipei time.
 */

export const STUDIO_TIME_ZONE = "Asia/Taipei";

const OFFSET_MS = 8 * 60 * 60 * 1000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

/** The Taipei wall-clock parts of an instant; null for an unparsable value. */
function taipeiParts(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const local = new Date(time + OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

/**
 * A `datetime-local` value (`YYYY-MM-DDTHH:mm`) read as Taipei time → UTC
 * ISO string; null when malformed or not a real calendar time.
 */
export function taipeiLocalToIso(value: string): string | null {
  const match = LOCAL.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS;
  const parts = taipeiParts(new Date(utc).toISOString());
  if (
    !parts ||
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day
  ) {
    return null;
  }
  return new Date(utc).toISOString();
}

/** UTC ISO → `YYYY-MM-DDTHH:mm` in Taipei time (a `datetime-local` value). */
export function isoToTaipeiLocal(iso: string): string {
  const parts = taipeiParts(iso);
  if (!parts) return "";
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** UTC ISO → `YYYY-MM-DD HH:mm` (Taipei); the input itself when unparsable. */
export function formatTaipei(iso: string): string {
  const local = isoToTaipeiLocal(iso);
  return local ? local.replace("T", " ") : iso;
}

/** UTC ISO → the Taipei calendar day `YYYY-MM-DD`. */
export function taipeiDate(iso: string): string {
  const parts = taipeiParts(iso);
  if (!parts) return iso.slice(0, 10);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
