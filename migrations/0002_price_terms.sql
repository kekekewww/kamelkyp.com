INSERT OR IGNORE INTO price_versions (
  id,
  service_id,
  base_twd,
  per_song_after_five_twd,
  student_discount_bps,
  rush_bps,
  consultation_bps,
  source_prep_bps,
  effective_from
) VALUES
  ('full-2026-08-10', 'full_mix', 8000, 0, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('vocal-2026-08-10', 'vocal_mix', 4000, 0, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('simple-2026-08-10', 'simple_transition', 1000, 200, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('edit-2026-08-10', 'edit_transition', 4000, 800, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z');

INSERT OR IGNORE INTO term_documents (id, kind, service_id) VALUES
  ('common', 'common', NULL),
  ('privacy', 'privacy', NULL),
  ('full-mix', 'service', 'full_mix'),
  ('vocal-mix', 'service', 'vocal_mix'),
  ('simple-transition', 'service', 'simple_transition'),
  ('edit-transition', 'service', 'edit_transition');
