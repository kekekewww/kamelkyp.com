PRAGMA foreign_keys = ON;

DELETE FROM content_publications
WHERE entry_id IN ('e2e-media-test', 'e2e-mediafire-test');
DELETE FROM content_entries
WHERE id IN ('e2e-media-test', 'e2e-mediafire-test');

INSERT INTO content_entries (
  id, kind, slug, sort_order, is_listed, created_at, updated_at
) VALUES
  ('e2e-media-test', 'work', 'media-test', 9001, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-mediafire-test', 'work', 'mediafire-test', 9002, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z');

INSERT INTO content_versions (
  id, entry_id, locale, version_number, state, title, summary, body_json,
  created_at
) VALUES
  (
    'e2e-media-test-v1', 'e2e-media-test', 'en', 1, 'draft',
    'Media privacy test', NULL,
    '[{"type":"media","mediaId":"e2e-youtube"}]',
    '2026-08-19T00:00:00Z'
  ),
  (
    'e2e-mediafire-test-v1', 'e2e-mediafire-test', 'en', 1, 'draft',
    'External media test', NULL,
    '[{"type":"media","mediaId":"e2e-mediafire"}]',
    '2026-08-19T00:00:00Z'
  );

INSERT INTO media_items (
  id, content_version_id, kind, url, title, start_seconds, end_seconds,
  sort_order
) VALUES
  (
    'e2e-youtube', 'e2e-media-test-v1', 'youtube',
    'https://youtu.be/dQw4w9WgXcQ', 'Test video', NULL, NULL, 0
  ),
  (
    'e2e-mediafire', 'e2e-mediafire-test-v1', 'external_link',
    'https://www.mediafire.com/file/abc/demo/file', 'External file',
    NULL, NULL, 0
  );

UPDATE content_versions
SET state = 'published', published_at = '2026-08-19T00:00:00Z'
WHERE id IN ('e2e-media-test-v1', 'e2e-mediafire-test-v1');
