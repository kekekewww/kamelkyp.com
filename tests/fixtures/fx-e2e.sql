INSERT OR IGNORE INTO fx_rates (
  rate_date,
  base_currency,
  quote_currency,
  rate_scaled,
  scale,
  source,
  fetched_at
) VALUES (
  date('now'),
  'TWD',
  'USD',
  3250000,
  100000000,
  'Frankfurter',
  'e2e'
);
