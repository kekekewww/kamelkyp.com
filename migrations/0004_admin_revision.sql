ALTER TABLE content_versions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS content_versions_lookup
  ON content_versions(entry_id, locale, state, created_at DESC);

CREATE TRIGGER IF NOT EXISTS content_versions_published_immutable_update
BEFORE UPDATE ON content_versions
WHEN OLD.state = 'published'
BEGIN
  SELECT RAISE(ABORT, 'published_content_immutable');
END;

CREATE TRIGGER IF NOT EXISTS content_versions_published_immutable_delete
BEFORE DELETE ON content_versions
WHEN OLD.state = 'published'
BEGIN
  SELECT RAISE(ABORT, 'published_content_immutable');
END;

CREATE TRIGGER IF NOT EXISTS term_versions_immutable_update
BEFORE UPDATE ON term_versions
BEGIN
  SELECT RAISE(ABORT, 'term_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS term_versions_immutable_delete
BEFORE DELETE ON term_versions
BEGIN
  SELECT RAISE(ABORT, 'term_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS price_versions_immutable_update
BEFORE UPDATE ON price_versions
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS price_versions_immutable_delete
BEFORE DELETE ON price_versions
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

ALTER TABLE media_items ADD COLUMN description TEXT;
ALTER TABLE media_items ADD COLUMN thumbnail_url TEXT;
ALTER TABLE media_items ADD COLUMN credit TEXT;
ALTER TABLE media_items ADD COLUMN published_at TEXT;
ALTER TABLE media_items ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS link_group_labels (
  group_id TEXT NOT NULL REFERENCES link_groups(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  label TEXT NOT NULL,
  PRIMARY KEY (group_id, locale)
);
