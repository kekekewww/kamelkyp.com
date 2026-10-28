-- 0009: Studio → Pricing and Terms (docs/superpowers/specs/2026-10-13-wp2-pricing-terms.md).
-- Additive and re-runnable. Inserts no price or term content.

-- Publish metadata for immutable price versions. Breaks ties between versions
-- with the same effective_from (latest publish wins) and records replacements
-- and cancellations of scheduled changes without touching price_versions.
CREATE TABLE IF NOT EXISTS price_version_publications (
  -- NOT NULL is explicit: a non-INTEGER PRIMARY KEY in SQLite accepts NULL otherwise.
  version_id TEXT NOT NULL PRIMARY KEY REFERENCES price_versions(id),
  published_at TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'publish'
    CHECK (action IN ('publish', 'replace', 'cancel')),
  replaces_version_id TEXT REFERENCES price_versions(id),
  CHECK ((action = 'publish') = (replaces_version_id IS NULL))
);

CREATE TRIGGER IF NOT EXISTS price_version_publications_immutable_update
BEFORE UPDATE ON price_version_publications
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS price_version_publications_immutable_delete
BEFORE DELETE ON price_version_publications
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

-- One mutable working copy per legal document and locale. Never read by a
-- public route; publishing copies it into term_versions and deletes it.
-- base_version_id has no foreign key on purpose: fixture cleanups delete term
-- versions, and a draft must never block that.
CREATE TABLE IF NOT EXISTS term_drafts (
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  body_json TEXT NOT NULL
    CHECK (json_valid(body_json) AND json_type(body_json) = 'array'),
  base_version_id TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, locale)
);
