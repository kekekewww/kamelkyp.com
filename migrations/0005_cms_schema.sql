-- 0005_cms_schema.sql — Content Studio schema (docs/content-schema.md §3.1).
-- Additive only: no legacy table is altered or dropped. Every statement is
-- idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id TEXT PRIMARY KEY,
  vocabulary TEXT NOT NULL
    CHECK (length(vocabulary) BETWEEN 1 AND 40 AND vocabulary NOT GLOB '*[^a-z_]*'),
  slug TEXT NOT NULL
    CHECK (length(slug) BETWEEN 1 AND 96 AND slug NOT GLOB '*[^a-z0-9-]*'),
  label_i18n TEXT NOT NULL CHECK (json_valid(label_i18n)),
  data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (vocabulary, slug)
);

CREATE INDEX IF NOT EXISTS taxonomy_terms_vocab_order
  ON taxonomy_terms (vocabulary, sort_order);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL
    CHECK (kind IN ('image', 'audio', 'video', 'document', 'embed', 'link')),
  source TEXT NOT NULL CHECK (source IN ('r2', 'external')),
  state TEXT NOT NULL DEFAULT 'ready'
    CHECK (state IN ('pending', 'ready', 'failed')),
  storage_key TEXT UNIQUE,
  external_url TEXT,
  provider TEXT NOT NULL CHECK (
    provider IN ('r2', 'youtube', 'google_drive', 'github_raw', 'direct', 'external_link')
  ),
  filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  mime_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(title_i18n)),
  alt_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(alt_i18n)),
  caption_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(caption_i18n)),
  credit TEXT,
  focal_x REAL CHECK (focal_x IS NULL OR (focal_x >= 0 AND focal_x <= 1)),
  focal_y REAL CHECK (focal_y IS NULL OR (focal_y >= 0 AND focal_y <= 1)),
  preview_start_seconds INTEGER
    CHECK (preview_start_seconds IS NULL OR preview_start_seconds >= 0),
  preview_end_seconds INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  legacy_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK (
    (source = 'r2' AND provider = 'r2' AND storage_key IS NOT NULL AND external_url IS NULL) OR
    (source = 'external' AND provider <> 'r2' AND storage_key IS NULL
      AND external_url GLOB 'https://?*')
  ),
  CHECK (
    preview_end_seconds IS NULL OR preview_start_seconds IS NULL OR
    preview_end_seconds > preview_start_seconds
  )
);

CREATE INDEX IF NOT EXISTS media_assets_kind_created
  ON media_assets (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_pending
  ON media_assets (state, created_at) WHERE state <> 'ready';

CREATE TABLE IF NOT EXISTS media_usages (
  asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('working', 'published')),
  PRIMARY KEY (asset_id, entity_type, entity_id, field, scope)
);

CREATE INDEX IF NOT EXISTS media_usages_entity
  ON media_usages (entity_type, entity_id);

CREATE TRIGGER IF NOT EXISTS media_assets_published_use_delete
BEFORE DELETE ON media_assets
WHEN EXISTS (
  SELECT 1 FROM media_usages WHERE asset_id = OLD.id AND scope = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'media_asset_in_published_use');
END;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 1 AND 96 AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
  ),
  published_slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  todo_content INTEGER NOT NULL DEFAULT 0 CHECK (todo_content IN (0, 1)),
  listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1)),
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1990 AND 2100),
  primary_category_id TEXT REFERENCES taxonomy_terms(id),
  title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(title_i18n)),
  role_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(role_i18n)),
  short_description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(short_description_i18n)),
  description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(description_i18n)),
  tools_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tools_json)),
  technologies_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(technologies_json)),
  cover_image_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  cover_video_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  gallery_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(gallery_json)),
  social_image_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  links_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links_json)),
  credits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(credits_json)),
  context_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(context_i18n)),
  problem_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(problem_i18n)),
  approach_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(approach_i18n)),
  process_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(process_i18n)),
  architecture_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(architecture_i18n)),
  result_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(result_i18n)),
  reflection_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(reflection_i18n)),
  body_i18n TEXT NOT NULL DEFAULT '{"zh":[],"en":[]}' CHECK (json_valid(body_i18n)),
  seo_title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(seo_title_i18n)),
  seo_description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(seo_description_i18n)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  featured_order INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision INTEGER,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  first_published_at TEXT,
  archived_at TEXT,
  CHECK (
    status <> 'published' OR
    (published_json IS NOT NULL AND published_slug IS NOT NULL AND todo_content = 0)
  )
);

CREATE INDEX IF NOT EXISTS projects_status_order ON projects (status, sort_order);
CREATE INDEX IF NOT EXISTS projects_featured ON projects (featured_order) WHERE featured = 1;
CREATE INDEX IF NOT EXISTS projects_year ON projects (year);

CREATE TABLE IF NOT EXISTS project_categories (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, term_id)
);

CREATE INDEX IF NOT EXISTS project_categories_term ON project_categories (term_id);

CREATE TABLE IF NOT EXISTS music_tracks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  todo_content INTEGER NOT NULL DEFAULT 0 CHECK (todo_content IN (0, 1)),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(title_i18n)),
  artist_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(artist_i18n)),
  role_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(role_i18n)),
  genre_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(genre_i18n)),
  description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(description_i18n)),
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1990 AND 2100),
  credits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(credits_json)),
  artwork_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  audio_preview_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  full_audio_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  preview_start_seconds INTEGER
    CHECK (preview_start_seconds IS NULL OR preview_start_seconds >= 0),
  preview_end_seconds INTEGER,
  spotify_url TEXT,
  youtube_url TEXT,
  soundcloud_url TEXT,
  other_links_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(other_links_json)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  featured_order INTEGER,
  is_showreel INTEGER NOT NULL DEFAULT 0 CHECK (is_showreel IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision INTEGER,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  first_published_at TEXT,
  archived_at TEXT,
  CHECK (
    preview_end_seconds IS NULL OR preview_start_seconds IS NULL OR
    preview_end_seconds > preview_start_seconds
  ),
  CHECK (is_showreel = 0 OR status <> 'archived'),
  CHECK (status <> 'published' OR (published_json IS NOT NULL AND todo_content = 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_single_showreel
  ON music_tracks (is_showreel) WHERE is_showreel = 1;
CREATE INDEX IF NOT EXISTS music_tracks_status_order ON music_tracks (status, sort_order);
CREATE INDEX IF NOT EXISTS music_tracks_featured
  ON music_tracks (featured_order) WHERE featured = 1;
CREATE INDEX IF NOT EXISTS music_tracks_project ON music_tracks (project_id);

CREATE TABLE IF NOT EXISTS recognitions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  todo_content INTEGER NOT NULL DEFAULT 0 CHECK (todo_content IN (0, 1)),
  type_term_id TEXT REFERENCES taxonomy_terms(id),
  discipline_term_id TEXT REFERENCES taxonomy_terms(id),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1990 AND 2100),
  date TEXT CHECK (date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  organization_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(organization_i18n)),
  event_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(event_i18n)),
  result_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(result_i18n)),
  description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(description_i18n)),
  url TEXT,
  image_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  featured_order INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision INTEGER,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  first_published_at TEXT,
  archived_at TEXT,
  CHECK (status <> 'published' OR (published_json IS NOT NULL AND todo_content = 0))
);

CREATE INDEX IF NOT EXISTS recognitions_year ON recognitions (status, year DESC);
CREATE INDEX IF NOT EXISTS recognitions_featured
  ON recognitions (featured_order) WHERE featured = 1;
CREATE INDEX IF NOT EXISTS recognitions_type ON recognitions (type_term_id);

CREATE TABLE IF NOT EXISTS writings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 1 AND 96 AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
  ),
  published_slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  todo_content INTEGER NOT NULL DEFAULT 0 CHECK (todo_content IN (0, 1)),
  listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1)),
  date TEXT CHECK (date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  platform TEXT NOT NULL DEFAULT 'internal' CHECK (
    platform IN ('internal', 'threads', 'instagram', 'medium', 'devpost', 'other')
  ),
  platform_label TEXT,
  category_term_id TEXT REFERENCES taxonomy_terms(id),
  title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(title_i18n)),
  excerpt_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(excerpt_i18n)),
  content_i18n TEXT NOT NULL DEFAULT '{"zh":[],"en":[]}' CHECK (json_valid(content_i18n)),
  external_url TEXT,
  cover_image_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  social_image_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  seo_title_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(seo_title_i18n)),
  seo_description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(seo_description_i18n)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  featured_order INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision INTEGER,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  first_published_at TEXT,
  archived_at TEXT,
  CHECK (
    status <> 'published' OR
    (published_json IS NOT NULL AND published_slug IS NOT NULL AND todo_content = 0)
  )
);

CREATE INDEX IF NOT EXISTS writings_status_date ON writings (status, date DESC);
CREATE INDEX IF NOT EXISTS writings_featured ON writings (featured_order) WHERE featured = 1;
CREATE INDEX IF NOT EXISTS writings_platform ON writings (platform);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 1 AND 96 AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
  ),
  published_slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  todo_content INTEGER NOT NULL DEFAULT 0 CHECK (todo_content IN (0, 1)),
  group_term_id TEXT REFERENCES taxonomy_terms(id),
  commission_service_id TEXT UNIQUE REFERENCES service_definitions(id),
  name_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(name_i18n)),
  short_description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(short_description_i18n)),
  description_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(description_i18n)),
  price_mode TEXT NOT NULL DEFAULT 'contact'
    CHECK (price_mode IN ('fixed', 'starting_from', 'custom_quote', 'contact')),
  price_amount INTEGER CHECK (price_amount IS NULL OR price_amount > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('TWD', 'USD')),
  turnaround_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(turnaround_i18n)),
  revisions_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}' CHECK (json_valid(revisions_i18n)),
  deliverables_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(deliverables_json)),
  requirements_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(requirements_json)),
  process_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(process_json)),
  faq_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faq_json)),
  inquiry_subject_i18n TEXT NOT NULL DEFAULT '{"zh":"","en":""}'
    CHECK (json_valid(inquiry_subject_i18n)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  featured_order INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision INTEGER,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  first_published_at TEXT,
  archived_at TEXT,
  CHECK (
    commission_service_id IS NULL OR
    (price_mode = 'starting_from' AND price_amount IS NULL AND currency IS NULL)
  ),
  CHECK (
    status <> 'published' OR
    (published_json IS NOT NULL AND published_slug IS NOT NULL AND todo_content = 0)
  )
);

CREATE INDEX IF NOT EXISTS services_group_order ON services (group_term_id, sort_order);
CREATE INDEX IF NOT EXISTS services_status ON services (status);

CREATE TABLE IF NOT EXISTS social_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (
    platform IN (
      'threads', 'instagram', 'github', 'youtube', 'spotify',
      'soundcloud', 'linkedin', 'devpost', 'email', 'other'
    )
  ),
  label_i18n TEXT NOT NULL CHECK (json_valid(label_i18n)),
  url TEXT NOT NULL CHECK (url GLOB 'https://?*' OR url GLOB 'mailto:?*'),
  username TEXT,
  icon TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_source TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_links_enabled_order ON social_links (enabled, sort_order);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY CHECK (key IN ('brand', 'site')),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slug_redirects (
  entity_type TEXT NOT NULL,
  from_slug TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, from_slug)
);

CREATE INDEX IF NOT EXISTS slug_redirects_entity ON slug_redirects (entity_type, entity_id);

-- Published rows are never hard-deleted (archive or unpublish first).
CREATE TRIGGER IF NOT EXISTS projects_published_delete BEFORE DELETE ON projects
WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published_entity_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS music_tracks_published_delete BEFORE DELETE ON music_tracks
WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published_entity_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS recognitions_published_delete BEFORE DELETE ON recognitions
WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published_entity_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS writings_published_delete BEFORE DELETE ON writings
WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published_entity_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS services_published_delete BEFORE DELETE ON services
WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published_entity_delete_forbidden'); END;

-- Commission-linked service rows: never deleted, archived or re-linked.
CREATE TRIGGER IF NOT EXISTS services_commission_delete BEFORE DELETE ON services
WHEN OLD.commission_service_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'commission_service_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS services_commission_archive BEFORE UPDATE OF status ON services
WHEN NEW.status = 'archived' AND NEW.commission_service_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'commission_service_archive_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS services_commission_relink
BEFORE UPDATE OF commission_service_id ON services
WHEN OLD.commission_service_id IS NOT NEW.commission_service_id
BEGIN SELECT RAISE(ABORT, 'commission_link_immutable'); END;

-- Taxonomy references must point at the right vocabulary.
CREATE TRIGGER IF NOT EXISTS project_categories_vocab_insert BEFORE INSERT ON project_categories
WHEN (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.term_id) IS NOT 'project_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS project_categories_vocab_update BEFORE UPDATE OF term_id ON project_categories
WHEN (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.term_id) IS NOT 'project_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS projects_category_vocab_insert BEFORE INSERT ON projects
WHEN NEW.primary_category_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.primary_category_id) IS NOT 'project_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS projects_category_vocab_update
BEFORE UPDATE OF primary_category_id ON projects
WHEN NEW.primary_category_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.primary_category_id) IS NOT 'project_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS recognitions_type_vocab_insert BEFORE INSERT ON recognitions
WHEN (NEW.type_term_id IS NOT NULL
    AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.type_term_id) IS NOT 'recognition_type')
  OR (NEW.discipline_term_id IS NOT NULL
    AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.discipline_term_id) IS NOT 'project_category')
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS recognitions_type_vocab_update
BEFORE UPDATE OF type_term_id, discipline_term_id ON recognitions
WHEN (NEW.type_term_id IS NOT NULL
    AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.type_term_id) IS NOT 'recognition_type')
  OR (NEW.discipline_term_id IS NOT NULL
    AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.discipline_term_id) IS NOT 'project_category')
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS writings_category_vocab_insert BEFORE INSERT ON writings
WHEN NEW.category_term_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.category_term_id) IS NOT 'writing_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS writings_category_vocab_update
BEFORE UPDATE OF category_term_id ON writings
WHEN NEW.category_term_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.category_term_id) IS NOT 'writing_category'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS services_group_vocab_insert BEFORE INSERT ON services
WHEN NEW.group_term_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.group_term_id) IS NOT 'service_group'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS services_group_vocab_update BEFORE UPDATE OF group_term_id ON services
WHEN NEW.group_term_id IS NOT NULL
  AND (SELECT vocabulary FROM taxonomy_terms WHERE id = NEW.group_term_id) IS NOT 'service_group'
BEGIN SELECT RAISE(ABORT, 'term_vocabulary_mismatch'); END;

-- Snapshot views: the single definition of published_json. Each json_object has ≤ 15 pairs
-- (D1: 32 arguments per function); subquery JSON is wrapped in json() (subtypes do not
-- survive subqueries). Categories are [position, term_id] pairs; readers sort by position.
CREATE VIEW IF NOT EXISTS project_snapshots AS
SELECT p.id AS id, json_object(
  'schema_version', 1,
  'core', json_object(
    'slug', p.slug,
    'listed', p.listed,
    'year', p.year,
    'primary_category_id', p.primary_category_id,
    'categories', json((
      SELECT json_group_array(json_array(pc.position, pc.term_id))
      FROM project_categories pc WHERE pc.project_id = p.id
    )),
    'title_i18n', json(p.title_i18n),
    'role_i18n', json(p.role_i18n),
    'short_description_i18n', json(p.short_description_i18n),
    'description_i18n', json(p.description_i18n),
    'tools', json(p.tools_json),
    'technologies', json(p.technologies_json)
  ),
  'media', json_object(
    'cover_image_id', p.cover_image_id,
    'cover_video_id', p.cover_video_id,
    'gallery', json(p.gallery_json),
    'social_image_id', p.social_image_id
  ),
  'story', json_object(
    'context_i18n', json(p.context_i18n),
    'problem_i18n', json(p.problem_i18n),
    'approach_i18n', json(p.approach_i18n),
    'process_i18n', json(p.process_i18n),
    'architecture_i18n', json(p.architecture_i18n),
    'result_i18n', json(p.result_i18n),
    'reflection_i18n', json(p.reflection_i18n)
  ),
  'extra', json_object(
    'links', json(p.links_json),
    'credits', json(p.credits_json),
    'body_i18n', json(p.body_i18n)
  ),
  'seo', json_object(
    'title_i18n', json(p.seo_title_i18n),
    'description_i18n', json(p.seo_description_i18n)
  )
) AS snapshot
FROM projects p;

CREATE VIEW IF NOT EXISTS music_snapshots AS
SELECT m.id AS id, json_object(
  'schema_version', 1,
  'core', json_object(
    'project_id', m.project_id,
    'title_i18n', json(m.title_i18n),
    'artist_i18n', json(m.artist_i18n),
    'role_i18n', json(m.role_i18n),
    'genre_i18n', json(m.genre_i18n),
    'description_i18n', json(m.description_i18n),
    'year', m.year,
    'credits', json(m.credits_json)
  ),
  'media', json_object(
    'artwork_id', m.artwork_id,
    'audio_preview_id', m.audio_preview_id,
    'full_audio_id', m.full_audio_id,
    'duration_ms', m.duration_ms,
    'preview_start_seconds', m.preview_start_seconds,
    'preview_end_seconds', m.preview_end_seconds
  ),
  'links', json_object(
    'spotify_url', m.spotify_url,
    'youtube_url', m.youtube_url,
    'soundcloud_url', m.soundcloud_url,
    'other', json(m.other_links_json)
  )
) AS snapshot
FROM music_tracks m;

CREATE VIEW IF NOT EXISTS recognition_snapshots AS
SELECT r.id AS id, json_object(
  'schema_version', 1,
  'core', json_object(
    'type_term_id', r.type_term_id,
    'discipline_term_id', r.discipline_term_id,
    'project_id', r.project_id,
    'year', r.year,
    'date', r.date,
    'organization_i18n', json(r.organization_i18n),
    'event_i18n', json(r.event_i18n),
    'result_i18n', json(r.result_i18n),
    'description_i18n', json(r.description_i18n),
    'url', r.url,
    'image_id', r.image_id
  )
) AS snapshot
FROM recognitions r;

CREATE VIEW IF NOT EXISTS writing_snapshots AS
SELECT w.id AS id, json_object(
  'schema_version', 1,
  'core', json_object(
    'slug', w.slug,
    'listed', w.listed,
    'date', w.date,
    'platform', w.platform,
    'platform_label', w.platform_label,
    'category_term_id', w.category_term_id,
    'title_i18n', json(w.title_i18n),
    'excerpt_i18n', json(w.excerpt_i18n),
    'external_url', w.external_url,
    'cover_image_id', w.cover_image_id
  ),
  'content_i18n', json(w.content_i18n),
  'seo', json_object(
    'title_i18n', json(w.seo_title_i18n),
    'description_i18n', json(w.seo_description_i18n),
    'social_image_id', w.social_image_id
  )
) AS snapshot
FROM writings w;

CREATE VIEW IF NOT EXISTS service_snapshots AS
SELECT s.id AS id, json_object(
  'schema_version', 1,
  'core', json_object(
    'slug', s.slug,
    'group_term_id', s.group_term_id,
    'commission_service_id', s.commission_service_id,
    'name_i18n', json(s.name_i18n),
    'short_description_i18n', json(s.short_description_i18n),
    'description_i18n', json(s.description_i18n),
    'price_mode', s.price_mode,
    'price_amount', s.price_amount,
    'currency', s.currency,
    'inquiry_subject_i18n', json(s.inquiry_subject_i18n)
  ),
  'details', json_object(
    'turnaround_i18n', json(s.turnaround_i18n),
    'revisions_i18n', json(s.revisions_i18n),
    'deliverables', json(s.deliverables_json),
    'requirements', json(s.requirements_json),
    'process', json(s.process_json),
    'faq', json(s.faq_json)
  )
) AS snapshot
FROM services s;
