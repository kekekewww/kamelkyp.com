-- 0007_cms_legacy_import.sql — existing D1 content → Content Studio tables
-- (docs/content-schema.md §3.3, §6.2). Data-agnostic: every statement is an
-- INSERT … SELECT or a guarded UPDATE over whatever the legacy tables hold.
-- Legacy tables are only read; they stay untouched for rollback.
-- Imported rows keep their legacy ids so block references stay valid.

CREATE VIEW IF NOT EXISTS legacy_latest_v AS
SELECT v.* FROM content_versions v
WHERE v.version_number = (
  SELECT MAX(x.version_number) FROM content_versions x
  WHERE x.entry_id = v.entry_id AND x.locale = v.locale
);

-- The value imported first: the published version, or the latest one for
-- never-published entries.
CREATE VIEW IF NOT EXISTS legacy_initial_v AS
SELECT v.* FROM content_versions v
WHERE v.id IN (SELECT version_id FROM content_publications)
   OR (v.id IN (SELECT id FROM legacy_latest_v)
       AND NOT EXISTS (SELECT 1 FROM content_publications cp WHERE cp.entry_id = v.entry_id));

-- 1. Media items attached to imported versions (ids preserved).
INSERT OR IGNORE INTO media_assets (
  id, kind, source, state, external_url, provider, filename, title_i18n, caption_i18n,
  credit, preview_start_seconds, preview_end_seconds, tags_json, legacy_source, created_at, updated_at
)
SELECT m.id,
  CASE m.kind WHEN 'youtube' THEN 'video' WHEN 'google_drive' THEN 'embed'
              WHEN 'external_link' THEN 'link' ELSE 'audio' END,
  'external', 'ready', m.url,
  CASE m.kind WHEN 'youtube' THEN 'youtube' WHEN 'google_drive' THEN 'google_drive'
              WHEN 'github_raw_audio' THEN 'github_raw' WHEN 'external_link' THEN 'external_link'
              ELSE 'direct' END,
  substr(m.title, 1, 255),
  json_object('zh', m.title, 'en', m.title),
  json_object('zh', COALESCE(m.description, ''), 'en', COALESCE(m.description, '')),
  m.credit, m.start_seconds, m.end_seconds,
  CASE WHEN json_valid(m.tags_json) THEN m.tags_json ELSE '[]' END,
  'media_items:' || m.id, v.created_at, v.created_at
FROM media_items m JOIN content_versions v ON v.id = m.content_version_id
WHERE m.content_version_id IN (SELECT id FROM legacy_initial_v UNION SELECT id FROM legacy_latest_v)
  AND m.url GLOB 'https://?*';

-- 1b. Legacy social_image_url values become external image assets.
INSERT OR IGNORE INTO media_assets (
  id, kind, source, state, external_url, provider, filename, legacy_source, created_at, updated_at
)
SELECT 'legacy-social-' || v.id, 'image', 'external', 'ready', v.social_image_url, 'direct',
  COALESCE(NULLIF(substr(replace(v.social_image_url,
    rtrim(v.social_image_url, replace(v.social_image_url, '/', '')), ''), 1, 255), ''), 'social-image'),
  'content_versions:' || v.id || ':social_image_url', v.created_at, v.created_at
FROM content_versions v
WHERE v.id IN (SELECT id FROM legacy_initial_v UNION SELECT id FROM legacy_latest_v)
  AND v.social_image_url GLOB 'https://?*';

-- 2. Works → projects (category "music", as mergeWorks treats D1 works today).
INSERT OR IGNORE INTO projects (
  id, slug, status, listed, year, primary_category_id, title_i18n, short_description_i18n,
  body_i18n, seo_title_i18n, seo_description_i18n, social_image_id, sort_order, revision,
  legacy_source, created_at, updated_at
)
SELECT e.id, e.slug, 'draft', e.is_listed,
  CAST(substr(COALESCE(
    (SELECT MIN(p.published_at) FROM content_publications p WHERE p.entry_id = e.id),
    e.created_at), 1, 4) AS INTEGER),
  'term-project_category-music',
  json_object('zh', COALESCE(zh.title, ''), 'en', COALESCE(en.title, '')),
  json_object('zh', COALESCE(zh.summary, ''), 'en', COALESCE(en.summary, '')),
  json_object('zh', json(COALESCE(zh.body_json, '[]')), 'en', json(COALESCE(en.body_json, '[]'))),
  json_object('zh', COALESCE(zh.seo_title, ''), 'en', COALESCE(en.seo_title, '')),
  json_object('zh', COALESCE(zh.seo_description, ''), 'en', COALESCE(en.seo_description, '')),
  CASE
    WHEN zh.social_image_url GLOB 'https://?*' THEN 'legacy-social-' || zh.id
    WHEN en.social_image_url GLOB 'https://?*' THEN 'legacy-social-' || en.id
  END,
  e.sort_order, 0, 'content_entries:' || e.id, e.created_at, e.updated_at
FROM content_entries e
LEFT JOIN legacy_initial_v zh ON zh.entry_id = e.id AND zh.locale = 'zh'
LEFT JOIN legacy_initial_v en ON en.entry_id = e.id AND en.locale = 'en'
WHERE e.kind = 'work';

INSERT OR IGNORE INTO project_categories (project_id, term_id, position)
SELECT id, 'term-project_category-music', 0 FROM projects WHERE legacy_source GLOB 'content_entries:*';

-- 3. Publish the ones that were published (snapshot = published legacy values).
UPDATE projects SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM project_snapshots s WHERE s.id = projects.id),
  published_slug = slug,
  published_revision = 0,
  published_at = (SELECT MAX(p.published_at) FROM content_publications p WHERE p.entry_id = projects.id),
  first_published_at = (SELECT MIN(p.published_at) FROM content_publications p WHERE p.entry_id = projects.id)
WHERE legacy_source GLOB 'content_entries:*' AND status = 'draft' AND published_json IS NULL
  AND EXISTS (SELECT 1 FROM content_publications p WHERE p.entry_id = projects.id);

-- 4. Overlay newer unpublished drafts onto the working copy, per locale
--    ("unpublished changes": revision 1 vs published_revision 0).
UPDATE projects SET
  title_i18n = json_set(title_i18n, '$.zh',
    (SELECT l.title FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh')),
  short_description_i18n = json_set(short_description_i18n, '$.zh', COALESCE(
    (SELECT l.summary FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'), '')),
  body_i18n = json_set(body_i18n, '$.zh', json(
    (SELECT l.body_json FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'))),
  seo_title_i18n = json_set(seo_title_i18n, '$.zh', COALESCE(
    (SELECT l.seo_title FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'), '')),
  seo_description_i18n = json_set(seo_description_i18n, '$.zh', COALESCE(
    (SELECT l.seo_description FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'), '')),
  revision = 1
WHERE legacy_source GLOB 'content_entries:*' AND revision = 0
  AND EXISTS (SELECT 1 FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'
              AND l.id NOT IN (SELECT id FROM legacy_initial_v));

UPDATE projects SET
  title_i18n = json_set(title_i18n, '$.en',
    (SELECT l.title FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en')),
  short_description_i18n = json_set(short_description_i18n, '$.en', COALESCE(
    (SELECT l.summary FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en'), '')),
  body_i18n = json_set(body_i18n, '$.en', json(
    (SELECT l.body_json FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en'))),
  seo_title_i18n = json_set(seo_title_i18n, '$.en', COALESCE(
    (SELECT l.seo_title FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en'), '')),
  seo_description_i18n = json_set(seo_description_i18n, '$.en', COALESCE(
    (SELECT l.seo_description FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en'), '')),
  revision = 1
WHERE legacy_source GLOB 'content_entries:*' AND revision <= 1
  AND EXISTS (SELECT 1 FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'en'
              AND l.id NOT IN (SELECT id FROM legacy_initial_v));

-- 5. Usage index for body media blocks and social images (working and published).
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'project', p.id, 'body.' || loc.key, 'working'
FROM projects p, json_each(p.body_i18n) AS loc, json_each(loc.value) AS b
WHERE p.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'project', p.id, 'body.' || loc.key, 'published'
FROM projects p, json_each(p.published_json, '$.extra.body_i18n') AS loc, json_each(loc.value) AS b
WHERE p.published_json IS NOT NULL AND p.status = 'published'
  AND p.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT p.social_image_id, 'project', p.id, 'socialImageId', scope.v
FROM projects p, (SELECT 'working' AS v UNION ALL SELECT 'published') AS scope
WHERE p.legacy_source GLOB 'content_entries:*' AND p.social_image_id IS NOT NULL
  AND (scope.v = 'working' OR p.status = 'published');

-- 6. Posts → writings: the same four steps (platform internal).
INSERT OR IGNORE INTO writings (
  id, slug, status, listed, date, platform, title_i18n, excerpt_i18n, content_i18n,
  seo_title_i18n, seo_description_i18n, social_image_id, sort_order, revision,
  legacy_source, created_at, updated_at
)
SELECT e.id, e.slug, 'draft', e.is_listed,
  substr(COALESCE(
    (SELECT MIN(p.published_at) FROM content_publications p WHERE p.entry_id = e.id),
    e.created_at), 1, 10),
  'internal',
  json_object('zh', COALESCE(zh.title, ''), 'en', COALESCE(en.title, '')),
  json_object('zh', COALESCE(zh.summary, ''), 'en', COALESCE(en.summary, '')),
  json_object('zh', json(COALESCE(zh.body_json, '[]')), 'en', json(COALESCE(en.body_json, '[]'))),
  json_object('zh', COALESCE(zh.seo_title, ''), 'en', COALESCE(en.seo_title, '')),
  json_object('zh', COALESCE(zh.seo_description, ''), 'en', COALESCE(en.seo_description, '')),
  CASE
    WHEN zh.social_image_url GLOB 'https://?*' THEN 'legacy-social-' || zh.id
    WHEN en.social_image_url GLOB 'https://?*' THEN 'legacy-social-' || en.id
  END,
  e.sort_order, 0, 'content_entries:' || e.id, e.created_at, e.updated_at
FROM content_entries e
LEFT JOIN legacy_initial_v zh ON zh.entry_id = e.id AND zh.locale = 'zh'
LEFT JOIN legacy_initial_v en ON en.entry_id = e.id AND en.locale = 'en'
WHERE e.kind = 'post';

UPDATE writings SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM writing_snapshots s WHERE s.id = writings.id),
  published_slug = slug,
  published_revision = 0,
  published_at = (SELECT MAX(p.published_at) FROM content_publications p WHERE p.entry_id = writings.id),
  first_published_at = (SELECT MIN(p.published_at) FROM content_publications p WHERE p.entry_id = writings.id)
WHERE legacy_source GLOB 'content_entries:*' AND status = 'draft' AND published_json IS NULL
  AND EXISTS (SELECT 1 FROM content_publications p WHERE p.entry_id = writings.id);

UPDATE writings SET
  title_i18n = json_set(title_i18n, '$.zh',
    (SELECT l.title FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh')),
  excerpt_i18n = json_set(excerpt_i18n, '$.zh', COALESCE(
    (SELECT l.summary FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh'), '')),
  content_i18n = json_set(content_i18n, '$.zh', json(
    (SELECT l.body_json FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh'))),
  seo_title_i18n = json_set(seo_title_i18n, '$.zh', COALESCE(
    (SELECT l.seo_title FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh'), '')),
  seo_description_i18n = json_set(seo_description_i18n, '$.zh', COALESCE(
    (SELECT l.seo_description FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh'), '')),
  revision = 1
WHERE legacy_source GLOB 'content_entries:*' AND revision = 0
  AND EXISTS (SELECT 1 FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'zh'
              AND l.id NOT IN (SELECT id FROM legacy_initial_v));

UPDATE writings SET
  title_i18n = json_set(title_i18n, '$.en',
    (SELECT l.title FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en')),
  excerpt_i18n = json_set(excerpt_i18n, '$.en', COALESCE(
    (SELECT l.summary FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en'), '')),
  content_i18n = json_set(content_i18n, '$.en', json(
    (SELECT l.body_json FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en'))),
  seo_title_i18n = json_set(seo_title_i18n, '$.en', COALESCE(
    (SELECT l.seo_title FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en'), '')),
  seo_description_i18n = json_set(seo_description_i18n, '$.en', COALESCE(
    (SELECT l.seo_description FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en'), '')),
  revision = 1
WHERE legacy_source GLOB 'content_entries:*' AND revision <= 1
  AND EXISTS (SELECT 1 FROM legacy_latest_v l WHERE l.entry_id = writings.id AND l.locale = 'en'
              AND l.id NOT IN (SELECT id FROM legacy_initial_v));

INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'writing', w.id, 'content.' || loc.key, 'working'
FROM writings w, json_each(w.content_i18n) AS loc, json_each(loc.value) AS b
WHERE w.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'writing', w.id, 'content.' || loc.key, 'published'
FROM writings w, json_each(w.published_json, '$.content_i18n') AS loc, json_each(loc.value) AS b
WHERE w.published_json IS NOT NULL AND w.status = 'published'
  AND w.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT w.social_image_id, 'writing', w.id, 'socialImageId', scope.v
FROM writings w, (SELECT 'working' AS v UNION ALL SELECT 'published') AS scope
WHERE w.legacy_source GLOB 'content_entries:*' AND w.social_image_id IS NOT NULL
  AND (scope.v = 'working' OR w.status = 'published');

-- 7. Home showreel: first media item of the published 'page'/'home' version
--    (zh first, then en). Audio or YouTube → published track; a Google Drive or
--    external-link showreel stays a draft (Studio attention item).
INSERT OR IGNORE INTO music_tracks (
  id, status, title_i18n, artist_i18n, audio_preview_id, youtube_url,
  is_showreel, legacy_source, created_at, updated_at
)
SELECT 'legacy-showreel', 'draft',
  json_object('zh', m.title, 'en', m.title), '{"zh":"Kamel","en":"Kamel"}',
  CASE WHEN m.kind IN ('direct_audio', 'github_raw_audio', 'cloudflare_r2_audio')
        AND EXISTS (SELECT 1 FROM media_assets a WHERE a.id = m.id) THEN m.id END,
  CASE WHEN m.kind = 'youtube' AND m.url GLOB 'https://?*' THEN m.url END,
  1, 'media_items:' || m.id, v.created_at, v.created_at
FROM content_publications p
JOIN content_entries e ON e.id = p.entry_id AND e.kind = 'page' AND e.slug = 'home'
JOIN content_versions v ON v.id = p.version_id
JOIN media_items m ON m.content_version_id = v.id
WHERE NOT EXISTS (SELECT 1 FROM music_tracks WHERE is_showreel = 1)
ORDER BY CASE p.locale WHEN 'zh' THEN 0 ELSE 1 END, m.sort_order, m.id
LIMIT 1;

UPDATE music_tracks SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM music_snapshots s WHERE s.id = music_tracks.id),
  published_revision = 0, published_at = updated_at, first_published_at = updated_at
WHERE id = 'legacy-showreel' AND status = 'draft' AND published_json IS NULL
  AND (audio_preview_id IS NOT NULL OR youtube_url IS NOT NULL);

INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT audio_preview_id, 'music', id, 'audioPreviewId', scope.v
FROM music_tracks, (SELECT 'working' AS v UNION ALL SELECT 'published') AS scope
WHERE id = 'legacy-showreel' AND audio_preview_id IS NOT NULL
  AND (scope.v = 'working' OR status = 'published');

-- 8. Admin "social" link group → social_links (zh rows carry the order; the en
--    label is paired by order).
INSERT OR IGNORE INTO social_links
  (id, platform, label_i18n, url, enabled, sort_order, legacy_source, created_at, updated_at)
SELECT 'legacy-' || lz.id,
  CASE
    WHEN lz.url LIKE 'mailto:%' THEN 'email'
    WHEN lz.url LIKE '%threads.net%' OR lz.url LIKE '%threads.com%' THEN 'threads'
    WHEN lz.url LIKE '%instagram.com%' THEN 'instagram'
    WHEN lz.url LIKE '%github.com%' THEN 'github'
    WHEN lz.url LIKE '%youtube.com%' OR lz.url LIKE '%youtu.be%' THEN 'youtube'
    WHEN lz.url LIKE '%spotify.com%' THEN 'spotify'
    WHEN lz.url LIKE '%soundcloud.com%' THEN 'soundcloud'
    WHEN lz.url LIKE '%linkedin.com%' THEN 'linkedin'
    WHEN lz.url LIKE '%devpost.com%' THEN 'devpost'
    ELSE 'other' END,
  json_object('zh', lz.label, 'en', COALESCE(le.label, lz.label)),
  lz.url, lz.enabled, lz.sort_order, 'links:' || lz.id, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
FROM links lz
JOIN link_groups g ON g.id = lz.group_id AND g.stable_key = 'social'
LEFT JOIN links le ON le.group_id = lz.group_id AND le.locale = 'en' AND le.sort_order = lz.sort_order
WHERE lz.locale = 'zh' AND (lz.url GLOB 'https://?*' OR lz.url GLOB 'mailto:?*');

-- 9. Footer "Work & Resources" defaults become editable rows only when the
--    admin never created link groups. The "Website repository" link
--    (https://github.com/kekekewww/kamelkyp.com) is seeded DISABLED: the public
--    repository's commit history shows a personal name, and the only public
--    identity is Kamel. It can be re-enabled in Studio → Settings → Footer.
INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-work-resources', 'work_resources', 30, 1
WHERE NOT EXISTS (SELECT 1 FROM link_groups);

WITH x(locale, label) AS (VALUES ('zh', '作品與資源'), ('en', 'Work & Resources'))
INSERT OR IGNORE INTO link_group_labels (group_id, locale, label)
SELECT 'seed-work-resources', x.locale, x.label
FROM x
WHERE EXISTS (SELECT 1 FROM link_groups WHERE id = 'seed-work-resources');

WITH x(id, locale, label, url, sort_order, enabled) AS (
  VALUES
    ('seed-github-profile-zh', 'zh', 'GitHub', 'https://github.com/kekekewww', 0, 1),
    ('seed-github-profile-en', 'en', 'GitHub', 'https://github.com/kekekewww', 0, 1),
    ('seed-site-repository-zh', 'zh', '網站專案', 'https://github.com/kekekewww/kamelkyp.com', 1, 0),
    ('seed-site-repository-en', 'en', 'Website repository', 'https://github.com/kekekewww/kamelkyp.com', 1, 0)
)
INSERT OR IGNORE INTO links (id, group_id, locale, label, url, sort_order, enabled)
SELECT x.id, 'seed-work-resources', x.locale, x.label, x.url, x.sort_order, x.enabled
FROM x
WHERE EXISTS (SELECT 1 FROM link_groups WHERE id = 'seed-work-resources');

DROP VIEW IF EXISTS legacy_initial_v;
DROP VIEW IF EXISTS legacy_latest_v;
