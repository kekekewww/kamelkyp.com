import { businessDaysBetween, parseRateScaled } from "./fx";

export interface FxSnapshot {
  rateDate: string;
  rateScaled: number;
  scale: 100_000_000;
  source: "Frankfurter";
  fetchedAt: string;
}

interface FxRow {
  rate_date: string;
  rate_scaled: number;
  scale: 100_000_000;
  source: "Frankfurter";
  fetched_at: string;
}

function mapSnapshot(row: FxRow): FxSnapshot {
  return {
    rateDate: row.rate_date,
    rateScaled: row.rate_scaled,
    scale: row.scale,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}

export async function refreshFxRate(
  db: D1Database,
  apiUrl: string,
  fetcher: typeof fetch,
  fetchedAt = new Date().toISOString(),
): Promise<FxSnapshot> {
  let response: Response;
  try {
    response = await fetcher(apiUrl, {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new Error("fx_upstream_unavailable");
  }
  if (!response.ok) throw new Error("fx_upstream_unavailable");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("fx_response_invalid");
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { date?: unknown }).date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test((body as { date: string }).date) ||
    !(body as { rates?: unknown }).rates ||
    typeof (body as { rates: { USD?: unknown } }).rates.USD !== "number"
  ) {
    throw new Error("fx_response_invalid");
  }

  let rateScaled: number;
  try {
    rateScaled = parseRateScaled(
      String((body as { rates: { USD: number } }).rates.USD),
    );
  } catch {
    throw new Error("fx_response_invalid");
  }
  const rateDate = (body as { date: string }).date;
  await db
    .prepare(
      "INSERT INTO fx_rates " +
        "(rate_date, base_currency, quote_currency, rate_scaled, scale, source, fetched_at) " +
        "VALUES (?, 'TWD', 'USD', ?, 100000000, 'Frankfurter', ?) " +
        "ON CONFLICT(rate_date) DO UPDATE SET " +
        "rate_scaled = excluded.rate_scaled, fetched_at = excluded.fetched_at",
    )
    .bind(rateDate, rateScaled, fetchedAt)
    .run();

  return {
    rateDate,
    rateScaled,
    scale: 100_000_000,
    source: "Frankfurter",
    fetchedAt,
  };
}

export async function getUsableFxSnapshot(
  db: D1Database,
  submissionDate: string,
): Promise<FxSnapshot> {
  const row = await db
    .prepare(
      "SELECT rate_date, rate_scaled, scale, source, fetched_at " +
        "FROM fx_rates WHERE rate_date <= ? ORDER BY rate_date DESC LIMIT 1",
    )
    .bind(submissionDate)
    .first<FxRow>();
  if (!row) throw new Error("fx_rate_missing");
  if (businessDaysBetween(row.rate_date, submissionDate) > 3) {
    throw new Error("fx_rate_stale");
  }
  return mapSnapshot(row);
}
