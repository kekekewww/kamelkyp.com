PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'work', 'post')),
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_listed INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, slug)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  title TEXT NOT NULL,
  summary TEXT,
  body_json TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  social_image_url TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (entry_id, locale, version_number),
  UNIQUE (id, entry_id, locale)
);

CREATE TABLE IF NOT EXISTS content_publications (
  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_id TEXT NOT NULL UNIQUE
    REFERENCES content_versions(id) ON DELETE RESTRICT,
  published_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, locale),
  FOREIGN KEY (version_id, entry_id, locale)
    REFERENCES content_versions(id, entry_id, locale) ON DELETE RESTRICT
);

CREATE TRIGGER content_versions_publish_pointer
AFTER UPDATE OF state ON content_versions
WHEN OLD.state = 'draft' AND NEW.state = 'published'
BEGIN
  INSERT INTO content_publications (
    entry_id,
    locale,
    version_id,
    published_at
  ) VALUES (
    NEW.entry_id,
    NEW.locale,
    NEW.id,
    NEW.published_at
  )
  ON CONFLICT(entry_id, locale) DO UPDATE SET
    version_id = excluded.version_id,
    published_at = excluded.published_at;
END;

CREATE TRIGGER content_publications_require_matching_version_insert
BEFORE INSERT ON content_publications
WHEN NOT EXISTS (
  SELECT 1
  FROM content_versions
  WHERE id = NEW.version_id
    AND entry_id = NEW.entry_id
    AND locale = NEW.locale
)
BEGIN
  SELECT RAISE(ABORT, 'content_publication_version_mismatch');
END;

CREATE TRIGGER content_publications_require_matching_version_update
BEFORE UPDATE OF entry_id, locale, version_id ON content_publications
WHEN NOT EXISTS (
  SELECT 1
  FROM content_versions
  WHERE id = NEW.version_id
    AND entry_id = NEW.entry_id
    AND locale = NEW.locale
)
BEGIN
  SELECT RAISE(ABORT, 'content_publication_version_mismatch');
END;

CREATE TABLE IF NOT EXISTS service_definitions (
  id TEXT PRIMARY KEY CHECK (
    id IN ('full_mix', 'vocal_mix', 'simple_transition', 'edit_transition')
  ),
  category TEXT NOT NULL CHECK (category IN ('mixing', 'song_transition')),
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_versions (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_definitions(id),
  base_twd INTEGER NOT NULL CHECK (base_twd > 0),
  per_song_after_five_twd INTEGER NOT NULL DEFAULT 0,
  student_discount_bps INTEGER NOT NULL DEFAULT 3000,
  rush_bps INTEGER NOT NULL DEFAULT 5000,
  consultation_bps INTEGER NOT NULL DEFAULT 5000,
  source_prep_bps INTEGER NOT NULL DEFAULT 500,
  effective_from TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE IF NOT EXISTS term_documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('common', 'service', 'privacy')),
  service_id TEXT REFERENCES service_definitions(id)
);

CREATE TABLE IF NOT EXISTS term_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_number INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  effective_from TEXT,
  UNIQUE (document_id, locale, version_number),
  UNIQUE (id, document_id, locale)
);

CREATE TABLE IF NOT EXISTS term_publications (
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_id TEXT NOT NULL UNIQUE REFERENCES term_versions(id),
  effective_from TEXT NOT NULL,
  PRIMARY KEY (document_id, locale),
  FOREIGN KEY (version_id, document_id, locale)
    REFERENCES term_versions(id, document_id, locale)
);

CREATE TRIGGER term_publications_require_matching_version_insert
BEFORE INSERT ON term_publications
WHEN NOT EXISTS (
  SELECT 1
  FROM term_versions
  WHERE id = NEW.version_id
    AND document_id = NEW.document_id
    AND locale = NEW.locale
)
BEGIN
  SELECT RAISE(ABORT, 'term_publication_version_mismatch');
END;

CREATE TRIGGER term_publications_require_matching_version_update
BEFORE UPDATE OF document_id, locale, version_id ON term_publications
WHEN NOT EXISTS (
  SELECT 1
  FROM term_versions
  WHERE id = NEW.version_id
    AND document_id = NEW.document_id
    AND locale = NEW.locale
)
BEGIN
  SELECT RAISE(ABORT, 'term_publication_version_mismatch');
END;

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  content_version_id TEXT NOT NULL
    REFERENCES content_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'youtube',
      'google_drive',
      'direct_audio',
      'github_raw_audio',
      'cloudflare_r2_audio',
      'external_link'
    )
  ),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  start_seconds INTEGER,
  end_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (start_seconds IS NULL OR start_seconds >= 0),
  CHECK (
    end_seconds IS NULL OR
    start_seconds IS NULL OR
    end_seconds > start_seconds
  )
);

CREATE TABLE IF NOT EXISTS link_groups (
  id TEXT PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES link_groups(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS fx_rates (
  rate_date TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL CHECK (base_currency = 'TWD'),
  quote_currency TEXT NOT NULL CHECK (quote_currency = 'USD'),
  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
  scale INTEGER NOT NULL CHECK (scale = 100000000),
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_definitions(id),
  locked_price_minor INTEGER NOT NULL CHECK (locked_price_minor >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('TWD', 'USD')),
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending_review',
      'pending_deposit',
      'in_production',
      'preview_approval',
      'pending_balance',
      'delivered',
      'paused',
      'cancelled'
    )
  )
);

CREATE TABLE IF NOT EXISTS submission_attempts (
  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (
    state IN ('created', 'form_written', 'notified', 'complete', 'failed')
  ),
  payload_hash TEXT,
  terms_versions_json TEXT,
  terms_accepted_at TEXT,
  google_response_id TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO service_definitions (id, category, sort_order) VALUES
  ('full_mix', 'mixing', 10),
  ('vocal_mix', 'mixing', 20),
  ('simple_transition', 'song_transition', 30),
  ('edit_transition', 'song_transition', 40);
