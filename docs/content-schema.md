# Content Schema: Kamel Content Studio

Status: design, 2026-09-24. Companion docs: `docs/content-architecture.md` (why and how),
`docs/admin-architecture.md` (Studio routes, auth, UX). Requirements: `docs/superpowers/specs/2026-09-24-content-studio-brief.md`.
Where this document is more specific than the brief, this document wins.

---

## 1. Conventions

### 1.1 Identifiers and time

| Item | Rule |
| --- | --- |
| New row ids | `crypto.randomUUID()` (TEXT). |
| Seed ids | Deterministic: `term-<vocabulary>-<slug>`, `svc-<commission id>`, `seed-<file id>`, so re-running a seed is a no-op (`INSERT OR IGNORE`). |
| Legacy ids | Imported rows keep the legacy id (`content_entries.id`, `media_items.id`), so block references (`{"type":"media","mediaId":…}`) stay valid and `/admin/content/:versionId` can be mapped. `legacy_source` records the origin (`content_entries:<id>`, `media_items:<id>`, `links:<id>`). |
| Timestamps | ISO 8601 UTC strings (`new Date().toISOString()`), as in migrations 0001–0004. Dates without time (`writings.date`, `recognitions.date`) are `YYYY-MM-DD`. |
| Money | `price_amount` is an integer in whole currency units (NT$ / US$), no minor units. Commission prices stay in `price_versions.base_twd` (see §2.6). |

### 1.2 Localisation: localized JSON columns

Every user-facing text field is one `TEXT` column holding `{"zh": "...", "en": "..."}` (suffix `_i18n`).
Rich bodies use `{"zh": ContentBlock[], "en": ContentBlock[]}` (existing `app/lib/content/block-schema.ts`).
Non-text values (years, URLs, ids, flags, order) are plain columns shared by both locales. Proper nouns
that do not translate (a tool name, a collaborator's name) are plain strings.

Why this representation (and not per-locale translation rows) is argued in `docs/content-architecture.md` §4.4.
In short: one row = one publish decision for both locales; search covers both locales with one `instr()`;
validation is a pure function over `{zh, en}` objects that zod already models (`LocalizedTextSchema`).

**Completeness rule (publish):**

1. A field marked *required* must be non-empty (after trim) in **both** zh and en. Publishing is refused otherwise.
2. An *optional* localized field may be filled in one locale only. It then renders only on that locale's pages;
   there is **no cross-locale fallback** anywhere on the public site. The Studio shows a non-blocking warning.
3. Public reads defend in depth: a published row whose required fields are empty in the requested locale is
   excluded from that locale (lists) and 404s (detail). This only matters for legacy content published in one
   locale before the Studio existed; it matches today's behaviour (a zh-only D1 work 404s on `/en`).

### 1.3 The entry contract (lifecycle entities)

`projects`, `music_tracks`, `recognitions`, `writings`, `services` share these columns and rules. A future
content type (brief §38) adds a table with the same contract plus a `<type>_snapshots` view and a descriptor
in `app/lib/cms/db/tables.server.ts`; the lifecycle engine, Studio primitives and usage index work unchanged.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | TEXT PK | |
| `status` | TEXT `draft`/`published`/`archived` | Lifecycle state. Drafts and archived rows are never public. |
| `todo_content` | INTEGER 0/1 | `1` = seeded sample/placeholder (`TODO_CONTENT`). A table CHECK makes `status='published'` impossible while it is 1. |
| `featured`, `featured_order` | INTEGER | Homepage curation. **Placement** field: live immediately, not versioned. |
| `sort_order` | INTEGER | Manual list order (lower first). Placement field. |
| `revision` | INTEGER | Incremented on every working-copy save. Optimistic concurrency (`WHERE revision = ?`). |
| `published_revision` | INTEGER NULL | Revision that was last published. `revision <> published_revision` ⇒ "unpublished changes". |
| `published_json` | TEXT NULL | Frozen public snapshot produced by the `<type>_snapshots` view at publish time. Public reads use only this. |
| `legacy_source` | TEXT UNIQUE NULL | Migration traceability and idempotency. |
| `created_at`, `updated_at`, `published_at`, `first_published_at`, `archived_at` | TEXT | |

Slugged types (`projects`, `writings`, `services`) add `slug` (working, UNIQUE), `published_slug` (the URL that is
live, UNIQUE) and, for projects and writings, `listed` (0 = reachable by URL but omitted from lists and home).

**Working copy and snapshot.** Editing never touches the live site: saves update the working columns; *Publish*
validates the working copy and copies it into `published_json` via the snapshot view in the same statement.
*Revert* copies the snapshot back into the working columns. Placement fields (`featured`, `featured_order`,
`sort_order`, `is_showreel`) apply immediately and are not part of the snapshot; `listed` is content (it is
versioned and takes effect on publish).

**Snapshot views.** `project_snapshots`, `music_snapshots`, `recognition_snapshots`, `writing_snapshots`,
`service_snapshots` (§3.1) are the single definition of the snapshot format. The engine publishes with
`published_json = (SELECT snapshot FROM <type>_snapshots WHERE id = ?)`; seeds, the legacy import and e2e
fixtures publish the same way, so there is no second serializer to drift. Studio preview reads the view for the
working copy, so preview and publish render through the same parser.

### 1.4 D1 limits that shape the SQL

| Limit | Consequence |
| --- | --- |
| 32 arguments per SQL function | `json_object` calls carry ≤ 15 key/value pairs; snapshots are nested groups (`core`, `media`, `story`, …). |
| 100 bound parameters per query | Saves bind ≤ 45 values. Reorders bind one JSON array and use `json_each` (single statement, any length). |
| 2 MB per string/row | Snapshot size is validated at publish (≤ 1,500,000 bytes serialized); block bodies are capped at 300 blocks per locale (existing schema). |
| 100 KB statement text | Seed statements are one row per `INSERT`. |
| 50 queries per invocation on Workers Free | Public pages use ≤ 12 statements (one `db.batch` for site context + page reads). Bulk updates are single statements. |
| Subtypes do not survive subqueries | Subquery JSON inside `json_object` is wrapped in `json(...)`. |

### 1.5 Status lifecycle (all entry tables)

```
          create                publish (valid, todo_content = 0)
  ──────────────▶  DRAFT  ─────────────────────────────────────▶  PUBLISHED
                    ▲  ▲                                         │   │ ▲
          restore   │  └──────────── unpublish ──────────────────┘   │ │ publish (changes)
                    │                                                │ └──┘
                 ARCHIVED ◀──────────────── archive ─────────────────┘
                    │ (draft rows can be archived too)
                    ▼
            permanent delete (only from DRAFT or ARCHIVED, typed confirmation)
```

- Unpublish keeps `published_json` and `published_slug` (enables Revert and slug continuity); public reads
  require `status = 'published'`, so the content disappears at once.
- Archive clears `featured` and `is_showreel` (a hidden row must not hold homepage slots).
- A DB trigger forbids deleting a `published` row. Commission-linked services can be unpublished but never
  archived or deleted (triggers).

---

## 2. Models

Notation: **R** = required to publish (both locales for localized fields), **O** = optional,
**L** = localized JSON, **P** = placement (live immediately). All drafts save with any subset of fields;
draft saves are refused only for values that cannot be stored safely (over-long text, malformed JSON
structure, unknown ids, year outside 1990–2100, invalid slug characters: the slug field auto-corrects on blur).

### 2.1 Taxonomy (`taxonomy_terms`)

One table for every extensible vocabulary. Adding a vocabulary is a code change (zod enum), not a migration.

| Vocabulary | Used by | Seeded terms (slug → zh / en) |
| --- | --- | --- |
| `project_category` | `projects.primary_category_id`, `project_categories`, `recognitions.discipline_term_id`, brand capabilities | `software` 軟體/Software · `ai` AI/AI · `interactive` 互動/Interactive · `creative-technology` 創意科技/Creative Technology · `music` 音樂/Music · `mixing` 混音/Mixing · `research` 研究/Research |
| `recognition_type` | `recognitions.type_term_id` | `award` 獎項/Award · `publication` 出版/Publication · `speaking` 演講/Speaking · `event` 活動/Event · `competition` 競賽/Competition · `research` 研究/Research |
| `service_group` | `services.group_term_id` | `mixing` 混音/Mixing · `song-transition` 歌曲銜接/Song Transition · `music-production` 音樂製作/Music Production · `software-development` 軟體開發/Software Development · `creative-technology` 創意科技/Creative Technology · `interactive-experiences` 互動體驗/Interactive Experiences |
| `writing_category` | `writings.category_term_id` | none (Kevin adds) |

| Field | Type | Null | Default | L | Rule |
| --- | --- | --- | --- | --- | --- |
| id | TEXT PK | no | | | |
| vocabulary | TEXT | no | | | `[a-z_]{1,40}`, zod enum |
| slug | TEXT | no | | | `[a-z0-9-]{1,96}`, UNIQUE per vocabulary; used in `/works?category=<slug>` |
| label_i18n | TEXT | no | | L | both locales required on save (terms have no draft state) |
| data_json | TEXT | no | `{}` | | per vocabulary: `service_group` → `{"area": "mixing" \| "song_transition" \| "software"}` |
| sort_order | INTEGER | no | 0 | | P |
| archived_at | TEXT | yes | | | archived terms are hidden from pickers and public filters but keep references valid |

Delete: blocked by FKs while referenced (projects, join rows, recognitions, writings, services) and by the
repository while referenced from brand capabilities JSON. Archive is the normal path.

### 2.2 Project (`projects`, `project_categories`)

| Field (brief) | Column | Type | Null | Default | L | Draft | Publish |
| --- | --- | --- | --- | --- | --- | --- | --- |
| title | title_i18n | TEXT | no | `{"zh":"","en":""}` | L | ≤ 200 | **R** |
| slug | slug / published_slug | TEXT | no / yes | auto | | `[a-z0-9-]`, unique | **R**, unique vs other published slugs and redirects |
| year | year | INTEGER | yes | | | 1990–2100 | **R** |
| status | status | TEXT | no | `draft` | | | |
| category | primary_category_id | TEXT FK → taxonomy_terms | yes | | | vocabulary `project_category` | **R**, must also be in `categories` |
| categories | project_categories rows | join | | | | ≤ 8 | ≥ 1 (the primary) |
| role | role_i18n | TEXT | no | empty | L | ≤ 200 | O |
| shortDescription | short_description_i18n | TEXT | no | empty | L | ≤ 280 | **R** (en ≤ 140 recommended, warning above) |
| description | description_i18n | TEXT | no | empty | L | ≤ 4000, formatted text | O |
| tools | tools_json | TEXT (JSON string[]) | no | `[]` | | ≤ 30 × 60 chars | O |
| technologies | technologies_json | TEXT (JSON string[]) | no | `[]` | | ≤ 30 × 60 chars | O |
| coverImage | cover_image_id | TEXT FK → media_assets (SET NULL) | yes | | | kind `image` | O; if set, asset alt text **R** both locales |
| coverVideo | cover_video_id | TEXT FK → media_assets (SET NULL) | yes | | | kind `video` or `embed` | O |
| gallery | gallery_json | TEXT (JSON `[{assetId, caption_i18n}]`) | no | `[]` | caption L | ≤ 40 items | each asset exists, kind `image`, alt **R** |
| links | links_json | TEXT (JSON `[{label_i18n, url}]`) | no | `[]` | label L | ≤ 20 | url `https:`; label **R** |
| credits | credits_json | TEXT (JSON `[{role_i18n, name}]`) | no | `[]` | role L | ≤ 40 | name non-empty; brand guard |
| context, problem, approach, process, architecture, result, reflection | `<name>_i18n` | TEXT | no | empty | L | ≤ 12000 each, formatted text | O (warning when one locale only) |
| (legacy D1 work body) | body_i18n | TEXT (JSON `{zh: Block[], en: Block[]}`) | no | `{"zh":[],"en":[]}` | L | block schema, ≤ 300 blocks/locale | O; media blocks must reference existing assets |
| (SEO) | seo_title_i18n, seo_description_i18n | TEXT | no | empty | L | ≤ 300 / ≤ 400 | O (falls back to title / short description of the same locale) |
| (social image) | social_image_id | TEXT FK (SET NULL) | yes | | | kind `image` | O |
| (listing) | listed | INTEGER 0/1 | no | 1 | | | |
| featured | featured | INTEGER 0/1 | no | 0 | | P | |
| featuredOrder | featured_order | INTEGER | yes | | | P | |
| projectOrder | sort_order | INTEGER | no | 0 | | P | |
| createdAt / updatedAt / publishedAt | created_at / updated_at / published_at (+ first_published_at) | TEXT | | | | | |

`project_categories(project_id, term_id, position)`: PK `(project_id, term_id)`, `position` orders the chips;
the primary category is always `position = 0`. It is content (saved with the working copy, snapshotted as
`core.categories`).

Formatted text (description and case-study fields): plain text; a blank line starts a new paragraph; lines
that start with `- ` form a bulleted list. No HTML, no Markdown links (links go in LINKS). Parsed by
`app/lib/cms/text-format.ts` for both public pages and preview.

Indexes: `projects_status_order (status, sort_order)`, `projects_featured (featured_order) WHERE featured = 1`,
`projects_year (year)`, `project_categories_term (term_id)`; UNIQUE on `slug`, `published_slug`, `legacy_source`.

Featured semantics: homepage *Selected work* = published, listed, `featured = 1`, ordered by `featured_order`
then `sort_order`, limited to `site.homepage.featuredProjectCount`. No automatic fill; zero featured hides the
section and raises a Studio attention item.

Public list order (`/works`): `sort_order`, then `year DESC`, then `published_at DESC`. New projects get
`sort_order = MIN(sort_order) - 10` (top of the list). The Studio offers "Sort by year" as a one-shot reorder.

### 2.3 Music (`music_tracks`)

| Field (brief) | Column | Type | Null | Default | L | Draft | Publish |
| --- | --- | --- | --- | --- | --- | --- | --- |
| title | title_i18n | TEXT | no | empty | L | ≤ 200 | **R** ("same in both" toggle for untranslated titles) |
| artist | artist_i18n | TEXT | no | empty | L | ≤ 200 | **R**; brand guard (Kevin's own work is credited "Kamel") |
| year | year | INTEGER | yes | | | 1990–2100 | O |
| role | role_i18n | TEXT | no | empty | L | ≤ 200 | O |
| credits | credits_json | TEXT (JSON `[{role_i18n, name}]`) | no | `[]` | role L | ≤ 40 | name non-empty |
| genre | genre_i18n | TEXT | no | empty | L | ≤ 100 | O |
| description | description_i18n | TEXT | no | empty | L | ≤ 4000 formatted | O |
| artwork | artwork_id | TEXT FK (SET NULL) | yes | | | kind `image` | O; alt **R** if set |
| audioPreview | audio_preview_id | TEXT FK (SET NULL) | yes | | | kind `audio` | one playable source **R**: audio_preview_id, full_audio_id, youtube_url, spotify_url or soundcloud_url |
| fullAudio | full_audio_id | TEXT FK (SET NULL) | yes | | | kind `audio` | |
| duration | duration_ms | INTEGER | yes | | | ≥ 0; prefilled from the asset | O |
| (preview range) | preview_start_seconds, preview_end_seconds | INTEGER | yes | | | end > start | O |
| spotifyUrl / youtubeUrl / soundcloudUrl | spotify_url / youtube_url / soundcloud_url | TEXT | yes | | | | `https:` and host allowlist (open.spotify.com; youtube.com, youtu.be; soundcloud.com) |
| otherLinks | other_links_json | TEXT (JSON `[{label_i18n, url}]`) | no | `[]` | label L | ≤ 10 | https |
| (related project) | project_id | TEXT FK → projects (SET NULL) | yes | | | | O |
| featured / order | featured, featured_order, sort_order | INTEGER | | | | P | |
| showreel | is_showreel | INTEGER 0/1 | no | 0 | | P | showreel needs audio_preview_id, full_audio_id or youtube_url |
| publishStatus | status | TEXT | | | | | |

**Single showreel.** `CREATE UNIQUE INDEX music_tracks_single_showreel ON music_tracks(is_showreel) WHERE is_showreel = 1`
allows at most one flagged row; `CHECK (is_showreel = 0 OR status <> 'archived')` keeps it off archived rows.
`setShowreel(db, id)` runs `UPDATE … SET is_showreel = 0 WHERE is_showreel = 1` and `UPDATE … SET is_showreel = 1 WHERE id = ?`
in one `db.batch` (transactional). The *active* homepage showreel is the flagged row **if it is published**;
zero is a valid state (the hero renders its existing empty showreel). Never autoplay (unchanged player).

Public surfaces this phase: homepage hero showreel; project detail "Listen" rows for published tracks whose
`project_id` is that project (existing player component). A `/music` page is out of scope.

Indexes: `music_tracks_status_order (status, sort_order)`, `music_tracks_featured (featured_order) WHERE featured = 1`,
`music_tracks_project (project_id)`, the showreel partial unique index.

### 2.4 Recognition (`recognitions`)

| Field (brief) | Column | Type | Null | L | Publish |
| --- | --- | --- | --- | --- | --- |
| year | year | INTEGER | yes | | **R** |
| date | date | TEXT `YYYY-MM-DD` | yes | | O (sorts within a year) |
| type | type_term_id | FK → taxonomy_terms (`recognition_type`) | yes | | **R** |
| organization | organization_i18n | TEXT | no | L | O |
| event | event_i18n | TEXT | no | L | **R** |
| result | result_i18n | TEXT | no | L | O |
| description | description_i18n | TEXT | no | L | O (formatted) |
| url | url | TEXT | yes | | O, `https:` |
| image | image_id | FK → media_assets (SET NULL) | yes | | O; alt **R** if set |
| (discipline) | discipline_term_id | FK → taxonomy_terms (`project_category`) | yes | | O (keeps today's category column in the recognition row) |
| (related project) | project_id | FK → projects (SET NULL) | yes | | O |
| featured / order / status | featured, featured_order, sort_order, status | | | | |

Public order: `year DESC`, `date DESC NULLS LAST`, `sort_order`. Homepage: featured first (`featured_order`),
then newest to fill `site.homepage.recognitionCount`; section hidden at zero. Visual grouping by year/type is
the frontend's choice (brief §11).

Indexes: `recognitions_year (status, year DESC)`, `recognitions_featured (featured_order) WHERE featured = 1`, `recognitions_type (type_term_id)`.

### 2.5 Writing (`writings`)

| Field (brief) | Column | Type | Null | Default | L | Publish |
| --- | --- | --- | --- | --- | --- | --- |
| date | date | TEXT `YYYY-MM-DD` | yes | | | **R** |
| title | title_i18n | TEXT | no | empty | L | **R** |
| slug | slug / published_slug | TEXT | no / yes | auto | | **R** when the entry has internal content |
| excerpt | excerpt_i18n | TEXT | no | empty | L | O (≤ 400) |
| content | content_i18n | TEXT (JSON `{zh: Block[], en: Block[]}`) | no | `{"zh":[],"en":[]}` | L | **R** (both locales) when `platform = 'internal'`, or when `external_url` is empty |
| category | category_term_id | FK (`writing_category`) | yes | | | O |
| platform | platform | TEXT CHECK `internal`,`threads`,`instagram`,`medium`,`devpost`,`other` | no | `internal` | | **R** |
| (other label) | platform_label | TEXT | yes | | | **R** when platform = `other` |
| externalUrl | external_url | TEXT | yes | | | **R** (`https:`) when platform ≠ `internal` |
| cover | cover_image_id | FK (SET NULL) | yes | | | O; alt **R** if set |
| (SEO, social image, listed) | seo_title_i18n, seo_description_i18n, social_image_id, listed | | | | L | O |
| featured / order / status | featured, featured_order, sort_order, status | | | | | |

Brief §23 rule, made exact: publish needs title, date, platform, and either complete internal content (both
locales) or an `https:` external URL. An entry with an external URL and no content renders as a card that links
out (`target="_blank" rel="noopener noreferrer"`) and has **no** detail page (`/writing/:slug` 404s). No embedded
feeds. Public order: `date DESC`, `sort_order`. Homepage: featured first, then newest, up to `site.homepage.writingCount`.

Indexes: `writings_status_date (status, date DESC)`, `writings_featured (featured_order) WHERE featured = 1`, `writings_platform (platform)`.

### 2.6 Service (`services`) and the price source of truth

| Field (brief) | Column | Type | Null | Default | L | Publish |
| --- | --- | --- | --- | --- | --- | --- |
| name | name_i18n | TEXT | no | empty | L | **R** |
| slug | slug / published_slug | TEXT | no / yes | | | **R**; locked for commission-linked rows |
| category (group) | group_term_id | FK (`service_group`) | yes | | | **R** |
| shortDescription | short_description_i18n | TEXT | no | empty | L | O |
| description | description_i18n | TEXT | no | empty | L | **R** (formatted) |
| priceMode | price_mode | TEXT CHECK `fixed`,`starting_from`,`custom_quote`,`contact` | no | `contact` | | **R** |
| price / startingPrice | price_amount | INTEGER > 0 | yes | | | **R** for `fixed` (the price) and `starting_from` (the starting price) on non-commission rows; must be NULL otherwise |
| currency | currency | TEXT CHECK `TWD`,`USD` | yes | | | **R** with price_amount |
| turnaround | turnaround_i18n | TEXT | no | empty | L | O |
| revisions | revisions_i18n | TEXT | no | empty | L | O |
| deliverables | deliverables_json | TEXT (JSON L[]) | no | `[]` | L | O |
| requirements | requirements_json | TEXT (JSON L[]) | no | `[]` | L | O |
| process | process_json | TEXT (JSON `[{title_i18n, body_i18n}]`) | no | `[]` | L | O |
| faq | faq_json | TEXT (JSON `[{question_i18n, answer_i18n}]`) | no | `[]` | L | O (both sides **R** per item) |
| (inquiry subject) | inquiry_subject_i18n | TEXT | no | empty | L | O (mailto subject for contact/custom quote) |
| (commission link) | commission_service_id | TEXT UNIQUE FK → service_definitions | yes | | | seed-only, immutable |
| featured / order / status | featured, featured_order, sort_order, status | | | | | |

`price` and `startingPrice` from the brief share one column because only one is meaningful per mode; the mode
says how to read it. A numeric price is never required for `custom_quote` or `contact`.

**Commission-linked services (full_mix, vocal_mix, simple_transition, edit_transition).** One `services` row per
`service_definitions` id (seeded, `commission_service_id` set, immutable). These rows hold marketing content
only. A table CHECK forces `price_mode = 'starting_from'` and `price_amount IS NULL AND currency IS NULL`.
The displayed price everywhere (service pages, home pricing strip, `/services`, commission choice cards) is
the **active `price_versions` rule** (`getActivePriceRule(db, serviceId, now).baseTwd`), the same row the wizard
locks into a case. Prices change only by publishing a new immutable price version (Studio → Services → Pricing,
the existing `/admin/services` flow). `SERVICE_CATALOG.basePriceTwd` is deleted. Result: one source of truth,
and the marketing page can no longer drift from the quote (today it can: pages read the static catalog, quotes
read D1).

Unpublishing a commission-linked row hides its marketing page and removes it from the commission category
chooser; archive and delete are blocked by triggers. Public routes stay fixed in `app/routes.ts`
(`/mixing/full`, `/mixing/vocal`, `/song-transition/simple`, `/song-transition/edit`); the slug is informational.

Non-commission services (software offerings and future groups) are listed on their area page (`/services/software`
for groups whose `data.area = 'software'`, `/mixing` for `mixing` and `music-production`, `/song-transition`
for `song-transition`) with the price-mode label; they have no detail route this phase.

Indexes: `services_group_order (group_term_id, sort_order)`, `services_status (status)`, UNIQUE `commission_service_id`.

### 2.7 Social link (`social_links`)

No draft state: `enabled = 1` is public, `0` is hidden (brief §15).

| Field | Column | Type | Null | Default | Rule (on save) |
| --- | --- | --- | --- | --- | --- |
| platform | platform | TEXT CHECK `threads`,`instagram`,`github`,`youtube`,`spotify`,`soundcloud`,`linkedin`,`devpost`,`email`,`other` | no | | |
| label | label_i18n | TEXT L | no | | both locales required |
| url | url | TEXT | no | | `https:` or `mailto:` (CHECK) |
| username | username | TEXT | yes | | ≤ 100 |
| icon | icon | TEXT | yes | | key from a fixed icon set; default = platform (text-only rendering today) |
| enabled | enabled | INTEGER 0/1 | no | 1 | |
| order | sort_order | INTEGER | no | 0 | |

Index: `social_links_enabled_order (enabled, sort_order)`. Public: footer group "Find me / 社群" from enabled
rows (omitted when none).

### 2.8 Media asset (`media_assets`, `media_usages`)

| Field (brief) | Column | Type | Null | Rule |
| --- | --- | --- | --- | --- |
| type | kind | TEXT CHECK `image`,`audio`,`video`,`document`,`embed`,`link` | no | |
| (storage) | source | `r2` or `external` | no | CHECK: r2 ⇒ storage_key, external ⇒ `https:` external_url |
| (upload state) | state | `pending`,`ready`,`failed` | no | only `ready` is pickable/public |
| URL | storage_key / external_url | TEXT | yes | the public URL is computed: `MEDIA_PUBLIC_BASE_URL + '/' + storage_key` (never stored) |
| (provider) | provider | `r2`,`youtube`,`google_drive`,`github_raw`,`direct`,`external_link` | no | from `parseMediaUrl` |
| filename | filename | TEXT | no | 1–255 chars |
| mimeType | mime_type | TEXT | yes | allowlist for uploads (content-architecture §5.3) |
| size | size_bytes | INTEGER | yes | |
| width / height | width, height | INTEGER | yes | images and video |
| duration | duration_ms | INTEGER | yes | audio and video |
| (title) | title_i18n | TEXT L | no | |
| altText | alt_i18n | TEXT L | no | required (both locales) before any **published** entry may use an image |
| caption | caption_i18n | TEXT L | no | O |
| (credit) | credit | TEXT | yes | O |
| focal point | focal_x, focal_y | REAL 0–1 | yes | O; rendered as CSS classes (no inline style) |
| (preview range) | preview_start_seconds, preview_end_seconds | INTEGER | yes | carried over from `media_items` |
| (tags) | tags_json | TEXT JSON string[] | no | |
| createdAt | created_at, updated_at, archived_at | TEXT | | |

`media_usages(asset_id, entity_type, entity_id, field, scope)` with `scope` = `working` or `published`. It is a
derived index, rebuilt for an entity on every save/publish/unpublish/archive/delete, rebuilt fully by the nightly
cron and by Studio → Media → "Rebuild usage index". Entity types: `project`, `music`, `recognition`, `writing`,
`service`, `brand_settings`, `site_settings`.

Delete safety: a trigger refuses to delete an asset that has a `published`-scope usage. Draft-only usages
produce a warning that lists them; confirming deletes the asset, the R2 object and the usage rows (FK columns in
drafts become NULL via `ON DELETE SET NULL`; JSON references render as "missing asset" in the editor and are
skipped publicly).

Indexes: `media_assets_kind_created (kind, created_at DESC)`, `media_assets_pending (state, created_at) WHERE state <> 'ready'`,
UNIQUE `storage_key`; `media_usages_entity (entity_type, entity_id)`.

### 2.9 Brand settings and site settings (`settings`)

Two singleton rows (`key = 'brand'`, `key = 'site'`) holding validated JSON documents. No draft state: *Save*
applies immediately after full validation (the Studio says so next to the button). `revision` guards concurrent
saves. Media references inside the documents are indexed in `media_usages`.

**BrandSettings** (`key = 'brand'`)

| Field (brief) | Key | Type | Rule |
| --- | --- | --- | --- |
| brandName | brandName | string | 1–40; seeded `"Kamel"`; brand guard |
| tagline | tagline | L | **R** |
| roles | roles | L[] (0–6) | hero roles list |
| heroStatement | heroStatement | L | **R** |
| heroSubtext | heroSubtext | L | O |
| primaryCTA | primaryCta | `{label: L, href}` | href = locale-less internal path (`/commission`) or `https:` URL |
| secondaryCTA | secondaryCta | `{label: L, href} \| null` | |
| shortBio | shortBio | L | home About teaser body |
| longBio | longBio | L | About page lede |
| (about sections) | aboutSections | `[{key, heading: L, body: L (formatted)}]` (0–8) | About page body |
| (capabilities) | capabilities | `[{key, index, title: L, description: L, items: L[3..5], categoryIds: string[]}]` (0–6) | home Capabilities + About |
| locationDisplay | locationDisplay | L | footer base line |
| contactEmail | contactEmail | string (email) | seeded from `CONTACT_EMAIL`; exempt from the brand guard; flagged |
| (flag) | contactEmailConfirmedAt | string \| null | null ⇒ Studio attention item until Kevin confirms or changes the address |
| (flag) | redesignCopyAcknowledgedAt | string \| null | null ⇒ attention item "Review copy migrated from the redesign" (About, capabilities, hero, software services, service areas) |
| portrait, logo, favicon, brandAssets | portraitId, logoId, faviconId, brandAssetIds | asset ids | favicon must be `image/png` |

**SiteSettings** (`key = 'site'`)

| Field (brief) | Key | Type |
| --- | --- | --- |
| siteTitle | siteTitle | L (home `<title>`; other pages use `"<page> — <brandName>"`) |
| siteDescription | siteDescription | L (OpenGraph/JSON-LD description) |
| SEO description | seoDescription | L (`<meta name="description">` default) |
| OpenGraph image | ogImageId | asset id \| null |
| default social image | defaultSocialImageId | asset id \| null |
| contact email | — | not duplicated: the Site settings screen shows `brand.contactEmail` read-only with a link to edit it in Brand |
| navigation | navigation.items | `[{key: 'work'\|'services'\|'about'\|'writing', visible}]` (order and visibility; labels stay UI copy) |
| footer message | footerMessage | L |
| copyright | copyright | L (supports `{year}` and `{brand}` tokens; seeded `"© {year} {brand}"`) |
| availability status | availability | `{status: 'unspecified'\|'available'\|'limited'\|'unavailable', message: L}`; seeded `unspecified` (nothing shown; no invented claim) |
| homepage section visibility | homepage.sections | record of `showreel, selectedWork, capabilities, recognition, services, pricing, about, writing, contact` → boolean |
| featured project / writing / recognition count | homepage.featuredProjectCount (1–12, 4), writingCount (0–12, 3), recognitionCount (0–12, 3) | |
| (home contact band) | homepage.contactBandBody | L |
| (service areas) | serviceAreas | `[{key: 'mixing'\|'song_transition'\|'software', name: L, summary: L, linkLabel: L}]` |
| (services page) | servicesPage.process | `[{title: L}]` |
| (software page) | softwarePage | `{engagementModels: [{key, label, title: L, description: L, priceNote: L}], process: [{title: L}], inquiry: {subject: L, include: L[]}}` |
| (contact band variants) | contactBand | `{default: L, project: L, work: L}` |

When a row is missing (fresh local DB before seeds), `getBrandSettings()` returns `DEFAULT_BRAND_SETTINGS`
(`brandName: "Kamel"`, all text empty, contact email empty) and sections that need text hide.

### 2.10 Slug redirects (`slug_redirects`)

| Column | Type | Rule |
| --- | --- | --- |
| entity_type | TEXT | `project`, `writing` (extensible) |
| from_slug | TEXT | PK with entity_type |
| entity_id | TEXT | target row; redirect resolves to its current `published_slug` |
| created_at | TEXT | |

Written at publish time when `published_slug` changes (old → row). A redirect whose `from_slug` becomes some row's
new published slug is deleted in the same batch (a live URL always beats a redirect). Deleting an entity deletes
its redirects. Public detail loaders: `published_slug = ?` hit → render; else redirect hit → `301` to
`/:lang/<section>/<current published_slug>`; else 404. The legacy `/other/*` → `/writing/*` redirect stays in code.

---

## 3. SQL migrations

Numbering follows `0004_admin_revision.sql`. All statements are idempotent (`IF NOT EXISTS`,
`INSERT OR IGNORE`, deterministic ids). No legacy table is altered or dropped.

| File | Content |
| --- | --- |
| `migrations/0005_cms_schema.sql` | tables, indexes, triggers, snapshot views (below, complete) |
| `migrations/0006_cms_base_seed.sql` | taxonomy terms, brand and site settings, 4 commission-linked services and 7 software services (published) |
| `migrations/0007_cms_legacy_import.sql` | existing D1 works, posts, home showreel, media items, social link group → new tables |
| `migrations/0008_cms_sample_drafts.sql` | file-based placeholder content → draft rows with `todo_content = 1` |

### 3.1 `0005_cms_schema.sql` (complete)

```sql
-- 0005_cms_schema.sql — Content Studio schema. Additive only.

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
-- survive subqueries).
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
```

Publishing (engine, `app/lib/cms/db/lifecycle.server.ts`), one `db.batch`, every statement guarded by the
expected revision so a stale publish changes nothing:

```sql
-- 1. keep the old URL alive
INSERT OR REPLACE INTO slug_redirects (entity_type, from_slug, entity_id, created_at)
SELECT 'project', published_slug, id, ?2 FROM projects
WHERE id = ?1 AND revision = ?3 AND published_slug IS NOT NULL AND published_slug <> slug;
-- 2. a live URL beats a redirect
DELETE FROM slug_redirects WHERE entity_type = 'project'
  AND from_slug = (SELECT slug FROM projects WHERE id = ?1 AND revision = ?3);
-- 3. freeze the snapshot
UPDATE projects SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM project_snapshots s WHERE s.id = projects.id),
  published_slug = slug,
  published_revision = revision,
  published_at = ?2,
  first_published_at = COALESCE(first_published_at, ?2),
  archived_at = NULL,
  updated_at = ?2
WHERE id = ?1 AND revision = ?3 AND todo_content = 0;
```

Validation runs in TypeScript before the batch (on the same view output), and the snapshot byte size is
checked there. `media_usages` for scope `published` are re-synced right after (idempotent; nightly rebuild heals
any gap).

Reorder (any length, one statement, one bound value):

```sql
UPDATE projects
SET sort_order = (SELECT CAST(j.key AS INTEGER) * 10 FROM json_each(?1) j WHERE j.value = projects.id)
WHERE id IN (SELECT value FROM json_each(?1));
```

### 3.2 `0006_cms_base_seed.sql`

```sql
-- Taxonomy (one statement per vocabulary shown; the implementer writes all 19 rows).
INSERT OR IGNORE INTO taxonomy_terms
  (id, vocabulary, slug, label_i18n, data_json, sort_order, created_at, updated_at)
VALUES
  ('term-project_category-software', 'project_category', 'software', '{"zh":"軟體","en":"Software"}', '{}', 10, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-ai', 'project_category', 'ai', '{"zh":"AI","en":"AI"}', '{}', 20, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-interactive', 'project_category', 'interactive', '{"zh":"互動","en":"Interactive"}', '{}', 30, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-creative-technology', 'project_category', 'creative-technology', '{"zh":"創意科技","en":"Creative Technology"}', '{}', 40, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-music', 'project_category', 'music', '{"zh":"音樂","en":"Music"}', '{}', 50, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-mixing', 'project_category', 'mixing', '{"zh":"混音","en":"Mixing"}', '{}', 60, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-research', 'project_category', 'research', '{"zh":"研究","en":"Research"}', '{}', 70, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');
-- recognition_type: award, publication, speaking, event, competition, research (§2.1 labels)
-- service_group: mixing {"area":"mixing"}, song-transition {"area":"song_transition"},
--   music-production {"area":"mixing"}, software-development {"area":"software"},
--   creative-technology {"area":"software"}, interactive-experiences {"area":"software"}

-- Settings (JSON documents; strings copied verbatim from the sources in §6).
INSERT OR IGNORE INTO settings (key, data_json, revision, updated_at)
VALUES ('brand', '{"schemaVersion":1,"brandName":"Kamel", …}', 0, '2026-09-24T00:00:00Z'),
       ('site',  '{"schemaVersion":1, …}', 0, '2026-09-24T00:00:00Z');

-- Commission-linked services (content from SERVICE_CATALOG; no price columns).
INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, commission_service_id,
  name_i18n, short_description_i18n, description_i18n, price_mode,
  turnaround_i18n, deliverables_json, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'svc-full_mix', 'full-mix', 'draft', 'term-service_group-mixing', 'full_mix',
  '{"zh":"完整歌曲混音","en":"Full Song Mixing"}',
  '{"zh":"包含人聲、各式樂器、完整混音與母帶。","en":"Full vocal, instrument, mix and master production."}',
  '{"zh":"包含人聲、各式樂器、完整混音與母帶。","en":"Full vocal, instrument, mix and master production."}',
  'starting_from',
  '{"zh":"7–14 個工作日","en":"7–14 business days"}',
  '[{"zh":"24-bit / 48 kHz WAV Final Master","en":"24-bit / 48 kHz WAV Final Master"},{"zh":"Vocal Stem","en":"Vocal Stem"},{"zh":"Instrumental Mix Stem","en":"Instrumental Mix Stem"}]',
  10, 'catalog:full_mix', '2026-08-10T00:00:00Z', '2026-09-24T00:00:00Z'
);
-- … vocal_mix (20), simple_transition (30, group song-transition), edit_transition (40) likewise.
-- Software offerings: 'svc-software-web' … 'svc-software-custom' (7 rows, group per §6,
-- price_mode 'custom_quote', inquiry_subject_i18n from SOFTWARE_SERVICES.contact.subject).

-- Publish every seeded service through the snapshot view.
UPDATE services SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM service_snapshots s WHERE s.id = services.id),
  published_slug = slug,
  published_revision = revision,
  published_at = '2026-09-24T00:00:00Z',
  first_published_at = '2026-09-24T00:00:00Z'
WHERE (legacy_source GLOB 'catalog:*' OR legacy_source GLOB 'software-services:*')
  AND status = 'draft' AND published_json IS NULL;
```

### 3.3 `0007_cms_legacy_import.sql`

Runs against whatever the production D1 holds (works, posts and pages entered through `/admin`). The file is
data-agnostic: every statement is `INSERT … SELECT` or a guarded `UPDATE`. Legacy tables are read only.

```sql
CREATE VIEW IF NOT EXISTS legacy_latest_v AS
SELECT v.* FROM content_versions v
WHERE v.version_number = (
  SELECT MAX(x.version_number) FROM content_versions x
  WHERE x.entry_id = v.entry_id AND x.locale = v.locale
);

-- The value imported first: the published version, or the latest one for never-published entries.
CREATE VIEW IF NOT EXISTS legacy_initial_v AS
SELECT v.* FROM content_versions v
WHERE v.id IN (SELECT version_id FROM content_publications)
   OR (v.id IN (SELECT id FROM legacy_latest_v)
       AND NOT EXISTS (SELECT 1 FROM content_publications cp WHERE cp.entry_id = v.entry_id));

-- 1. Media items attached to imported versions (ids preserved; block references stay valid).
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
  m.credit, m.start_seconds, m.end_seconds, m.tags_json,
  'media_items:' || m.id, v.created_at, v.created_at
FROM media_items m JOIN content_versions v ON v.id = m.content_version_id
WHERE m.content_version_id IN (SELECT id FROM legacy_initial_v UNION SELECT id FROM legacy_latest_v)
  AND m.url GLOB 'https://?*';

-- 2. Works → projects (category "music", as mergeWorks treats D1 works today).
INSERT OR IGNORE INTO projects (
  id, slug, status, listed, year, primary_category_id, title_i18n, short_description_i18n,
  body_i18n, seo_title_i18n, seo_description_i18n, sort_order, revision, legacy_source,
  created_at, updated_at
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
WHERE legacy_source GLOB 'content_entries:*' AND status = 'draft'
  AND EXISTS (SELECT 1 FROM content_publications p WHERE p.entry_id = projects.id);

-- 4. Overlay newer unpublished drafts onto the working copy (one statement per locale; zh shown).
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
WHERE legacy_source GLOB 'content_entries:*'
  AND EXISTS (SELECT 1 FROM legacy_latest_v l WHERE l.entry_id = projects.id AND l.locale = 'zh'
              AND l.id NOT IN (SELECT id FROM legacy_initial_v));
-- (repeat with 'en')

-- 5. Usage index for body media blocks (working and published scopes).
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'project', p.id, 'body.' || loc.key, 'working'
FROM projects p, json_each(p.body_i18n) AS loc, json_each(loc.value) AS b
WHERE p.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT json_extract(b.value, '$.mediaId'), 'project', p.id, 'body.' || loc.key, 'published'
FROM projects p, json_each(p.published_json, '$.extra.body_i18n') AS loc, json_each(loc.value) AS b
WHERE p.published_json IS NOT NULL AND p.legacy_source GLOB 'content_entries:*'
  AND json_extract(b.value, '$.type') = 'media'
  AND json_extract(b.value, '$.mediaId') IN (SELECT id FROM media_assets);

-- 6. Posts → writings: same four steps against `writings` with
--    platform 'internal', date = substr(first published_at or created_at, 1, 10),
--    excerpt_i18n ← summary, content_i18n ← body_json, snapshot via writing_snapshots,
--    usage JSON path '$.content_i18n'.

-- 7. Home showreel: first media item of the published 'page'/'home' version (zh first, then en).
INSERT OR IGNORE INTO music_tracks (
  id, status, title_i18n, artist_i18n, audio_preview_id, youtube_url,
  is_showreel, legacy_source, created_at, updated_at
)
SELECT 'legacy-showreel', 'draft',
  json_object('zh', m.title, 'en', m.title), '{"zh":"Kamel","en":"Kamel"}',
  CASE WHEN m.kind IN ('direct_audio', 'github_raw_audio', 'cloudflare_r2_audio') THEN m.id END,
  CASE WHEN m.kind = 'youtube' THEN m.url END,
  1, 'media_items:' || m.id, v.created_at, v.created_at
FROM content_publications p
JOIN content_entries e ON e.id = p.entry_id AND e.kind = 'page' AND e.slug = 'home'
JOIN content_versions v ON v.id = p.version_id
JOIN media_items m ON m.content_version_id = v.id
ORDER BY CASE p.locale WHEN 'zh' THEN 0 ELSE 1 END, m.sort_order, m.id
LIMIT 1;
UPDATE music_tracks SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM music_snapshots s WHERE s.id = music_tracks.id),
  published_revision = 0, published_at = updated_at, first_published_at = updated_at
WHERE id = 'legacy-showreel' AND status = 'draft'
  AND (audio_preview_id IS NOT NULL OR youtube_url IS NOT NULL);
-- A Google Drive / external-link showreel stays a draft and raises a Studio attention item.
INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
SELECT audio_preview_id, 'music', id, 'audioPreviewId', scope.v
FROM music_tracks, (SELECT 'working' AS v UNION ALL SELECT 'published') AS scope
WHERE id = 'legacy-showreel' AND audio_preview_id IS NOT NULL
  AND (scope.v = 'working' OR status = 'published');

-- 8. Admin "social" link group → social_links (zh rows carry the order; en label paired by order).
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

-- 9. Footer defaults become editable only when the admin never created groups.
--    INSERT the 'work_resources' group (GitHub profile, site repository) into link_groups /
--    links / link_group_labels WHERE NOT EXISTS (SELECT 1 FROM link_groups).

DROP VIEW IF EXISTS legacy_initial_v;
DROP VIEW IF EXISTS legacy_latest_v;
```

Legacy `social_image_url` values become external image assets (`legacy-social-<version id>`) linked through
`social_image_id` (one extra `INSERT … SELECT` + `UPDATE` per table). Legacy `thumbnail_url` and
`media_items.published_at` have no target and stay in the legacy table. `content_entries` of kind `page` other
than `home` are not read by any public route today and are not imported (listed by the inventory query in
content-architecture §6.5).

### 3.4 `0008_cms_sample_drafts.sql`

File placeholders become drafts with `todo_content = 1`. `INSERT OR IGNORE` means a legacy row that already
owns a slug wins. Example (one project; the other rows follow the table in §6):

```sql
INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, approach_i18n,
  architecture_i18n, result_i18n, featured, featured_order, sort_order, legacy_source,
  created_at, updated_at
) VALUES (
  'seed-p-001', 'sample-generative-audio-visual-tool', 'draft', 1, 2026,
  'term-project_category-ai',
  '{"zh":"示意：生成式影音工具","en":"Sample: Generative Audio-Visual Tool"}',
  '{"zh":"…","en":"Design & development"}',
  '{"zh":"…","en":"…"}', '[]', '["TypeScript","Web Audio API","Canvas 2D"]',
  '{"zh":"…","en":"…"}', '{"zh":"…","en":"…"}', '{"zh":"…","en":"…"}', '{"zh":"…","en":"…"}',
  0, NULL, 10, 'file:projects/p-001', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);
INSERT OR IGNORE INTO project_categories (project_id, term_id, position) VALUES
  ('seed-p-001', 'term-project_category-ai', 0),
  ('seed-p-001', 'term-project_category-software', 1);
```

Sample rows are never featured (`featured = 0`), so a homepage cannot point at them even by accident.

---

## 4. Typed models (zod shapes)

Files: `app/lib/cms/schemas/*.ts` (client-safe; used by Studio forms and the server). Each model exports:
`XContent` (parsed, camelCase), `XDraftSchema` (form input → `XContent`, structural rules only),
`XSnapshotSchema` (view/snapshot JSON → `XContent`), `validateXForPublish(content, ctx): ValidationIssue[]`,
and `xContentToColumns(content)` (bind values for the save `UPDATE`).

```ts
// schemas/common.ts
type Locale = "zh" | "en";
type LocalizedText = { zh: string; en: string };
type LocalizedBlocks = { zh: ContentBlock[]; en: ContentBlock[] }; // ContentBlock from block-schema.ts
type EntryStatus = "draft" | "published" | "archived";
type EntityType = "project" | "music" | "recognition" | "writing" | "service";
type AssetRef = string; // media_assets.id
type LinkItem = { label: LocalizedText; url: string };
type CreditItem = { role: LocalizedText; name: string };

type ValidationIssue = {
  field: string;               // dotted path, e.g. "story.context", "gallery.2.assetId"
  locale?: Locale;
  code:
    | "required" | "required_locale" | "one_locale_only" | "invalid_url" | "slug_taken"
    | "slug_invalid" | "todo_content" | "brand_name" | "alt_required" | "missing_asset"
    | "wrong_asset_kind" | "price_required" | "price_forbidden" | "too_long" | "snapshot_too_large";
  severity: "error" | "warning";  // errors block publish; warnings never do
  message: string;                // English Studio copy
};

type EntityMeta = {
  id: string; type: EntityType; status: EntryStatus; todoContent: boolean;
  featured: boolean; featuredOrder: number | null; sortOrder: number;
  revision: number; publishedRevision: number | null; hasUnpublishedChanges: boolean;
  slug?: string; publishedSlug?: string | null; listed?: boolean; isShowreel?: boolean;
  createdAt: string; updatedAt: string; publishedAt: string | null;
  firstPublishedAt: string | null; archivedAt: string | null;
};

// schemas/project.ts
type ProjectContent = {
  slug: string; listed: boolean; year: number | null;
  primaryCategoryId: string | null; categoryIds: string[];
  title: LocalizedText; role: LocalizedText; shortDescription: LocalizedText; description: LocalizedText;
  tools: string[]; technologies: string[];
  coverImageId: AssetRef | null; coverVideoId: AssetRef | null; socialImageId: AssetRef | null;
  gallery: Array<{ assetId: AssetRef; caption: LocalizedText }>;
  links: LinkItem[]; credits: CreditItem[];
  story: Record<"context" | "problem" | "approach" | "process" | "architecture" | "result" | "reflection", LocalizedText>;
  body: LocalizedBlocks;
  seo: { title: LocalizedText; description: LocalizedText };
};

// schemas/music.ts
type MusicContent = {
  projectId: string | null;
  title: LocalizedText; artist: LocalizedText; role: LocalizedText; genre: LocalizedText; description: LocalizedText;
  year: number | null; credits: CreditItem[];
  artworkId: AssetRef | null; audioPreviewId: AssetRef | null; fullAudioId: AssetRef | null;
  durationMs: number | null; previewStartSeconds: number | null; previewEndSeconds: number | null;
  spotifyUrl: string | null; youtubeUrl: string | null; soundcloudUrl: string | null; otherLinks: LinkItem[];
};

// schemas/recognition.ts
type RecognitionContent = {
  typeTermId: string | null; disciplineTermId: string | null; projectId: string | null;
  year: number | null; date: string | null;
  organization: LocalizedText; event: LocalizedText; result: LocalizedText; description: LocalizedText;
  url: string | null; imageId: AssetRef | null;
};

// schemas/writing.ts
type WritingPlatform = "internal" | "threads" | "instagram" | "medium" | "devpost" | "other";
type WritingContent = {
  slug: string; listed: boolean; date: string | null;
  platform: WritingPlatform; platformLabel: string | null; categoryTermId: string | null;
  title: LocalizedText; excerpt: LocalizedText; content: LocalizedBlocks;
  externalUrl: string | null; coverImageId: AssetRef | null; socialImageId: AssetRef | null;
  seo: { title: LocalizedText; description: LocalizedText };
};

// schemas/service.ts
type PriceMode = "fixed" | "starting_from" | "custom_quote" | "contact";
type ServiceContent = {
  slug: string; groupTermId: string | null;
  commissionServiceId: ServiceId | null;   // read-only in the Studio
  name: LocalizedText; shortDescription: LocalizedText; description: LocalizedText;
  priceMode: PriceMode; priceAmount: number | null; currency: "TWD" | "USD" | null;
  turnaround: LocalizedText; revisions: LocalizedText;
  deliverables: LocalizedText[]; requirements: LocalizedText[];
  process: Array<{ title: LocalizedText; body: LocalizedText }>;
  faq: Array<{ question: LocalizedText; answer: LocalizedText }>;
  inquirySubject: LocalizedText;
};

// schemas/social-link.ts
type SocialPlatform = "threads" | "instagram" | "github" | "youtube" | "spotify" | "soundcloud" | "linkedin" | "devpost" | "email" | "other";
type SocialLink = { id: string; platform: SocialPlatform; label: LocalizedText; url: string; username: string | null; icon: string | null; enabled: boolean; sortOrder: number };

// schemas/media-asset.ts
type MediaKind = "image" | "audio" | "video" | "document" | "embed" | "link";
type MediaAsset = {
  id: string; kind: MediaKind; source: "r2" | "external"; state: "pending" | "ready" | "failed";
  storageKey: string | null; externalUrl: string | null;
  provider: "r2" | "youtube" | "google_drive" | "github_raw" | "direct" | "external_link";
  filename: string; mimeType: string | null; sizeBytes: number | null;
  width: number | null; height: number | null; durationMs: number | null;
  title: LocalizedText; alt: LocalizedText; caption: LocalizedText; credit: string | null;
  focalX: number | null; focalY: number | null;
  previewStartSeconds: number | null; previewEndSeconds: number | null; tags: string[];
  createdAt: string; updatedAt: string; archivedAt: string | null;
};
type MediaUsage = { entityType: EntityType | "brand_settings" | "site_settings"; entityId: string; field: string; scope: "working" | "published"; label: string; status: EntryStatus | null };

// schemas/taxonomy.ts
type Vocabulary = "project_category" | "recognition_type" | "writing_category" | "service_group";
type Term = { id: string; vocabulary: Vocabulary; slug: string; label: LocalizedText; data: Record<string, unknown>; sortOrder: number; archivedAt: string | null };

// schemas/brand-settings.ts, schemas/site-settings.ts: the documents in §2.9, each with a
// full-validation schema used on save (settings have no draft state).
```

`app/lib/cms/validation.ts` wraps the per-model validators and adds the shared rules: slug availability
(injected checker), asset existence and kind (injected lookup), alt text on used images, `todo_content`, the brand
guard (`app/lib/cms/brand-guard.server.ts`, server-only so the deny list never reaches a client bundle), and the
snapshot byte limit.

---

## 5. Repository function signatures

### 5.1 Lifecycle engine (foundation, `app/lib/cms/db/lifecycle.server.ts`)

```ts
type ContentOf<T extends EntityType> = { project: ProjectContent; music: MusicContent; recognition: RecognitionContent; writing: WritingContent; service: ServiceContent }[T];
type Loaded<T extends EntityType> = { meta: EntityMeta; content: ContentOf<T>; published: ContentOf<T> | null };
type PublishOutcome = { ok: true; meta: EntityMeta } | { ok: false; issues: ValidationIssue[] };

getEntity<T>(db: D1Database, type: T, id: string): Promise<Loaded<T> | null>;
createEntity<T>(db, type: T, input: Partial<ContentOf<T>>, opts?: { todoContent?: boolean; now?: Date }): Promise<EntityMeta>;
saveEntity<T>(db, type: T, id: string, expectedRevision: number, content: ContentOf<T>, now: Date): Promise<EntityMeta>; // throws StaleRevisionError (409)
validateEntity<T>(db, type: T, id: string): Promise<ValidationIssue[]>;          // publish readiness for the panel
publishEntity<T>(db, type: T, id: string, expectedRevision: number, now: Date): Promise<PublishOutcome>;
unpublishEntity(db, type: EntityType, id: string, now: Date): Promise<EntityMeta>;
archiveEntity(db, type: EntityType, id: string, now: Date): Promise<EntityMeta>;
restoreEntity(db, type: EntityType, id: string, now: Date): Promise<EntityMeta>;     // archived → draft
revertToPublished(db, type: EntityType, id: string, expectedRevision: number, now: Date): Promise<EntityMeta>;
duplicateEntity(db, type: EntityType, id: string, now: Date): Promise<EntityMeta>;   // draft copy, slug "-copy[-n]", not featured
deleteEntity(db, type: EntityType, id: string, confirmation: string): Promise<void>; // confirmation = slug or "DELETE"
setFeatured(db, type: EntityType, id: string, featured: boolean): Promise<void>;   // appends to featured order
reorder(db, type: EntityType, orderedIds: string[], field: "sort_order" | "featured_order"): Promise<void>;
setShowreel(db, trackId: string | null): Promise<void>;
listEntityOptions(db, type: EntityType, opts?: { q?: string; statuses?: EntryStatus[] }): Promise<Array<{ id: string; label: string; status: EntryStatus }>>;
checkSlug(db, type: "project" | "writing" | "service", slug: string, excludeId?: string): Promise<{ available: boolean; conflict?: { id: string; label: string; status: EntryStatus; kind: "working" | "published" | "redirect" } }>;
getWorkingSnapshot<T>(db, type: T, id: string): Promise<ContentOf<T> | null>;       // preview input (view output)
```

### 5.2 Shared stores (foundation)

```ts
// app/lib/cms/taxonomy.server.ts
listTerms(db, vocabulary: Vocabulary, opts?: { includeArchived?: boolean }): Promise<Term[]>;
createTerm(db, vocabulary: Vocabulary, input: { label: LocalizedText; slug?: string; data?: object }): Promise<Term>;
updateTerm(db, id: string, input: { label?: LocalizedText; slug?: string; data?: object }): Promise<Term>;
archiveTerm(db, id: string): Promise<void>;
deleteTerm(db, id: string): Promise<void>;           // throws term_in_use
reorderTerms(db, vocabulary: Vocabulary, ids: string[]): Promise<void>;

// app/lib/cms/settings.server.ts (read) — write lives in settings-write.server.ts (P4)
getBrandSettings(db): Promise<{ value: BrandSettings; revision: number }>;
getSiteSettings(db): Promise<{ value: SiteSettings; revision: number }>;

// app/lib/cms/media/assets.server.ts
getAssets(db, ids: string[]): Promise<Map<string, MediaAsset>>;
searchAssets(db, q: { text?: string; kind?: MediaKind; limit: number; cursor?: string }): Promise<{ items: MediaAsset[]; next: string | null }>;
registerExternalAsset(db, input: { url: string; title?: LocalizedText; alt?: LocalizedText }, config: MediaConfig): Promise<MediaAsset>;

// app/lib/cms/db/usage.server.ts
extractAssetRefs(type: EntityType | "brand_settings" | "site_settings", content: unknown): Array<{ assetId: string; field: string }>;
syncUsages(db, entityType, entityId: string, refs: { working: AssetRefHit[]; published: AssetRefHit[] }): Promise<void>;
rebuildAllUsages(db): Promise<{ assets: number; usages: number }>;
```

### 5.3 Studio repositories (parallel packages)

```ts
// projects.server.ts (P1)
listStudioProjects(db, f: { q?: string; status?: EntryStatus | "all"; categoryId?: string; year?: number; featured?: boolean; sort?: "order" | "updated" | "year" }): Promise<StudioProjectRow[]>;
getProjectFacets(db): Promise<{ years: number[]; categories: Term[] }>;
parseProjectForm(formData: FormData): { content: ProjectContent; expectedRevision: number };

// music.server.ts (P2)
listStudioMusic(db, f: { q?; status?; artist?; year?; role?; featured?: boolean }): Promise<StudioMusicRow[]>;
parseMusicForm(formData): { content: MusicContent; expectedRevision: number };
// media-library.server.ts (P2)
listLibrary(db, f: { q?; kind?; usage?: "used" | "unused"; missingAlt?: boolean; cursor? }): Promise<{ items: LibraryRow[]; next: string | null }>;
getAssetWithUsages(db, id: string): Promise<{ asset: MediaAsset; usages: MediaUsage[] } | null>;
updateAssetMetadata(db, id: string, patch: Partial<Pick<MediaAsset, "title" | "alt" | "caption" | "credit" | "focalX" | "focalY" | "tags" | "previewStartSeconds" | "previewEndSeconds">>): Promise<MediaAsset>;
deleteAsset(db, bucket: R2Bucket | undefined, id: string, opts: { acknowledgeDraftUsages: boolean }): Promise<void>; // throws media_asset_in_published_use
createPendingUpload(db, input: UploadDeclaration, config: MediaConfig): Promise<{ assetId: string; uploadUrl: string }>;
receiveUpload(db, bucket: R2Bucket, assetId: string, request: Request, config: MediaConfig): Promise<MediaAsset>;
cleanupPendingUploads(db, bucket: R2Bucket | undefined, now: Date): Promise<number>;

// recognition.server.ts, writing.server.ts, social-links.server.ts (P3)
listStudioRecognition(db, f: { q?; year?; typeTermId?; status? }): Promise<StudioRecognitionRow[]>;
listStudioWriting(db, f: { q?; platform?; status?; categoryTermId? }): Promise<StudioWritingRow[]>;
listSocialLinks(db): Promise<SocialLink[]>;
saveSocialLink(db, input: SocialLinkInput): Promise<SocialLink>;
deleteSocialLink(db, id: string): Promise<void>;
reorderSocialLinks(db, ids: string[]): Promise<void>;

// services.server.ts, settings-write.server.ts, homepage.server.ts, studio-home.server.ts (P4)
listStudioServices(db, f: { q?; status?; groupTermId? }): Promise<StudioServiceRow[]>; // includes live price for commission rows
saveBrandSettings(db, expectedRevision: number, value: BrandSettings): Promise<{ revision: number }>;
saveSiteSettings(db, expectedRevision: number, value: SiteSettings): Promise<{ revision: number }>;
getHomepageModel(db, locale?: Locale): Promise<HomepageModel>;   // featured lists per type, showreel, hero, sections
getStudioHome(db, now: Date): Promise<StudioHomeModel>;           // counts, recent changes, attention, commission queue
```

### 5.4 Public reads (foundation builds, P5 owns after foundation; `app/lib/cms/public/*.server.ts`)

All take `mode: "published" | "preview"` (default published). Preview mode reads working snapshots of
non-archived rows, includes drafts and `todo_content` rows (badged), and is only callable from `/studio/preview/*`.

```ts
getPublicSiteContext(db, env, locale): Promise<PublicSiteContext>;    // brand, site, nav, footer groups, social, mediaConfig
listPublicProjects(db, env, locale, q?: { category?: string }): Promise<PublicProjectCard[]>;
getPublicProject(db, env, locale, slug): Promise<{ kind: "found"; project: PublicProjectDetail } | { kind: "redirect"; to: string } | { kind: "missing" }>;
listHomeProjects(db, env, locale, count: number): Promise<PublicProjectCard[]>;
getShowreel(db, env, locale): Promise<MediaItem | null>;
listProjectMusic(db, env, locale, projectId: string): Promise<PublicMusicItem[]>;
listPublicRecognition(db, env, locale, q?: { limit?: number; home?: boolean }): Promise<PublicRecognitionItem[]>;
listPublicWriting(db, env, locale, q?: { limit?: number; home?: boolean }): Promise<PublicWritingItem[]>;
getPublicWriting(db, env, locale, slug): Promise<{ kind: "found"; writing: PublicWritingDetail } | { kind: "redirect"; to: string } | { kind: "missing" }>;
listPublicServices(db, env, locale, q?: { area?: "mixing" | "song_transition" | "software" }): Promise<PublicServiceItem[]>;
getCommissionServiceView(db, env, locale, serviceId: ServiceId): Promise<PublicServiceItem | null>; // null when unpublished
getAreaStartingPrices(db, now: Date): Promise<{ mixing: number | null; song_transition: number | null }>;
listCategoryFilters(db, locale, items: PublicProjectCard[]): Promise<CategoryFilterOption[]>;
// view builders (client-safe, used by preview-of-unsaved-form too)
buildProjectView(content: ProjectContent, locale, ctx: ViewContext): PublicProjectDetail;  // etc. per type
```

---

## 6. Seed mapping

Status legend: **Pub** = published by the migration, **Draft/TODO** = `status='draft'`, `todo_content=1`,
**Settings** = lives in a settings document (live on save), **Stays** = legacy/canonical table unchanged.

### 6.1 File-based content (`app/content/*`, component constants)

| Source | Entry | Target | Status | Notes |
| --- | --- | --- | --- | --- |
| `app/content/projects.ts` | p-001 Sample: Generative Audio-Visual Tool | `projects` `seed-p-001` | Draft/TODO | categories ai (primary), software; sections context, approach, system→architecture, result |
| | p-002 Sample: Full Song Mix — Indie Single | `seed-p-002` | Draft/TODO | mixing, music; context, process, result |
| | p-003 Sample: Interactive Projection Study | `seed-p-003` | Draft/TODO | interactive; context, design→approach, reflection |
| | p-004 Sample: Booking Management System | `seed-p-004` | Draft/TODO | software; problem, system→architecture, result |
| | p-005 Sample: Vocal Production Session | `seed-p-005` | Draft/TODO | music; context, process |
| | p-006 Sample: Real-Time Audio Analysis Notes | `seed-p-006` | Draft/TODO | research, ai; context, approach, reflection |
| (all projects) | `featured`, `services[]`, `placeholder` | — | — | never featured; file `services[]` has no target field and is dropped; `placeholder` → `todo_content` |
| `app/content/recognition.ts` | r-001 Sample: Hackathon Entry | `recognitions` `seed-r-001` | Draft/TODO | type competition, discipline software |
| | r-002 Sample: Music Production Competition | `seed-r-002` | Draft/TODO | type competition, discipline music |
| | r-003 Sample: Creative Technology Showcase | `seed-r-003` | Draft/TODO | type event, discipline interactive |
| `app/content/writing.ts` | w-001 Sample: Why I Build Tools… (kamelkyp.com) | `writings` `seed-w-001` | Draft/TODO | platform internal, empty content |
| | w-002 Sample: Notes on Mixing Vocals… (Threads) | `seed-w-002` | Draft/TODO | platform threads, external_url NULL |
| | w-003 Sample: Studio Session Snapshot (Instagram) | `seed-w-003` | Draft/TODO | platform instagram |
| | w-004 Sample: Building a Bilingual Site… (kamelkyp.com) | `seed-w-004` | Draft/TODO | platform internal |
| `app/content/capabilities.ts` | software, ai-creative, interactive, sound | `brand.capabilities[]` | Settings | redesign copy, not placeholder-flagged: **Kevin confirms** |
| `app/content/about.ts` | lede | `brand.longBio` | Settings | confirm |
| | teaser.body | `brand.shortBio` | Settings | teaser heading ("關於/About") stays UI copy |
| | sections what/think/connect/work | `brand.aboutSections[]` | Settings | `items` folded into body as `- ` lines; confirm |
| `app/content/software-services.ts` | 7 offerings | `services` `svc-software-<id>` | Pub | groups: web, prototypes, ai, internal, custom → software-development; creative-tech → creative-technology; installations → interactive-experiences; price_mode custom_quote; confirm |
| | engagementModels, process | `site.softwarePage` | Settings | "Contact for quote" notes, never a number |
| | contact.subject / include | `services.inquiry_subject_i18n`, `site.softwarePage.inquiry` | Pub / Settings | `contact.email` → `brand.contactEmail` |
| `app/lib/services/catalog.ts` | full_mix, vocal_mix, simple_transition, edit_transition | `services` `svc-<id>` | Pub | name, shortDescription, standardDays → turnaround, deliverables; `basePriceTwd` **not** copied (price = `price_versions`) |
| `app/components/home/hero.tsx` | roles, statement | `brand.roles`, `brand.heroStatement` | Settings | `realName` (楊子賢 / Kevin Yang) **dropped** |
| | label, viewWork, showreel empty strings | UI copy (stays in code) | | |
| `app/lib/i18n/copy.ts` | metaTitleHome | `site.siteTitle` | Settings | |
| | metaDescription | `site.seoDescription`, `site.siteDescription` | Settings | |
| | footerLead | `site.footerMessage` | Settings | |
| | footerBase | `brand.locationDisplay` | Settings | |
| | ctaBandDefault / Project / Work | `site.contactBand` | Settings | |
| | CONTACT_EMAIL | `brand.contactEmail` | Settings | **flagged** (`contactEmailConfirmedAt: null`) |
| | nav/button/error strings | UI copy (stays) | | |
| `app/routes/public/services-index.tsx` + `app/components/home/services-overview.tsx` | 3 area blurbs | `site.serviceAreas` | Settings | |
| | 4 process steps | `site.servicesPage.process` | Settings | |
| `app/routes/public/home.tsx` | contact band body | `site.homepage.contactBandBody` | Settings | |
| `app/lib/content/footer-repository.server.ts` | default groups | navigate/services/legal: code (site structure); work_resources: `link_groups` seed when empty; contact: computed from `brand.contactEmail` | | email label/url no longer hard-coded |

### 6.2 Existing D1 content (production, entered through `/admin`)

| Legacy source | Target | Status | Notes |
| --- | --- | --- | --- |
| `content_entries` kind `work` + versions/publications | `projects` (same id) | Pub if any locale was published, else Draft | category music; year from first publication; body blocks → `body_i18n`; newer drafts overlaid on the working copy (`revision = 1`, "unpublished changes") |
| `content_entries` kind `post` | `writings` (same id) | same rule | platform internal |
| `content_entries` kind `page`, slug `home` | `music_tracks` `legacy-showreel` (`is_showreel = 1`) | Pub if its first media item is audio or YouTube | other home media stay as library assets |
| other `page` entries | not imported | Stays | not rendered by any public route today |
| `media_items` of imported versions | `media_assets` (same id) + `media_usages` | ready | legacy duplicates (draft and published versions each own rows) are kept |
| `content_versions.social_image_url` | external image asset + `social_image_id` | | |
| `link_groups`/`links` key `social` | `social_links` | enabled as before | footer renders them as the "Find me" group |
| other `link_groups` (workRepository, otherWebsite, footer, postReference) | stay in `link_groups` | Stays | edited in Studio → Settings → Footer |
| `service_definitions`, `price_versions` | unchanged | Stays (canonical) | mixing/transition prices from Kevin's 2026-08-10 spec migrate as-is: **Kevin confirms** |
| `term_documents`/`term_versions`/`term_publications` | unchanged | Stays (canonical) | edited in Studio → Services → Terms; audited, not rewritten |
| `cases`, `case_runtime`, `submission_attempts`, `fx_rates` | unchanged | Stays | Studio → Commissions |
