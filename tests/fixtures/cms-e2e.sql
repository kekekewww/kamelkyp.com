-- Content Studio e2e fixture (content-architecture §5.5): six published
-- projects across categories (three featured, explicit order), a draft, a
-- renamed slug with its redirect, two recognition rows, internal + external
-- writing plus a draft, a published showreel on an intercepted
-- media.kamelkyp.com/e2e/*.wav, a project track and two social links (one
-- disabled). Titles say "Fixture"; no personal names. Everything is
-- published through the snapshot views, exactly like the engine.
-- Statements end with ";" at a line end (tests/worker/cms-e2e-fixture.test.ts).
PRAGMA foreign_keys = ON;

-- Leftovers of an interrupted run.
UPDATE music_tracks SET status = 'draft', is_showreel = 0 WHERE id GLOB 'e2e-cms-*';
UPDATE projects SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
UPDATE recognitions SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
UPDATE writings SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
DELETE FROM media_usages WHERE entity_id GLOB 'e2e-cms-*';
DELETE FROM slug_redirects WHERE entity_id GLOB 'e2e-cms-*';
DELETE FROM music_tracks WHERE id GLOB 'e2e-cms-*';
DELETE FROM recognitions WHERE id GLOB 'e2e-cms-*';
DELETE FROM writings WHERE id GLOB 'e2e-cms-*';
DELETE FROM projects WHERE id GLOB 'e2e-cms-*';
DELETE FROM social_links WHERE id GLOB 'e2e-cms-*';
DELETE FROM media_assets WHERE id GLOB 'e2e-cms-asset-*';

-- Assets ----------------------------------------------------------------------
INSERT INTO media_assets (
  id, kind, source, state, external_url, provider, filename, width, height,
  title_i18n, alt_i18n, focal_x, focal_y, created_at, updated_at
) VALUES
  ('e2e-cms-asset-cover', 'image', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/cover.jpg', 'direct', 'cover.jpg', 1600, 1000,
   '{"zh":"封面","en":"Cover"}',
   '{"zh":"示範訊號地圖封面","en":"Fixture signal map cover"}', 0.5, 0.25,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-asset-gallery', 'image', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/gallery.jpg', 'direct', 'gallery.jpg', 1600, 1000,
   '{"zh":"畫面","en":"Frame"}',
   '{"zh":"示範畫面","en":"Fixture frame"}', NULL, NULL,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-asset-showreel', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/showreel.wav', 'direct', 'showreel.wav', NULL, NULL,
   '{"zh":"示範 Showreel","en":"Fixture Showreel"}', '{"zh":"","en":""}', NULL, NULL,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-asset-single', 'audio', 'external', 'ready',
   'https://media.kamelkyp.com/e2e/single.wav', 'direct', 'single.wav', NULL, NULL,
   '{"zh":"示範單曲","en":"Fixture Single"}', '{"zh":"","en":""}', NULL, NULL,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');

-- Projects --------------------------------------------------------------------
-- Full case study, featured #1, renamed slug (old URL answers 301).
INSERT INTO projects (
  id, slug, listed, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, description_i18n, tools_json, technologies_json,
  cover_image_id, gallery_json, links_json, credits_json,
  context_i18n, problem_i18n, approach_i18n, architecture_i18n, result_i18n, reflection_i18n,
  featured, featured_order, sort_order, created_at, updated_at
) VALUES (
  'e2e-cms-signal', 'fixture-signal-map', 1, 2026, 'term-project_category-ai',
  '{"zh":"示範：訊號地圖","en":"Fixture Signal Map"}',
  '{"zh":"設計與開發","en":"Design & development"}',
  '{"zh":"把聲音特徵畫成可以探索的地圖。","en":"Audio features drawn as a map you can explore."}',
  '{"zh":"一個示範用的完整案例。\n\n- 兩種語言\n- 完整欄位","en":"A complete fixture case study.\n\n- Two languages\n- Every field"}',
  '["TypeScript","Web Audio"]', '["Cloudflare Workers"]',
  'e2e-cms-asset-cover',
  '[{"assetId":"e2e-cms-asset-gallery","caption_i18n":{"zh":"示範畫面說明","en":"Fixture frame caption"}}]',
  '[{"label_i18n":{"zh":"專案網站","en":"Project site"},"url":"https://example.com/fixture-signal-map"}]',
  '[{"role_i18n":{"zh":"開發","en":"Development"},"name":"Kamel"}]',
  '{"zh":"示範背景。","en":"Fixture context."}',
  '{"zh":"示範問題。","en":"Fixture problem."}',
  '{"zh":"示範方法。","en":"Fixture approach."}',
  '{"zh":"示範架構。","en":"Fixture architecture."}',
  '{"zh":"示範成果。","en":"Fixture result."}',
  '{"zh":"示範心得。","en":"Fixture reflection."}',
  1, 1, 10, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'
);

-- Minimal projects: only what publishing requires.
INSERT INTO projects (
  id, slug, listed, year, primary_category_id, title_i18n, short_description_i18n,
  featured, featured_order, sort_order, created_at, updated_at
) VALUES
  ('e2e-cms-booking', 'fixture-booking-console', 1, 2025, 'term-project_category-software',
   '{"zh":"示範：預約主控台","en":"Fixture Booking Console"}',
   '{"zh":"取代試算表的預約管理。","en":"Booking management that replaces a spreadsheet."}',
   1, 2, 20, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-room', 'fixture-listening-room', 1, 2025, 'term-project_category-interactive',
   '{"zh":"示範：聆聽房間","en":"Fixture Listening Room"}',
   '{"zh":"回應聲音的空間裝置。","en":"A room installation that answers sound."}',
   1, 3, 30, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-single', 'fixture-single-mix', 1, 2024, 'term-project_category-mixing',
   '{"zh":"示範：單曲混音","en":"Fixture Single Mix"}',
   '{"zh":"一首單曲的完整混音。","en":"A full mix of one single."}',
   0, NULL, 40, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-vocal', 'fixture-vocal-session', 1, 2024, 'term-project_category-music',
   '{"zh":"示範：人聲錄音","en":"Fixture Vocal Session"}',
   '{"zh":"人聲錄音與編修。","en":"Vocal recording and editing."}',
   0, NULL, 50, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-notes', 'fixture-analysis-notes', 1, 2023, 'term-project_category-research',
   '{"zh":"示範：分析筆記","en":"Fixture Analysis Notes"}',
   '{"zh":"即時音訊分析的研究筆記。","en":"Research notes on real-time audio analysis."}',
   0, NULL, 60, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-draft', 'fixture-draft-project', 1, 2026, 'term-project_category-software',
   '{"zh":"示範：草稿專案","en":"Fixture Draft Project"}',
   '{"zh":"尚未發布。","en":"Not published."}',
   1, 4, 5, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');

INSERT INTO project_categories (project_id, term_id, position) VALUES
  ('e2e-cms-signal', 'term-project_category-ai', 0),
  ('e2e-cms-signal', 'term-project_category-research', 1),
  ('e2e-cms-booking', 'term-project_category-software', 0),
  ('e2e-cms-room', 'term-project_category-interactive', 0),
  ('e2e-cms-room', 'term-project_category-creative-technology', 1),
  ('e2e-cms-single', 'term-project_category-mixing', 0),
  ('e2e-cms-single', 'term-project_category-music', 1),
  ('e2e-cms-vocal', 'term-project_category-music', 0),
  ('e2e-cms-notes', 'term-project_category-research', 0),
  ('e2e-cms-draft', 'term-project_category-software', 0);

UPDATE projects SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM project_snapshots s WHERE s.id = projects.id),
  published_slug = slug,
  published_revision = revision,
  published_at = '2026-09-20T00:00:00Z',
  first_published_at = '2026-09-20T00:00:00Z'
WHERE id GLOB 'e2e-cms-*' AND id <> 'e2e-cms-draft';

INSERT INTO slug_redirects (entity_type, from_slug, entity_id, created_at)
VALUES ('project', 'fixture-old-signal-map', 'e2e-cms-signal', '2026-09-20T00:00:00Z');

-- Music: the homepage showreel and a track on the single-mix project -------------
INSERT INTO music_tracks (
  id, project_id, title_i18n, artist_i18n, role_i18n, year, audio_preview_id,
  is_showreel, sort_order, created_at, updated_at
) VALUES
  ('e2e-cms-showreel', NULL, '{"zh":"示範 Showreel","en":"Fixture Showreel"}',
   '{"zh":"Kamel","en":"Kamel"}', '{"zh":"製作","en":"Production"}', 2026,
   'e2e-cms-asset-showreel', 1, 0, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-track', 'e2e-cms-single', '{"zh":"示範單曲","en":"Fixture Single"}',
   '{"zh":"Kamel","en":"Kamel"}', '{"zh":"混音","en":"Mixing engineer"}', 2024,
   'e2e-cms-asset-single', 0, 10, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');

UPDATE music_tracks SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM music_snapshots s WHERE s.id = music_tracks.id),
  published_revision = revision,
  published_at = '2026-09-20T00:00:00Z',
  first_published_at = '2026-09-20T00:00:00Z'
WHERE id GLOB 'e2e-cms-*';

-- Recognition --------------------------------------------------------------------
INSERT INTO recognitions (
  id, type_term_id, discipline_term_id, year, date, organization_i18n, event_i18n,
  result_i18n, url, featured, featured_order, sort_order, created_at, updated_at
) VALUES
  ('e2e-cms-award', 'term-recognition_type-award', 'term-project_category-interactive',
   2026, '2026-05-01', '{"zh":"示範影展","en":"Fixture Festival"}',
   '{"zh":"示範影展——最佳互動作品","en":"Fixture Festival — Best Interactive Work"}',
   '{"zh":"首獎","en":"Winner"}', 'https://example.com/fixture-festival',
   1, 1, 10, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-talk', 'term-recognition_type-speaking', NULL,
   2025, '2025-11-12', '{"zh":"示範研討會","en":"Fixture Conference"}',
   '{"zh":"示範研討會演講","en":"Fixture Conference Talk"}',
   '{"zh":"講者","en":"Speaker"}', NULL,
   0, NULL, 20, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');

UPDATE recognitions SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM recognition_snapshots s WHERE s.id = recognitions.id),
  published_revision = revision,
  published_at = '2026-09-20T00:00:00Z',
  first_published_at = '2026-09-20T00:00:00Z'
WHERE id GLOB 'e2e-cms-*';

-- Writing: internal article, external thread, draft --------------------------------
INSERT INTO writings (
  id, slug, listed, date, platform, title_i18n, excerpt_i18n, content_i18n,
  external_url, sort_order, created_at, updated_at
) VALUES
  ('e2e-cms-article', 'fixture-building-notes', 1, '2026-09-10', 'internal',
   '{"zh":"示範：做工具的筆記","en":"Fixture Notes on Building Tools"}',
   '{"zh":"為什麼自己做工具。","en":"Why build your own tools."}',
   '{"zh":[{"type":"paragraph","text":"示範內文。"}],"en":[{"type":"paragraph","text":"Fixture body text."}]}',
   NULL, 10, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-thread', 'fixture-thread-on-mixing', 1, '2026-08-01', 'threads',
   '{"zh":"示範：混音串文","en":"Fixture Thread on Mixing"}',
   '{"zh":"","en":""}', '{"zh":[],"en":[]}',
   'https://www.threads.net/@kamel.fixture/post/e2e', 20,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-note-draft', 'fixture-draft-note', 1, '2026-09-15', 'internal',
   '{"zh":"示範：草稿文章","en":"Fixture Draft Note"}',
   '{"zh":"","en":""}',
   '{"zh":[{"type":"paragraph","text":"草稿。"}],"en":[{"type":"paragraph","text":"Draft."}]}',
   NULL, 5, '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');

UPDATE writings SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM writing_snapshots s WHERE s.id = writings.id),
  published_slug = slug,
  published_revision = revision,
  published_at = '2026-09-20T00:00:00Z',
  first_published_at = '2026-09-20T00:00:00Z'
WHERE id IN ('e2e-cms-article', 'e2e-cms-thread');

-- Social links: one enabled (footer "Find me"), one disabled ----------------------
INSERT INTO social_links (
  id, platform, label_i18n, url, username, enabled, sort_order, created_at, updated_at
) VALUES
  ('e2e-cms-instagram', 'instagram', '{"zh":"Instagram","en":"Instagram"}',
   'https://www.instagram.com/kamel.fixture', 'kamel.fixture', 1, 10,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
  ('e2e-cms-github', 'github', '{"zh":"GitHub","en":"GitHub"}',
   'https://github.com/kamel-fixture', NULL, 0, 20,
   '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z');
