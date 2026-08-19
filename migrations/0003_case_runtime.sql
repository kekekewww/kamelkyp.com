CREATE TABLE IF NOT EXISTS case_runtime (
  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
  cleanup_due_at TEXT,
  student_review_state TEXT NOT NULL DEFAULT 'none'
    CHECK (student_review_state IN ('none', 'pending')),
  standard_price_minor INTEGER,
  student_price_minor INTEGER,
  updated_at TEXT NOT NULL,
  CHECK (
    (student_review_state = 'none' AND
      standard_price_minor IS NULL AND student_price_minor IS NULL) OR
    (student_review_state = 'pending' AND
      standard_price_minor IS NOT NULL AND student_price_minor IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS case_runtime_cleanup_due
  ON case_runtime(cleanup_due_at)
  WHERE cleanup_due_at IS NOT NULL;
