PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS content_versions_published_immutable_delete;

DELETE FROM content_publications
WHERE entry_id IN (
  'e2e-media-test', 'e2e-mediafire-test', 'e2e-audio-test',
  'e2e-audio-bounds-test', 'e2e-audio-fallback-test', 'e2e-security-media-test'
);
DELETE FROM content_entries
WHERE id IN (
  'e2e-media-test', 'e2e-mediafire-test', 'e2e-audio-test',
  'e2e-audio-bounds-test', 'e2e-audio-fallback-test', 'e2e-security-media-test'
);

CREATE TRIGGER content_versions_published_immutable_delete
BEFORE DELETE ON content_versions
WHEN OLD.state = 'published'
BEGIN
  SELECT RAISE(ABORT, 'published_content_immutable');
END;
