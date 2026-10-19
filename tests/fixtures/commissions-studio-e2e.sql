-- Studio Commissions e2e cases (wp1 §7.4). Fixed IDs, delete-then-insert,
-- so a re-run starts from the same state. Every case has a case_runtime row
-- (as every submitted case does) and a submission_attempts row; cases 1 and
-- 4 carry sentinel values that must never reach the browser.
DELETE FROM submission_attempts WHERE case_id IN (
  'KAM-20261001-E2E0000001',
  'KAM-20261001-E2E0000002',
  'KAM-20261001-E2E0000003',
  'KAM-20261001-E2E0000004'
);
DELETE FROM case_runtime WHERE case_id IN (
  'KAM-20261001-E2E0000001',
  'KAM-20261001-E2E0000002',
  'KAM-20261001-E2E0000003',
  'KAM-20261001-E2E0000004'
);
DELETE FROM cases WHERE case_id IN (
  'KAM-20261001-E2E0000001',
  'KAM-20261001-E2E0000002',
  'KAM-20261001-E2E0000003',
  'KAM-20261001-E2E0000004'
);

INSERT INTO cases (
  case_id, service_id, locked_price_minor, currency, submitted_at, status
) VALUES
  ('KAM-20261001-E2E0000001', 'full_mix', 8000, 'TWD',
    '2026-10-01T01:00:00.000Z', 'pending_review'),
  ('KAM-20261001-E2E0000002', 'full_mix', 26000, 'USD',
    '2026-10-01T02:00:00.000Z', 'in_production'),
  ('KAM-20261001-E2E0000003', 'full_mix', 5600, 'TWD',
    '2026-10-01T03:00:00.000Z', 'pending_review'),
  ('KAM-20261001-E2E0000004', 'simple_transition', 1000, 'TWD',
    '2026-10-01T04:00:00.000Z', 'delivered');

INSERT INTO case_runtime (
  case_id, cleanup_due_at, student_review_state, standard_price_minor,
  student_price_minor, updated_at
) VALUES
  ('KAM-20261001-E2E0000001', NULL, 'none', NULL, NULL,
    '2026-10-01T01:00:00.000Z'),
  ('KAM-20261001-E2E0000002', NULL, 'none', NULL, NULL,
    '2026-10-01T02:00:00.000Z'),
  ('KAM-20261001-E2E0000003', NULL, 'pending', 8000, 5600,
    '2026-10-01T03:00:00.000Z'),
  ('KAM-20261001-E2E0000004', '2026-10-08T00:00:00.000Z', 'none', NULL, NULL,
    '2026-10-01T04:00:00.000Z');

INSERT INTO submission_attempts (
  case_id, state, payload_hash, terms_versions_json, terms_accepted_at,
  google_response_id, last_error_code, updated_at
) VALUES
  ('KAM-20261001-E2E0000001', 'complete', 'sentinel-payload-hash',
    '["sentinel-terms"]', '2026-10-01T01:00:00.000Z', 'sentinel-google-id',
    'sentinel-error', '2026-10-01T01:00:00.000Z'),
  ('KAM-20261001-E2E0000002', 'complete', NULL, NULL,
    '2026-10-01T02:00:00.000Z', NULL, NULL, '2026-10-01T02:00:00.000Z'),
  ('KAM-20261001-E2E0000003', 'complete', NULL, NULL,
    '2026-10-01T03:00:00.000Z', NULL, NULL, '2026-10-01T03:00:00.000Z'),
  ('KAM-20261001-E2E0000004', 'complete', 'sentinel-payload-hash-4',
    '["sentinel-terms-4"]', '2026-10-01T04:00:00.000Z',
    'sentinel-google-id-4', 'sentinel-error-4', '2026-10-01T04:00:00.000Z');
