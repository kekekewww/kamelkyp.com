/**
 * Relative time for Studio lists ("5 min ago", "yesterday", "2 Sep").
 * Pure and deterministic: the loader passes its own `now`, so the server
 * render and the hydrated client print the same words.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY);
}

export function relativeTime(iso: string, nowIso: string): string {
  const then = new Date(iso);
  const now = new Date(nowIso);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return "";
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  const days = dayNumber(now) - dayNumber(then);
  if (days === 0) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const label = `${then.getUTCDate()} ${MONTHS[then.getUTCMonth()]}`;
  return then.getUTCFullYear() === now.getUTCFullYear()
    ? label
    : `${label} ${then.getUTCFullYear()}`;
}
