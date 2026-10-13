-- Media e2e fixture (content-architecture §5.5): unlisted published projects
-- whose body media blocks exercise the players (YouTube click-to-load, Drive,
-- direct R2 audio, bounded preview, failing audio, link-only files). Assets
-- mirror the legacy import (youtube → video, drive → embed, links → link,
-- audio → audio). Published through project_snapshots, like the engine.
-- Statements end with ";" at a line end (tests/worker/cms-e2e-fixture.test.ts).
PRAGMA foreign_keys = ON;

-- Leftovers of an interrupted run.
UPDATE projects SET status = 'draft' WHERE id GLOB 'e2e-media-*';
DELETE FROM media_usages WHERE entity_id GLOB 'e2e-media-*';
DELETE FROM projects WHERE id GLOB 'e2e-media-*';
DELETE FROM media_assets WHERE id GLOB 'e2e-media-asset-*';

INSERT INTO media_assets (
  id, kind, source, state, external_url, provider, filename, title_i18n,
  preview_start_seconds, preview_end_seconds, created_at, updated_at
) VALUES
  ('e2e-media-asset-youtube', 'video', 'external', 'ready',
   'https://youtu.be/dQw4w9WgXcQ', 'youtube', 'test-video',
   '{"zh":"Test video","en":"Test video"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-mediafire', 'link', 'external', 'ready',
   'https://www.mediafire.com/file/abc/demo/file', 'external_link', 'external-file',
   '{"zh":"External file","en":"External file"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-first', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/first.wav', 'direct', 'first.wav',
   '{"zh":"First preview","en":"First preview"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-second', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/second.wav', 'direct', 'second.wav',
   '{"zh":"Second preview","en":"Second preview"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-bounded', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/bounded.wav', 'direct', 'bounded.wav',
   '{"zh":"Bounded preview","en":"Bounded preview"}', 12, 42,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-fallback', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/fallback.wav', 'direct', 'fallback.wav',
   '{"zh":"Fallback preview","en":"Fallback preview"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-drive', 'embed', 'external', 'ready',
   'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', 'google_drive', 'drive-preview',
   '{"zh":"Drive preview","en":"Drive preview"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-asset-dropbox', 'link', 'external', 'ready',
   'https://www.dropbox.com/s/example/demo.wav?dl=0', 'external_link', 'dropbox-download',
   '{"zh":"Dropbox download","en":"Dropbox download"}', NULL, NULL,
   '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z');

-- English-only test pages (zh 404s, as legacy one-locale works did).
INSERT INTO projects (
  id, slug, listed, year, primary_category_id, title_i18n, short_description_i18n,
  body_i18n, sort_order, created_at, updated_at
) VALUES
  ('e2e-media-test', 'media-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"Media privacy test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-youtube"}]}',
   9001, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-mediafire', 'mediafire-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"External media test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-mediafire"}]}',
   9002, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-audio', 'audio-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"Audio playback test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-first"},{"type":"media","mediaId":"e2e-media-asset-second"}]}',
   9003, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-bounds', 'audio-bounds-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"Audio bounds test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-bounded"}]}',
   9004, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-fallback', 'audio-fallback-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"Audio fallback test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-fallback"}]}',
   9005, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
  ('e2e-media-security', 'security-media-test', 0, 2026, 'term-project_category-music',
   '{"zh":"","en":"Security media test"}', '{"zh":"","en":"Fixture media page."}',
   '{"zh":[],"en":[{"type":"media","mediaId":"e2e-media-asset-drive"},{"type":"media","mediaId":"e2e-media-asset-dropbox"}]}',
   9006, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z');

INSERT INTO project_categories (project_id, term_id, position)
SELECT id, 'term-project_category-music', 0 FROM projects WHERE id GLOB 'e2e-media-*';

UPDATE projects SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM project_snapshots s WHERE s.id = projects.id),
  published_slug = slug,
  published_revision = revision,
  published_at = '2026-08-19T00:00:00Z',
  first_published_at = '2026-08-19T00:00:00Z'
WHERE id GLOB 'e2e-media-*';
