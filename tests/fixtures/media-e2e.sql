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

INSERT INTO content_entries (
  id, kind, slug, sort_order, is_listed, created_at, updated_at
) VALUES
  ('e2e-media-test', 'work', 'media-test', 9001, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-mediafire-test', 'work', 'mediafire-test', 9002, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-audio-test', 'work', 'audio-test', 9003, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-audio-bounds-test', 'work', 'audio-bounds-test', 9004, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-audio-fallback-test', 'work', 'audio-fallback-test', 9005, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-security-media-test', 'work', 'security-media-test', 9006, 0, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z');

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
  ),
  (
    'e2e-audio-test-v1', 'e2e-audio-test', 'en', 1, 'draft',
    'Audio playback test', NULL,
    '[{"type":"media","mediaId":"e2e-audio-first"},{"type":"media","mediaId":"e2e-audio-second"}]',
    '2026-08-19T00:00:00Z'
  ),
  (
    'e2e-audio-bounds-test-v1', 'e2e-audio-bounds-test', 'en', 1, 'draft',
    'Audio bounds test', NULL,
    '[{"type":"media","mediaId":"e2e-audio-bounded"}]',
    '2026-08-19T00:00:00Z'
  ),
  (
    'e2e-audio-fallback-test-v1', 'e2e-audio-fallback-test', 'en', 1, 'draft',
    'Audio fallback test', NULL,
    '[{"type":"media","mediaId":"e2e-audio-fallback"}]',
    '2026-08-19T00:00:00Z'
  ),
  (
    'e2e-security-media-test-v1', 'e2e-security-media-test', 'en', 1, 'draft',
    'Security media test', NULL,
    '[{"type":"media","mediaId":"e2e-drive"},{"type":"media","mediaId":"e2e-dropbox"}]',
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
  ),
  (
    'e2e-audio-first', 'e2e-audio-test-v1', 'cloudflare_r2_audio',
    'https://media.kamelkyp.com/e2e/first.wav', 'First preview',
    NULL, NULL, 0
  ),
  (
    'e2e-audio-second', 'e2e-audio-test-v1', 'cloudflare_r2_audio',
    'https://media.kamelkyp.com/e2e/second.wav', 'Second preview',
    NULL, NULL, 1
  ),
  (
    'e2e-audio-bounded', 'e2e-audio-bounds-test-v1', 'cloudflare_r2_audio',
    'https://media.kamelkyp.com/e2e/bounded.wav', 'Bounded preview',
    12, 42, 0
  ),
  (
    'e2e-audio-fallback', 'e2e-audio-fallback-test-v1', 'cloudflare_r2_audio',
    'https://media.kamelkyp.com/e2e/fallback.wav', 'Fallback preview',
    NULL, NULL, 0
  ),
  (
    'e2e-drive', 'e2e-security-media-test-v1', 'google_drive',
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', 'Drive preview',
    NULL, NULL, 0
  ),
  (
    'e2e-dropbox', 'e2e-security-media-test-v1', 'external_link',
    'https://www.dropbox.com/s/example/demo.wav?dl=0', 'Dropbox download',
    NULL, NULL, 1
  );

UPDATE content_versions
SET state = 'published', published_at = '2026-08-19T00:00:00Z'
WHERE id IN (
  'e2e-media-test-v1', 'e2e-mediafire-test-v1', 'e2e-audio-test-v1',
  'e2e-audio-bounds-test-v1', 'e2e-audio-fallback-test-v1',
  'e2e-security-media-test-v1'
);
