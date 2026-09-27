# Content Architecture: Kamel Content Studio

Status: design, 2026-09-24, branch `content-studio` (stacked on the editorial redesign).
Requirements: `docs/superpowers/specs/2026-09-24-content-studio-brief.md` (39 items).
Companions: `docs/content-schema.md` (tables, SQL, types, seed mapping) and `docs/admin-architecture.md`
(Studio routes, auth flow, UX, visual spec). These three documents win over the brief where they are more
specific. Brief sections are cited as §n.

---

## 1. Current state (brief §39 steps 1–4)

### 1.1 Framework and deployment

| Area | Finding (file) |
| --- | --- |
| App framework | React Router **8.3** framework mode, SSR (`react-router.config.ts`: `ssr: true`), React 19.2, Vite 8 with `@cloudflare/vite-plugin` (`vite.config.ts`). Route config in `app/routes.ts`. Middleware-era context API: `RouterContextProvider` + `createContext` (`app/lib/cloudflare/context.ts`). |
| Runtime | One Cloudflare Worker (`workers/app.ts`): builds a per-request CSP nonce and request id, runs the React Router handler, then sets security headers and `Cache-Control: no-store` where required. `scheduled()` runs daily at 01:15 UTC: FX refresh + orphan submission cleanup. |
| Wrangler | `wrangler.base.jsonc`: D1 binding `DB` (`migrations_dir: migrations`), cron, observability. **No R2, KV or Images binding.** |
| Per-environment config | `scripts/render-wrangler-config.mjs` renders `build/server/.wrangler.generated.jsonc`: Worker name, D1 id (`kamelkyp-production` / `kamelkyp-preview`), rate limiter, production custom domain `kamelkyp.com`, vars `TURNSTILE_SITE_KEY`, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ADMIN_EMAIL`, `FX_API_URL`, `APP_ORIGIN`, required secrets. `scripts/render-worker-secrets.mjs` writes the four secrets file (`TURNSTILE_SECRET`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_HMAC_SECRET`, `CSRF_SECRET`). `scripts/verify-production-config.mjs` validates vars, bindings and secrets and **fails if the production build contains `TEST_ADMIN_BYPASS` or a test JWT key**. |
| Delivery | `.github/workflows/`: `ci`, `e2e` (loopback Worker + Playwright), `deploy-preview` (PR Worker on workers.dev), `deploy-production` (manual, main only: time-travel bookmark → `d1 migrations apply --remote` → deploy → health check). |
| Dependencies | zod 4.4, jose 6.2, wavesurfer.js, isbot, Fontsource. No UI library, no ORM. Node 24. |

### 1.2 Security headers and CSP (`app/lib/security/headers.server.ts`, `csp-nonce.server.ts`)

`default-src 'self'; script-src 'self' 'nonce-…' https://challenges.cloudflare.com; style-src 'self';
img-src 'self' https: data:; media-src 'self' https:; connect-src 'self' https://challenges.cloudflare.com;
frame-src youtube-nocookie, drive.google.com, challenges.cloudflare.com; frame-ancestors 'none';
form-action 'self'; object-src 'none'`. Consequences for the Studio: **no inline `style` attributes** (so no
React `style` props, no CSS custom properties set in markup), no `blob:` URLs for image/audio previews, no
framing of our own pages. `requiresNoStore()` covers `/admin*`, `/commission/*`, the submit API and errors.

### 1.3 Locale routing (`app/lib/i18n/*`)

Separate URLs and content per locale: `/:lang/...` with `lang ∈ {zh, en}` (`isLocale`), `/` redirects by cookie
(`language-redirect.tsx`, `locale-cookie.server.ts`), `localePath` / `switchLocalePath` build links, legacy
`/:lang/other[/:slug]` 301s to `/writing`. Nothing is machine-translated; every text exists twice.

### 1.4 D1 schema today (migrations 0001–0004)

| Table | Purpose | Notes |
| --- | --- | --- |
| `content_entries` | page / work / post identity: `kind`, `slug` (unique per kind), `sort_order`, `is_listed` | |
| `content_versions` | per-locale versions: `state` draft/published, title, summary, `body_json` (blocks), SEO fields, `revision` | published versions immutable (0004 triggers) |
| `content_publications` | pointer (entry, locale) → published version | maintained by trigger on draft→published |
| `media_items` | media attached to one content version: `kind` (youtube, google_drive, direct_audio, github_raw_audio, cloudflare_r2_audio, external_link), `url`, title, preview range, description, thumbnail, credit, tags | external URLs only |
| `link_groups`, `links`, `link_group_labels` | footer / link groups; links stored per locale | admin keys `social`, `workRepository`, `otherWebsite`, `footer`, `postReference` |
| `service_definitions` | the four commission services (`full_mix`, `vocal_mix`, `simple_transition`, `edit_transition`) | CHECK-constrained ids |
| `price_versions` | immutable price rules (`base_twd`, per-song fee, bps modifiers, `effective_from`, `retired_at`) | seeded 2026-08-10: 8000 / 4000 / 1000 (+200) / 4000 (+800) |
| `term_documents`, `term_versions`, `term_publications` | legal texts per locale, immutable versions | published only with a legal-review checkbox |
| `fx_rates` | daily TWD→USD | cron |
| `cases`, `submission_attempts`, `case_runtime` | commission cases, idempotent submission, student review, cleanup schedule | no PII columns (tested) |

### 1.5 Current content model and flows

- **Versioned pages/works/posts.** Admin creates an entry + draft version per locale, saves with optimistic
  `revision`, publishes (state flip; trigger moves the publication pointer), can unpublish (deletes pointer).
  zh and en publish independently. Bodies are block arrays (`app/lib/content/block-schema.ts`: heading, paragraph,
  list, quote, external_image, external_link, media, divider; ≤ 300 blocks).
- **Media** rows belong to one version; `media` blocks reference them by id. `listMediaForVersion` re-parses every
  URL with `parseMediaUrl` (`app/lib/media/parse-media-url.ts`) and drops invalid rows.
- **Public reads of D1 today:** home (`page/home` media[0] = hero showreel; newest work; posts), `/works` and
  `/works/:slug` (D1 works merged with file projects, D1 wins on slug), `/writing` and `/writing/:slug` (D1 posts
  merged with file entries), footer groups (D1 groups replace code defaults when any exist), `/terms`, `/privacy`,
  service pages (active price rule for the student-discount note), commission wizard (active price rule, terms).
- **Prices drift today.** Marketing pages print `SERVICE_CATALOG.basePriceTwd` (`app/lib/services/catalog.ts`),
  while quotes use D1 `price_versions`. Publishing a new price in `/admin/services` changes quotes but not pages.
- **Admin** (`/admin/*`, `app/routes/admin/*`, `app/lib/admin/*`): generic content editor, works (create + media
  JSON), posts, links (group editor), services (publish price version), terms (publish term version), cases
  (list, status, student discount, verified cleanup through Apps Script).

### 1.6 File-based content added by the redesign (`app/content/*`)

| File | Entries | Placeholder | Consumers |
| --- | --- | --- | --- |
| `projects.ts` | 6 (p-001…p-006), all `Sample:` / `示意：`, slugs `sample-*` | all `true` | `routes/public/home.tsx`, `works-index.tsx`, `work-detail.tsx`, `services-software.tsx` |
| `recognition.ts` | 3 (r-001…r-003), `Sample:` events | all `true` | `components/home/recognition.tsx` (**imports data directly**) |
| `writing.ts` | 4 (w-001…w-004), `Sample:` titles, no URLs | all `true` | `home.tsx`, `writing-index.tsx` |
| `capabilities.ts` | 4 (software, ai-creative, interactive, sound) | not flagged | `components/home/capabilities.tsx` (**direct import**), `routes/public/about.tsx` |
| `software-services.ts` | 7 offerings, 2 engagement models, 5 process steps, contact block | not flagged; no prices | `services-software.tsx` |
| `about.ts` | lede, teaser, 4 sections | not flagged | `components/home/about-teaser.tsx` (**direct import**), `about.tsx` |
| `schema.ts`, `index.ts` | zod schemas, helpers (`mergeWorks`, `mergeWriting`, `listRecognition`, category labels), `REAL_NAME` regex | | exported through `app/content/index.ts` into client bundles |

Other portfolio copy in code: `components/home/hero.tsx` (roles, statement, **real-name line**),
`components/home/services-overview.tsx` and `routes/public/services-index.tsx` (service-area blurbs, process),
`lib/i18n/copy.ts` (site title/description, footer lead and base line, contact-band lines, `CONTACT_EMAIL`),
`lib/content/footer-repository.server.ts` (default footer groups including the contact email).

### 1.7 Auth today

- `app/lib/auth/access-jwt.server.ts`: reads `Cf-Access-Jwt-Assertion`, verifies with jose against the remote JWKS
  `<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, `iss = ACCESS_TEAM_DOMAIN`, `aud = ACCESS_AUD`, claims `sub`,
  `email`, `type: "app"`; the email must equal `ADMIN_EMAIL`. **Any failure, including a missing header, throws
  `Response 403`: fail closed.** (e2e `final-acceptance` and `security-headers` assert `/admin` → 403 + no-store.)
- `app/lib/auth/admin.server.ts`: `requireAdmin` (reads) and `requireAdminMutation` (POST/PUT/PATCH/DELETE only,
  Access + CSRF). Every admin child loader calls `requireAdmin` itself; React Router runs loaders in parallel, so
  a layout-only check would not protect children.
- `app/lib/auth/csrf.server.ts`: HMAC-SHA256 token bound to the Access `sub`, 30-minute lifetime, `Origin` must
  equal `APP_ORIGIN`. Delivered by the admin layout loader through outlet context.
- Access application (runbook `docs/runbooks/cloudflare-setup.md` §5): self-hosted app on `kamelkyp.com` (and the
  preview hostname) with paths `/admin`, `/admin/*`, `/api/admin/*`, One-time PIN, Allow policy = Kevin's email,
  8 h session.
- Tests: worker tests inject a fake `JwtVerifier` (`tests/worker/admin-guard.test.ts`) and exercise admin
  *services* directly. There is no browser admin session in e2e. The loopback runner writes
  `TEST_ADMIN_BYPASS=true` to `.dev.vars`, but **no application code reads it**, and `verify:production` rejects
  any build that contains the string.

### 1.8 Storage today

No R2 binding. Media are external URLs. `media.kamelkyp.com` is hard-coded as the "approved R2 host" in
`routes/public/home.tsx:22`, `work-detail.tsx:46`, `writing-detail.tsx:10`, `routes/admin/works.tsx:55` and as the
default of `components/content/block-renderer.tsx:70`. Web Audio analysis is gated by
`CORS_AUDIO_HOSTS = {"raw.githubusercontent.com"}` in `app/lib/motion/audio-level.ts:22`, which deliberately
excludes `media.kamelkyp.com` until its bucket has a CORS policy; `direct-audio-preview.tsx:205` sets
`crossOrigin = "anonymous"` only for those hosts (a non-CORS element routed through Web Audio plays silence).

### 1.9 Tests today and what the CMS change breaks

| Suite | Files affected | Why | Owner (§9) |
| --- | --- | --- | --- |
| unit | `tests/unit/content/content-schema.test.ts`, `content-helpers.test.ts` | `app/content` is removed | P5 |
| unit | `footer-repository.test.ts` | contact email and group composition move to settings | P5 |
| unit | `service-catalog.test.ts`, `service-pages.test.tsx` | catalog loses prices and copy | P5 |
| unit | `block-renderer.test.tsx` | `r2Hosts` default removed (media config context) | F |
| unit | `motion-tokens.test.ts` (`isCorsAudioHost` defaults) | CORS hosts come from config | P2 |
| unit | `admin-block-form.test.ts` | legacy admin form parsing deleted | I |
| unit | `security-headers.test.ts`, `config-contract.test.ts`, `production-config.test.ts` | Studio headers, new vars and R2 binding | F |
| worker | `admin-media-content.test.ts` | footer groups change | P5 |
| worker | `content-repository`, `media-repository`, `public-content`, `admin-publication` | legacy libraries deleted after cut-over (legacy tables stay) | I |
| e2e | `home`, `work`, `public-navigation`, `services-about-writing`, `final-acceptance`, `responsive-a11y` | real-name assertions invert; sample projects/writing no longer public; email from settings | P5 |
| e2e | `media-playback`, `media-privacy`, `security-headers` | fixtures move from `content_*` to `projects` + `media_assets` | P5 |
| e2e | `commission-*`, `service-currency` | must keep passing unchanged (prices come from the same D1 rows) | P5 verifies |
| fixtures | `tests/fixtures/media-e2e*.sql`; new `cms-e2e*.sql`; `scripts/run-loopback-e2e.mjs` list | new tables | P5 |

---

## 2. Decisions and outcomes

| # | Lead decision | Outcome in this design |
| --- | --- | --- |
| 1 | Studio at `/studio`; `/admin/*` preserved or redirected | All brief routes under `/studio`; legacy admin panels (pricing, terms, cases, links) ported into the Studio shell; `/admin/*` GET → 301 to the Studio equivalent after an owner check (admin-architecture §2.3). Commission case management keeps working throughout (legacy `/admin` stays live until the port lands). |
| 2 | Reuse Access, Owner = `ADMIN_EMAIL`, server-side JWT on every loader/action/API, fail closed, CSRF kept | Studio root route middleware + per-handler `withOwner` / `withOwnerMutation` wrappers around the existing `verifyAccessRequest`; CSRF kept (form field and `X-Studio-CSRF` header variants). One dashboard change: add `/studio`, `/studio/*`, `/api/studio/*` to the Access app. Until then: 403. |
| 3 | D1 + R2 binding if viable, configurable base URL, Image Transformations behind a flag | R2 binding **is viable** (no binding exists today; adding one is a config change): binding `MEDIA`, bucket `kamelkyp-media` (production) / `kamelkyp-media-preview`, public base `MEDIA_PUBLIC_BASE_URL`. External-URL registration ships first and always works; uploads switch on when the binding and base URL exist. `IMAGE_TRANSFORMATIONS=on` enables `/cdn-cgi/image/` URLs, else originals. |
| 4 | zh/en for every text field; one representation; define "complete" | Localized JSON columns `{zh, en}`; publish requires **both** locales for required fields; optional fields render per locale with no fallback (§3.4). |
| 5 | Brand = Kamel; contact email seeded and flagged; legal texts audited, not rewritten | `brand.brandName = "Kamel"`; hero real-name line removed; `brand.contactEmail` seeded from `CONTACT_EMAIL` with `contactEmailConfirmedAt: null` (Studio attention item); term documents audited with a query, excluded from the brand guard, left untouched (§6). |
| 6 | Placeholders → draft `TODO_CONTENT`, never public; real content published; prices flagged | 13 sample rows → drafts with `todo_content = 1` (DB CHECK forbids publishing them); legacy D1 works/posts/showreel/media/social links imported with their published state; commission services published; prices migrate as-is and are the one item to confirm. Software services: `custom_quote`, no number. |
| 7 | Wizard unchanged; one price source | `services.commission_service_id` links marketing rows to `service_definitions`; the displayed price is always the active `price_versions` rule; `SERVICE_CATALOG.basePriceTwd` deleted (§3.5). Wizard, Apps Script gateway, quote maths untouched. |
| 8 | Public routes read through a repository; empty sections hide | `app/lib/cms/public/*` returns localized view models; components receive props only; every home section and list handles zero items (§3.6). |
| 9 | Custom Studio UI from tokens, CSP-safe, keyboard-first, mobile-usable | `app/components/studio/*` + `app/styles/studio/*.css`, loaded only on Studio routes; spec in admin-architecture §5. |
| 10 | No heavy dependencies | None added. Ordering uses explicit controls plus a dependency-free keyboard reorder; no drag-and-drop library (admin-architecture §4.12). |

---

## 3. Target architecture

### 3.1 Layers

```
             D1 (canonical)                            R2 bucket MEDIA (files)   external URLs
  projects · music_tracks · recognitions · writings ·        │                        │
  services · social_links · taxonomy_terms · settings ·      └──── media_assets ──────┘
  slug_redirects · media_usages · price_versions · terms · cases
                    │  <type>_snapshots views = the only snapshot serializer
                    ▼
  app/lib/cms/db/*            lifecycle engine (save, publish, unpublish, archive, restore, revert,
                              duplicate, delete, feature, reorder, showreel), usage index, redirects
  app/lib/cms/schemas/*       zod: Draft / Snapshot / Content types + publish validators
                    ▼                                         ▼
  app/lib/cms/public/*        localized view models    app/lib/cms/repositories/*   Studio lists, filters,
  (published | preview mode)                                                       form parsing, settings writes
                    ▼                                         ▼
  app/routes/public/*  → presentational components      app/routes/studio/*, app/routes/api/studio/*
  app/routes/studio/preview/* (same components)          app/components/studio/*
```

Both the public site and the Studio read the same rows. Components never import content.

### 3.2 Module map (`app/lib/cms/`)

| Module | Kind | Contents |
| --- | --- | --- |
| `types.ts`, `localized.ts`, `text-format.ts`, `slug.ts`, `forms.ts` | client-safe | shared types; `{zh,en}` helpers (completeness, localize); formatted-text parser (paragraphs, `- ` lists); `slugify`; FormData → object (dotted names, JSON fields) |
| `schemas/*.ts` | client-safe | per model: `XContent`, `XDraftSchema`, `XSnapshotSchema`, `validateXForPublish`, `xContentToColumns` (content-schema §4) |
| `validation.ts` | client-safe core | shared publish rules; server wires the slug checker, asset lookup, brand guard |
| `brand-guard.server.ts` | server only | personal-name deny list; never bundled for the client |
| `db/tables.server.ts` | server | entity descriptors: table, snapshot view, columns, slug policy, placement fields, usage extractor |
| `db/lifecycle.server.ts`, `db/usage.server.ts`, `db/redirects.server.ts`, `db/errors.ts` | server | engine (content-schema §5.1) |
| `taxonomy.server.ts`, `settings.server.ts` | server | taxonomy CRUD; settings read + defaults |
| `media/config.server.ts` | server | `readMediaConfig(env): MediaConfig` |
| `media/urls.ts`, `media/media-config-context.tsx` | client-safe | `assetUrl`, `imageSources` (srcset), `toPlayableMedia` (via `parseMediaUrl`), React context for hosts |
| `media/assets.server.ts` | server | get/search assets, register external URL |
| `media/upload.server.ts`, `media/signatures.ts`, `media/cleanup.server.ts`, `media/metadata.client.ts` | P2 | upload pipeline (§4) |
| `public/*.server.ts`, `public/view-models.ts`, `public/build-views.ts` | server / client-safe | public reads and view builders (content-schema §5.4) |
| `studio/auth.server.ts`, `studio/responses.ts`, `studio/session.client.ts` | server / client | owner guard, action result shape, CSRF refresh |
| `repositories/*.server.ts` | server | per-type Studio queries (owned by the parallel packages) |

### 3.3 Working copy and published snapshot

Each content row carries its editable working copy (typed and localized columns) and `published_json`, a snapshot
produced by the `<type>_snapshots` SQL view when Kevin presses Publish. Consequences:

- Editing a published project never changes the live page until the next Publish ("Unpublished changes" badge,
  *Revert to published*).
- Draft saves are never blocked by completeness; only Publish validates (§23).
- Public reads parse one JSON column per row (`XSnapshotSchema`, `safeParse`, invalid rows skipped with a
  `console.warn`, as `parseBlocks` does today).
- Placement (featured, featured order, list order, showreel) is not versioned: homepage curation is live on save.
- Preview uses the same view on the working copy, so preview and publish render through one parser.
- One definition of the snapshot format (the view) serves the engine, seeds, the legacy import and e2e fixtures.

### 3.4 Localisation: localized JSON columns

Chosen: one row per entity, every text field a `{zh, en}` JSON column (content-schema §1.2). Rejected:
per-locale translation rows (`project_translations(project_id, locale, …)`).

| Concern | Localized JSON columns | Translation rows |
| --- | --- | --- |
| Publishing | One status, one publish action, one snapshot for both locales. zh and en cannot drift into "zh live, en stale". | Two rows to validate and publish together; per-locale status invites half-published pages whose language switcher lands on 404. |
| Search | `instr(lower(title_i18n), lower(?))` matches Kevin's query in either language with no join. | `EXISTS` subquery or join per search. |
| Validation | zod `LocalizedTextSchema` already models `{zh, en}` (`app/content/schema.ts`); completeness is a pure function over the object; the form posts `title.zh` / `title.en`. | Validation spans rows; draft/publish rules duplicated per locale row. |
| Schema size | One table per type. | Two tables per type. |
| Cost | Per-locale indexes are not possible (not needed at portfolio scale); per-locale slugs impossible (slugs are already shared across locales today). | |

**Complete (publish) = every required field non-empty in zh and en.** Rejected alternative: "en falls back to
zh". Fallback would put Chinese text on `/en` pages under English chrome and `<html lang="en">`, publish duplicate
content under two URLs, and hide missing translations from Kevin. Requiring both keeps every published URL pair
real, which the language switcher (`switchLocalePath`) assumes. Optional fields filled in one locale render only
there (warning in the Studio). Legacy rows published in one locale are imported as they are; the public read
excludes them from the other locale (today's behaviour) and the Studio lists them under *Needs attention*.

### 3.5 Price source of truth

Chosen: **`price_versions` stays the only price store; `services` rows hold marketing content and a nullable,
immutable `commission_service_id`.** Rejected: moving prices into `services.price_amount` (would fork the rule the
wizard locks into `cases.locked_price_minor`, lose the immutable effective-dated history, and the per-song,
student, rush, consultation and source-prep fields that a single amount cannot express).

- Commission-linked rows: `price_mode = 'starting_from'`, `price_amount`/`currency` NULL (DB CHECK). Displayed
  price = `getActivePriceRule(db, id, now).baseTwd`. The Studio shows it read-only with "Change price → Pricing"
  (publishes a new `price_versions` row, the existing flow).
- Home pricing strip and `/services` "from" prices: `getAreaStartingPrices()` = minimum active base price among
  **published** commission-linked services of the area.
- `SERVICE_CATALOG` shrinks to structure only (`id`, `category`, `slug`); names and copy come from `services`.
  The wizard receives the service name from its route loader; `commission-success` receives it in the navigation
  state the wizard already sets.
- Non-commission services carry their own `price_mode`, `price_amount`, `currency`; numbers are never required.

### 3.6 Public read path

- `routes/public/layout.tsx` loader calls `getPublicSiteContext(db, env, locale)` (one `db.batch`: brand, site,
  enabled social links, footer link groups) and provides `MediaConfigProvider`. Child routes read it with
  `useRouteLoaderData`.
- Each public route loader calls the matching read function (content-schema §5.4) and returns view models already
  localized for `locale`. `app/content/*` is deleted. `about-teaser`, `capabilities`, `recognition`,
  `services-overview` take props.
- Brand strings rendered from settings: header wordmark and error page brand (`brandName`, fallback "Kamel"),
  footer copyright and base line, hero roles/statement/CTAs, contact email, meta title/description, OpenGraph
  (`og:title`, `og:description`, `og:site_name`, `og:image` when set), favicon when set. JSON-LD: one `WebSite`
  object (`name = brandName`); no `Person` markup.
- **Empty collections:** home sections render `null` when their list is empty or their visibility flag is off
  (showreel keeps its existing empty player); `/works`, `/writing` render the existing `EmptyState`; project
  detail omits empty groups (no gallery, no links, no credits, no case-study field, no music); missing images
  fall back to the existing text-only cover; the footer omits the social group when no link is enabled.
  Navigation items stay (Kevin hides them via `site.navigation`).
- Draft, archived and `todo_content` rows are unreachable: queries filter `status = 'published'`, and the DB
  forbids publishing `todo_content` rows.

### 3.7 Caching

Chosen: **no application cache** (no KV, no Cache API) in this phase. A public page costs one batched settings
read plus one or two collection reads on a small D1 database; content must appear the moment Kevin publishes, and
a cache would need invalidation on every publish, placement change and settings save. Pages keep today's headers
(no `Cache-Control` on public HTML). If latency ever matters, the upgrade path is the Cache API keyed by URL plus a
`content_epoch` integer in the `settings` table, bumped by every Studio mutation, so invalidation is one write.
Media on R2 is CDN-cached with `Cache-Control: public, max-age=31536000, immutable` (keys never change).

### 3.8 Preview mode

- Routes `/studio/preview/<type>/:id?locale=zh|en` and `/studio/preview/home?locale=…&drafts=1` render the real
  public components inside the real public shell, fed by `public/*` read functions in `mode: "preview"` (working
  copies, drafts included, `TODO_CONTENT` badged) plus a fixed "PREVIEW · NOT PUBLISHED" bar.
- Security: under `/studio/*` (Access + owner middleware), `Cache-Control: no-store`,
  `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex,nofollow">`, UUID ids, never linked
  from public pages. No signed share tokens (Owner-only preview is all the brief needs).
- Unsaved preview: the editor's "Preview changes" button submits the form to the preview route with
  `formaction` + `formtarget="studio-preview"` (method POST, CSRF token included); the route's action parses the
  form with the draft schema and renders without saving. The preview iframe requires the Studio CSP variant
  (`frame-src 'self'` on the editor, `frame-ancestors 'self'` on preview responses).

### 3.9 Slug redirects

Slugs are generated from the English title, editable, checked live, and never changed by a title edit once
published. When a published slug changes, the next Publish writes `slug_redirects(old → row)` in the same batch;
detail loaders 301 old URLs to the current published slug (content-schema §2.10).

### 3.10 Extensibility (brief §38)

- New vocabulary values (categories, recognition types, service groups, writing categories) are rows, editable
  in Studio → Settings → Taxonomies. New vocabularies are a zod enum entry.
- A new content module (Testimonials, Press, Lab Notes, …) is additive: one migration with a table following the
  entry contract (content-schema §1.3) and a `<type>_snapshots` view, one descriptor in `db/tables.server.ts`, one
  schema file, one Studio route folder built from the shared editor primitives, one public read function. The
  engine, usage index, preview, redirects, attention list and Studio home counters pick it up from the descriptor.
- `settings` documents carry `schemaVersion`; new keys are added with zod defaults, no migration.
- Nothing for these modules is built now.

### 3.11 Configuration added

| Name | Where | Production | Preview | Local / loopback |
| --- | --- | --- | --- | --- |
| `MEDIA` (R2 binding) | `render-wrangler-config.mjs` from `R2_MEDIA_BUCKET` | `kamelkyp-media` (or the existing bucket behind media.kamelkyp.com, Kevin confirms) | `kamelkyp-media-preview` | Miniflare local bucket; uploads off unless a base URL is set |
| `MEDIA_PUBLIC_BASE_URL` | var | `https://media.kamelkyp.com` | preview bucket custom domain or r2.dev URL | unset (external URLs only) |
| `MEDIA_CORS_HOSTS` | var, comma list | `media.kamelkyp.com,raw.githubusercontent.com` after the bucket CORS rule exists | preview host | `raw.githubusercontent.com` |
| `IMAGE_TRANSFORMATIONS` | var `on`/`off` | `off` until enabled on the zone | `off` | `off` |
| `STUDIO_DEV_OWNER_EMAIL` | `.dev.vars` only | forbidden (verify script) | forbidden | dev server only (admin-architecture §3.6) |

`Env` (`app/lib/env.server.ts`) gains `MEDIA?: R2Bucket` and the optional vars. `verify-production-config.mjs`
additionally requires the `MEDIA` binding with the approved bucket name and an `https:` base URL, and fails on
`STUDIO_DEV_OWNER` in vars or in the build output.

---

## 4. Media strategy (brief §10, §18, §19)

### 4.1 Decision

R2 through a Worker binding for uploads, served from the bucket's public custom domain (`media.kamelkyp.com`),
plus first-class external URL registration (YouTube, Google Drive, GitHub Raw, SoundCloud/Spotify links, any
`https:` file). Both produce `media_assets` rows; everything references assets by id, never by URL. The public URL
of an R2 asset is computed from `MEDIA_PUBLIC_BASE_URL` at render time, so moving hosts is a config change.
Serving files through the Worker was rejected (range requests, caching and CPU for every play).

Order of delivery: external registration (foundation, used by every editor's media picker) → uploads (P2), which
activate only when `MEDIA` and `MEDIA_PUBLIC_BASE_URL` are both configured; otherwise the upload tab explains why
and offers "Register URL".

### 4.2 Wrangler change

```jsonc
// scripts/render-wrangler-config.mjs output (per environment)
"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "<R2_MEDIA_BUCKET>" }],
"vars": { "MEDIA_PUBLIC_BASE_URL": "...", "MEDIA_CORS_HOSTS": "...", "IMAGE_TRANSFORMATIONS": "off", ... }
```

`wrangler.base.jsonc` gets a local-only binding (`"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "kamelkyp-media-local" }]`)
so typegen and Miniflare know the binding. The renderer always overwrites `r2_buckets` (from `R2_MEDIA_BUCKET`, or
`[]` when it is unset, in which case uploads stay off), so the local bucket name never reaches a deployment.
The deploy API token needs R2 permission on the bucket (Kevin checks).

### 4.3 Upload flow (Worker-streamed, owner-only)

1. **Declare.** Studio `POST /api/studio/media` (JSON, `X-Studio-CSRF`): `{filename, mimeType, sizeBytes, width?,
   height?, durationMs?, title?, alt?}`. The server validates type and size, creates a `media_assets` row with
   `state = 'pending'`, key `media/<yyyy>/<mm>/<uuid>/<sanitized-filename>`, and returns
   `{assetId, uploadUrl: "/api/studio/media/<id>/content"}`.
2. **Stream.** `PUT uploadUrl` with the raw file as the body (`Content-Type`, `Content-Length`, `X-Studio-CSRF`).
   The Worker requires `Content-Length === sizeBytes`, pipes `request.body` through a first-chunk signature check
   into `env.MEDIA.put(key, stream, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } })`,
   compares the stored size, then marks the row `ready` (or `failed`, deleting the object). No `formData()`
   buffering, so files up to the platform limit never sit in Worker memory.
3. **Progress** is shown with a native `<progress>` fed by `XMLHttpRequest.upload.onprogress` (CSP-safe).
4. **Cleanup.** The daily cron calls `cleanupPendingUploads()`: pending/failed rows older than 24 h lose their R2
   object and row.

Limits (Cloudflare Free/Pro request body cap is 100 MB):

| Kind | MIME allowlist | Max |
| --- | --- | --- |
| image | image/jpeg, image/png, image/webp, image/avif, image/gif | 20 MB |
| audio | audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg, audio/flac | 95 MB |
| video | video/mp4, video/webm | 95 MB (long video → register a YouTube URL instead) |
| document | application/pdf | 20 MB |

SVG, HTML and anything not listed are refused (files are served from a same-site origin). Signatures checked:
JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46 38`, WebP/WAV `RIFF….WEBP/WAVE`, AVIF/MP4/M4A `ftyp` at offset 4,
WebM `1A 45 DF A3`, FLAC `fLaC`, OGG `OggS`, MP3 `ID3` or frame sync `FF Ex/Fx`, PDF `%PDF`.

### 4.4 Metadata extraction

Client-side, submitted with the declaration (accepted by the lead): images via `createImageBitmap(file)` (no URL
needed); audio/video via an `<audio>`/`<video>` element on `URL.createObjectURL(file)` reading `duration`,
`videoWidth`, `videoHeight`. The Studio CSP variant adds `blob:` to `img-src` and `media-src` so local previews and
this probing work. Values are advisory: the server clamps them to sane ranges and stores `size_bytes` from R2.
The upload UI shows filename, type, size, duration, dimensions, a preview player/thumbnail and, after save, usage.

### 4.5 Images

`imageSources(asset, config, {widths: [480, 960, 1440, 1920]})`: when `IMAGE_TRANSFORMATIONS = on` and the asset is
on R2, `src`/`srcset` use `https://<media host>/cdn-cgi/image/width=<w>,quality=82,format=auto,fit=scale-down/<key>`
(same zone as the bucket's custom domain; widths above the original are dropped); otherwise the original URL with
`width`/`height` attributes. External images always use the original URL. All public `<img>` get `loading="lazy"`
and `decoding="async"` except the first above-the-fold cover. Focal point: `focal_x/focal_y` quantized to 0/25/50/75/100
and rendered as `focal-x-50 focal-y-25` classes mapping to `object-position` in CSS (no inline style). Alt text is
per locale and required before a published entry may use the image. Kevin never resizes anything.

### 4.6 Audio and Web Audio analysis

- `MediaConfig.corsHosts` (from `MEDIA_CORS_HOSTS`, plus same-origin) replaces the `CORS_AUDIO_HOSTS` constant;
  `isCorsAudioHost(url, corsHosts)` is unchanged otherwise. Only those hosts get `crossOrigin = "anonymous"` and an
  `AnalyserNode`; everything else plays without analysis (existing behaviour). Misconfiguration fails safe: a
  CORS-flagged URL without CORS headers errors on load and `direct-audio-preview` shows its existing fallback.
- `MediaConfig.r2Hosts` (host of `MEDIA_PUBLIC_BASE_URL`, plus `media.kamelkyp.com` while legacy URLs exist)
  replaces every hard-coded `R2_HOSTS` set.
- Bucket CORS policy Kevin applies (R2 → bucket → Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["https://kamelkyp.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Length", "Content-Range", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

  The preview bucket lists the preview origin(s) instead. Only after that is `media.kamelkyp.com` added to
  `MEDIA_CORS_HOSTS`.
- Studio → Media shows whether analysis is on for the configured host and has a "Test CORS" button (loads a chosen
  audio asset in an `<audio crossorigin="anonymous">`; success means the header is present). It needs no
  `connect-src` change.
- Never autoplay; one player at a time (existing `PlaybackCoordinator`).

### 4.7 Usage references and delete safety

`media_usages` is the index (content-schema §2.8): rebuilt per entity on each lifecycle action, rebuilt fully by
the nightly cron and on demand. The library filters Used / Unused / Missing alt text; the asset detail lists every
usage (entity, field, working vs published) with links. Delete: refused while any published usage exists (trigger
+ UI explains "Unpublish or replace in: …"); with draft-only usages the confirmation lists them; unused assets
delete after a single confirm. The R2 object is deleted after the row, and a failed object delete is retried by
the cron (orphan keys are listed by prefix and compared to `storage_key`).

### 4.8 External registration

`registerExternalAsset(url)` runs `parseMediaUrl` (existing allowlist logic: YouTube → video/embed, Drive → embed,
GitHub Raw audio, direct audio by extension, Dropbox/MediaFire → link only) and fills kind/provider/filename; the
Studio then asks for title and alt text. Legacy media rows become external assets in the migration.

---

## 5. Migration strategy (brief §35–36)

### 5.1 Ordered steps

1. **Before merge (Kevin, optional but recommended):** run the inventory query (§5.4) on production to see what
   D1 holds; decide on the items in §8.
2. **Deploy workflow (unchanged mechanics):** time-travel bookmark → `wrangler d1 migrations apply --remote`
   applies `0005_cms_schema` → `0006_cms_base_seed` → `0007_cms_legacy_import` → `0008_cms_sample_drafts` → Worker
   deploy → health check → public smoke.
3. The new Worker reads only the new tables for portfolio content; commission, terms, prices, FX and cases keep
   their tables.
4. **After deploy (Kevin):** run the verification query (§5.4); open `/studio` (after the Access change); work the
   *Needs attention* list (contact email, redesign copy confirmation, any one-locale legacy rows).
5. Legacy tables (`content_*`, `media_items`) stay read-only for at least one release, then a later migration may
   drop them (not part of this project).

### 5.2 Idempotency

`CREATE … IF NOT EXISTS`; `INSERT OR IGNORE` with deterministic ids (seed ids, legacy ids); guarded `UPDATE`s
(`WHERE status = 'draft' AND published_json IS NULL`); helper views dropped at the end of 0007. Wrangler records
applied files in `d1_migrations`, and re-running any file by hand changes nothing. Because `INSERT OR IGNORE` also
skips rows that fail a CHECK, the verification query compares legacy and imported counts so nothing disappears
silently.

### 5.3 Draft vs published

| Content | Result |
| --- | --- |
| Sample projects (6), recognition (3), writing (4) | draft, `todo_content = 1`, never featured, DB cannot publish them |
| Legacy D1 works / posts | published if any locale was published (snapshot = legacy published values); unpublished newer drafts become the working copy; never-published entries are drafts |
| Legacy home showreel | published `music_tracks` row with `is_showreel = 1` when its media is audio or YouTube, else draft + attention |
| Legacy media items, social link group | assets `ready`; social links keep `enabled` |
| Commission services (4) | published, content from the catalog, price from `price_versions` (**confirm**) |
| Software offerings (7), capabilities, About, hero roles/statement, service-area and page copy | published/settings, taken verbatim from the redesign files, never placeholder-flagged (**confirm**) |
| Brand settings | `brandName: "Kamel"`, contact email from `CONTACT_EMAIL` flagged |
| Site settings | titles/descriptions from `copy.ts`, availability `unspecified`, homepage counts 4/3/3, all sections visible |
| Footer | code structure groups + D1 groups; `work_resources` defaults inserted only if `link_groups` is empty |
| Prices, terms, cases, FX | untouched |

### 5.4 Verification queries (Kevin runs with `wrangler d1 execute kamelkyp-production --remote --command "…"`)

```sql
-- Inventory before merge
SELECT kind, COUNT(*) AS entries,
  SUM(EXISTS (SELECT 1 FROM content_publications p WHERE p.entry_id = e.id)) AS published
FROM content_entries e GROUP BY kind;
SELECT slug FROM content_entries WHERE kind = 'page';
SELECT g.stable_key, COUNT(l.id) FROM link_groups g LEFT JOIN links l ON l.group_id = g.id GROUP BY g.stable_key;

-- After deploy: nothing lost, nothing sample is live
SELECT (SELECT COUNT(*) FROM content_entries WHERE kind = 'work') AS legacy_works,
       (SELECT COUNT(*) FROM projects WHERE legacy_source GLOB 'content_entries:*') AS imported_works,
       (SELECT COUNT(*) FROM content_entries WHERE kind = 'post') AS legacy_posts,
       (SELECT COUNT(*) FROM writings WHERE legacy_source GLOB 'content_entries:*') AS imported_posts,
       (SELECT COUNT(*) FROM projects WHERE todo_content = 1 AND status = 'published') AS live_samples;
```

`live_samples` must be 0 (the CHECK makes any other value impossible). Imported counts must equal legacy counts.

### 5.5 E2E fixture changes

- `tests/fixtures/media-e2e.sql` / `-cleanup.sql` are rewritten to insert `media_assets` + `projects` (same slugs:
  `media-test`, `audio-test`, …; `listed = 0`) and publish them through `project_snapshots`; cleanup unpublishes
  (`status = 'draft'`) and deletes `e2e-*` rows (no trigger dropping).
- New `tests/fixtures/cms-e2e.sql` / `cms-e2e-cleanup.sql`: 6 published fixture projects across categories
  (3 featured with explicit order), 1 draft project, 1 published project with a renamed slug + redirect row,
  2 published recognition rows, 1 internal and 1 external writing entry plus a draft, a published showreel track on
  an intercepted `https://media.kamelkyp.com/e2e/*.wav`, 2 social links (one disabled). Titles say "Fixture …",
  never "Sample:", and contain no personal names.
- `scripts/run-loopback-e2e.mjs` adds the new fixture and cleanup files; migrations 0005–0008 run as part of
  `migrations apply`.
- `tests/worker/cms-e2e-fixture.test.ts` applies the fixture SQL to the worker-pool D1 and asserts every published
  fixture row parses through the public read functions (catches fixture drift without a browser).

### 5.6 Rollback

- **Worker:** redeploy the previous deployment. It reads the legacy tables, which the migrations never modified,
  so the site returns to its pre-migration content. Edits made in the Studio after the migration are not visible
  to the old Worker (they live in the new tables) and reappear on roll-forward.
- **Data:** D1 time travel to the bookmark written by the deploy workflow before `migrations apply`.
- **Schema:** D1 migrations are forward-only; the new tables are harmless to the old Worker and stay. A fix is a
  new migration.

---

## 6. Brand audit (brief Brand, §37)

Deny list used by the guard and the audit: `楊子賢`, `子賢`, `Kevin Yang`, `Kevin`, `Yang` (word), `kevinyaungputra`,
`Yaung`. Grep scope: `app/`, `workers/`, `scripts/`, `integrations/apps-script/`, `migrations/`, `tests/`, repository
root; there is no `public/` directory (fonts come from Fontsource packages).

### 6.1 Public-facing occurrences and fixes

| # | Location | Occurrence | Surface | Fix | Package |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/components/home/hero.tsx:14` | `realName: "楊子賢"` rendered at `:96-99` (`p.home-hero__real-name`) | `/zh` hero, and the client JS bundle | Remove the real-name line and its CSS (`app/styles/pages/home.css`); hero renders wordmark from `brand.brandName`, roles/statement from settings | P5 |
| 2 | `app/components/home/hero.tsx:23` | `realName: "Kevin Yang"` | `/en` hero, client bundle | same | P5 |
| 3 | `app/content/schema.ts:277` | `REAL_NAME = /楊子賢\|Kevin Yang/`, re-exported by `app/content/index.ts` into client components | public JS bundle | Delete with `app/content/*`; the guard lives in `app/lib/cms/brand-guard.server.ts` (server-only) | P5 / F |
| 4 | `app/lib/i18n/copy.ts:81` | `CONTACT_EMAIL = "kevinyaungputra@gmail.com"` | rendered in `components/layout/site-footer.tsx:48-50`, `contact-band.tsx:74-75`, `content/software-services.ts:97` (mailto on `/services/software`) | Remove the constant; render `brand.contactEmail` (seeded with the same value so contact keeps working; flagged for Kevin) | P5 |
| 5 | `app/lib/content/footer-repository.server.ts:126-127` | default contact group label and `mailto:` | footer when D1 has no groups | Contact group computed from `brand.contactEmail` | P5 |
| 6 | Hard-coded "Kamel" in `site-header.tsx:136`, `site-footer.tsx:78`, `root.tsx:102-105` | brand, not a violation | header, footer, error page | Read `brandName` (fallback "Kamel") | P5 |
| 7 | Metadata | `<title>`/description from `copy.ts` (no names); no OG, JSON-LD, author or favicon tags exist | head | Data-driven title/description/OG/`WebSite` JSON-LD from settings; no author/Person fields | P5 |
| 8 | Production D1 data (unknown until queried) | titles, summaries, bodies, link labels, media titles/credits entered via `/admin` | public pages | Imported verbatim; audit query §6.3; the Studio flags matching published rows under *Needs attention* and the brand guard blocks re-publishing them until fixed | Kevin via Studio |
| 9 | Footer link "Website repository" → `https://github.com/kekekewww/kamelkyp.com` (default group, `footer-repository.server.ts:116`) | the linked public repository shows commit author `Kevin_Yang_tw <kevinyaungputra@gmail.com>` on 222 commits | reachable from every page | Code cannot fix history. Kevin decides: drop the link from the seeded footer group, make the repository private, or accept (§8) | Kevin |

Public email templates: none exist. The Apps Script relay (`integrations/apps-script/Code.gs:222-227`) emails only
the administrator, subject "[Kamel Commission] …"; no change. Accessibility labels: `copy.brandLabel` is
"Kamel 主頁 / Kamel home"; no names. The GitHub handle `kekekewww` is a handle, not a name variant; it stays unless
Kevin says otherwise.

### 6.2 Non-public occurrences

| Location | Occurrence | Change? |
| --- | --- | --- |
| `tests/e2e/home.spec.ts:50-61`, `final-acceptance.spec.ts:10,47`, `public-navigation.spec.ts:8` | assert the real name appears once | Yes: invert to "never appears on any public page" (both names, both locales, home/about/works/footer) |
| `tests/e2e/services-about-writing.spec.ts:43,47,58` | email and name assertions | Yes: email asserted against the seeded brand value; name assertion kept as absence |
| `tests/unit/content/content-schema.test.ts:113` | negative fixture with the name | Deleted with `app/content` |
| `tests/unit/footer-repository.test.ts:25` | default email | Yes: reads the settings value |
| `app/routes/admin/layout.tsx:11` | shows the email local part in the private admin sidebar | Replaced by the Studio account menu (private) |
| `app/components/home/hero.tsx:58` | code comment "single real-name line" | Removed with the line |
| Config: `ADMIN_EMAIL` var, Access allow policy, Apps Script `ADMIN_EMAIL` | identity for auth and notifications | No (not public) |
| Docs: `docs/design-system.md` §3.5 and checklist item 5, `docs/information-architecture.md:15-16,153,186,359,367,671`, runbooks (`cloudflare-setup.md:62,90`, `google-setup.md:22,49`), historical specs/plans | prescriptive "real-name line" text; operational email | Living docs (design-system §3.5, IA) updated by the integration package to the Kamel-only rule; runbook emails stay (operational); historical specs/plans stay as records |
| Git metadata | author `Kevin_Yang_tw <kevinyaungputra@gmail.com>`, `README.md:21` clone URL | No history rewrite. Kevin may set `git config user.name "Kamel"` for future commits |

### 6.3 Production data audit queries

```sql
SELECT 'content' AS src, e.kind, e.slug, v.locale, v.state FROM content_versions v
JOIN content_entries e ON e.id = v.entry_id
WHERE v.title || COALESCE(v.summary, '') || v.body_json || COALESCE(v.seo_title, '') || COALESCE(v.seo_description, '')
  LIKE '%楊%' OR lower(v.title || v.body_json) LIKE '%kevin%' OR lower(v.title || v.body_json) LIKE '%yaung%';
SELECT 'link', g.stable_key, l.locale, l.label FROM links l JOIN link_groups g ON g.id = l.group_id
WHERE l.label LIKE '%楊%' OR lower(l.label || l.url) LIKE '%kevin%';
SELECT 'media', m.id, m.title FROM media_items m
WHERE (m.title || COALESCE(m.credit, '') || COALESCE(m.description, '')) LIKE '%楊%'
   OR lower(m.title || COALESCE(m.credit, '') || COALESCE(m.description, '')) LIKE '%kevin%';
SELECT 'terms', d.id, v.locale, v.version_number, (p.version_id IS NOT NULL) AS live
FROM term_versions v JOIN term_documents d ON d.id = v.document_id
LEFT JOIN term_publications p ON p.version_id = v.id
WHERE v.body_json LIKE '%楊%' OR lower(v.body_json) LIKE '%kevin%' OR lower(v.body_json) LIKE '%yang%'
   OR v.body_json LIKE '%gmail%';
```

### 6.4 Legal texts

Term documents (`common`, `privacy`, four service documents) live in D1 per locale and are published only with
the legal-review checkbox. Fixtures name the provider "Kamel" (乙方); the production text is unknown. A privacy
notice may legally need an identifiable operator (for example the collector's name among the notice items of
Taiwan's Personal Data Protection Act, Art. 8). This design does **not** rewrite, re-seed or brand-guard term
versions: they migrate untouched, remain editable only through the legal flow (Studio → Services → Terms), and the
fourth audit query lists any version containing a name or the personal email. Whether "Kamel" is sufficient or a
legal name must appear is Kevin's (and his reviewer's) decision.

### 6.5 Guard rails

- `brand-guard.server.ts` runs in publish validation for all public text of every entity and in settings saves
  (except `brand.contactEmail` and term documents). A hit is a blocking error naming the field.
- `tests/unit/brand-audit.test.ts` (P5, since the names disappear only when P5 lands) scans `app/**` (excluding
  `brand-guard.server.ts` and tests) for the deny list; `tests/e2e/brand.spec.ts` (P5) scans rendered HTML of every public route in both locales; the integration
  package extends `verify-production-config.mjs` to scan `build/client/**` for the names (the contact email is
  excluded while it is flagged).

---

## 7. Risks

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| Access paths not added before release | High / Studio unusable (not exposed) | 403 is the designed fail-closed state; runbook step and release checklist item; `/admin/*` keeps working until the redirect flip, which is released only after Kevin confirms `/studio` loads |
| Legacy data quirks (non-conforming slugs, one-locale publications, Drive showreel) | Medium / content missing | Verification counts, attention list, legacy tables retained, rollback path |
| Snapshot/format drift between SQL view and zod | Low / public row skipped | Single view definition; worker tests parse every seeded and fixture snapshot; skip-and-warn at read time |
| D1 function-argument and query-count limits | Medium / runtime errors | Statement shapes in content-schema §1.4; worker tests use realistic sizes |
| Upload size vs plan limits | Medium / failed uploads | 95 MB cap under the 100 MB plan limit; YouTube/external registration for long video |
| CORS misconfiguration silences audio | Low / showreel silent | Analysis only for configured hosts; load error → existing fallback player; Test CORS button |
| CSRF token (30 min) expiring during long edits | Medium / failed save | Token refresh endpoint + automatic retry once + sessionStorage backup of unsaved form (admin-architecture §3.4) |
| Redesign copy published without Kevin's review | Medium / tone | Listed in §8; attention item until acknowledged |
| Parallel packages colliding | Medium / merge pain | Disjoint ownership, stubs created by the foundation, shared-file queue (§9) |
| Loss of the "real name once" hero line changes the approved layout | Certain / small | Brand rule overrides; hero spacing re-balanced in P5, design-system §3.5 updated |

---

## 8. What Kevin must do or confirm (outside the code)

1. **Cloudflare Access:** in Zero Trust → Access → Applications, edit the existing kamelkyp.com application (and
   the preview one) and add paths `/studio`, `/studio/*`, `/api/studio/*` (keep the `/admin` paths). Same
   application, so `ACCESS_AUD` is unchanged. Until then every Studio URL answers 403.
2. **R2:** tell us whether a bucket already serves `media.kamelkyp.com` (and its name). Otherwise create
   `kamelkyp-media`, attach the custom domain `media.kamelkyp.com`, and create `kamelkyp-media-preview` for previews
   (custom domain or r2.dev URL). Apply the CORS policy from §4.6 to both. Set GitHub Environment vars
   `R2_MEDIA_BUCKET`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_CORS_HOSTS`, `IMAGE_TRANSFORMATIONS` (production and preview).
   Check that the deploy API token can access R2.
3. **Image Transformations (optional):** enable Images → Transformations on the kamelkyp.com zone, then set
   `IMAGE_TRANSFORMATIONS=on`.
4. **Prices:** confirm the migrated commission prices, which are existing content from the 2026-08-10 spec, not
   new samples: full mix NT$8,000; vocal mix NT$4,000; simple transition NT$1,000 (+NT$200 per song after five);
   edited transition NT$4,000 (+NT$800 per song after five); student discount 30%, rush +50%, consultation 50%,
   source preparation 5%.
5. **Contact email:** `kevinyaungputra@gmail.com` contains a personal-name variant. Keep it (confirm in Studio),
   or change it in Studio → Brand (for example to a kamelkyp.com address via Email Routing).
6. **Legal texts:** run the terms audit query (§6.3) and decide, with a reviewer, whether the terms and privacy
   notice need an operator identity; any change goes through the existing legal-review publish flow.
7. **Redesign copy:** review and acknowledge the published-as-is copy: About (lede, 4 sections), 4 capabilities,
   hero roles and statement, 7 software offerings and their page copy, service-area blurbs.
8. **Repository link and git identity:** decide on the public footer link to the GitHub repository whose history
   shows `Kevin_Yang_tw` (remove link / make repository private / accept).
9. **Before and after deploy:** run the inventory and verification queries in §5.4.

---

## 9. Implementation packages

Rules for every package: TDD per `superpowers:test-driven-development`; `npm run check` green before handoff;
only files in the package's ownership are created, edited or deleted; a needed change to someone else's file is
written as a request in the package report ("shared-file queue") and applied by the file's owner or by the
integration package; no new dependencies. Studio chrome is English.

Sequence: **F** → **P1 ∥ P2 ∥ P3 ∥ P4 ∥ P5** → **I**.

### F. Foundation (lands first)

**Owns (creates/edits):**
- `migrations/0005_cms_schema.sql`, `0006_cms_base_seed.sql`, `0007_cms_legacy_import.sql`, `0008_cms_sample_drafts.sql`
- `app/lib/cms/**` except the files listed under P1–P5 (`repositories/*`, `media/upload.server.ts`,
  `media/signatures.ts`, `media/metadata.client.ts`, `settings-write.server.ts`); creates `media/cleanup.server.ts`
  as a no-op stub (handed to P2) and `public/**` (handed to P5 after F)
- `app/lib/auth/**` (header-token CSRF variant), `app/lib/env.server.ts`, `app/lib/cloudflare/context.ts`,
  `app/lib/security/headers.server.ts`
- `workers/app.ts` (cron calls `cleanupPendingUploads` and `rebuildAllUsages`), `wrangler.base.jsonc`,
  `scripts/render-wrangler-config.mjs`, `scripts/verify-production-config.mjs`, `.github/workflows/deploy-*.yml`
  (new vars), `vitest.worker.config.ts` (second D1 binding `LEGACY_DB` for import tests), `tests/helpers/*`,
  `package.json` (scripts only: `dev`, `test:e2e:studio`)
- `app/routes.ts` (registers **every** Studio, API and preview route, pointing at stub modules); stub route files
  for all P1–P5/I routes (each stub: guarded loader + "Not built yet" panel linking to the `/admin` equivalent)
- `app/routes/studio/root.tsx` (middleware, loader: identity, CSRF, media config; `links` → studio CSS),
  `app/routes/studio/shell.tsx` (pathless layout), `app/routes/api/studio/session.ts`, `slug-check.ts`,
  `media-search.ts`, `media-register.ts`, `app/routes/admin-legacy-redirect.ts` (created, not yet wired)
- `playwright.studio.config.ts` + `tests/e2e-studio/harness.ts` (dev-server Studio e2e, admin-architecture §3.6);
  each parallel package may add its own `tests/e2e-studio/<package>.spec.ts`
- `app/components/studio/ui/**`, `app/components/studio/shell/**`, `app/components/studio/media/uploader.tsx`
  (stub, handed to P2), `app/styles/studio/base.css`
- `app/root.tsx` (`<html lang="en">` for `/studio*`; handed to I, which removes the global `admin.css` link),
  `app/routes/public/layout.tsx` (site context loader + `MediaConfigProvider`; handed to P5 after F),
  `app/components/media/media-preview.tsx` and `app/components/content/block-renderer.tsx` (read hosts from
  context, `r2Hosts` prop optional; handed to P2 and P5 respectively)
- Tests: `tests/worker/cms-schema.test.ts`, `cms-legacy-import.test.ts`, `cms-lifecycle.test.ts`,
  `cms-public-read.test.ts`, `cms-settings.test.ts`, `studio-auth.test.ts`; `tests/unit/cms-*.test.ts`
  (schemas, validation, text-format, slug, forms, media urls), `tests/unit/studio-route-guards.test.ts` (static:
  every loader/action under `app/routes/studio/**` and `app/routes/api/studio/**` is wrapped by `withOwner` /
  `withOwnerMutation`), updates to `security-headers`, `config-contract`,
  `production-config`, `block-renderer` tests; `tests/e2e/studio-access.spec.ts`

**Provides:** the schema; engine, taxonomy, settings read, media config/URLs/assets, public read layer and view
builders (content-schema §5); `withOwner`, `withOwnerMutation`, `requireOwner`, `ownerContext`,
`actionOk`/`actionError` shapes; Studio UI primitives (admin-architecture §4.13); `useEditorForm`, toasts,
confirm dialog, list/filter/order components, `MediaField`/`MediaPicker` with external registration,
`PreviewPane`; stub routes; Studio CSP/no-store/noindex headers.

**Acceptance:** migrations apply cleanly on an empty DB and on a DB seeded with legacy fixtures; all
content-schema constraints proven by worker tests (TODO cannot publish, one showreel, published delete blocked,
commission rows protected, vocabulary guards, media delete safety); legacy import produces the expected rows;
public read functions return seeded services/settings; `/studio` renders the shell with a working nav for an
injected owner (unit render) and returns 403 without Access in loopback e2e for `/studio`, `/studio/projects`,
`/api/studio/session`, `/studio/preview/home`; `/studio/*` responses carry `no-store` and `X-Robots-Tag`; public
site unchanged (existing e2e green, `npm run check:all`); `verify:production` still passes with the new vars and
fails on `STUDIO_DEV_OWNER`.

### P1. Projects

**Owns:** `app/routes/studio/projects/**`, `app/components/studio/projects/**`,
`app/lib/cms/repositories/projects.server.ts`, `app/styles/studio/projects.css`, `tests/worker/studio-projects.test.ts`,
`tests/unit/studio-project-*.test.ts(x)`.
**Reads:** `app/lib/cms/**`, `app/components/studio/ui/**`.
**Consumes:** engine (`createEntity`, `saveEntity`, `publishEntity`, …, `duplicateEntity`, `setFeatured`,
`reorder`, `checkSlug`), `listTerms`/`createTerm` (inline new category), `MediaField`, `PreviewPane`
(`/studio/preview/projects/:id`).
**Provides:** nothing to other packages.
**Tests:** form parsing (all groups, localized fields, lists), list filters (status, category, year, featured,
search in both locales), publish issues surfaced, stale revision → 409 path, duplicate/archive/delete flows via
handlers.
**Acceptance:** brief §6–8, §23–25 for projects: create → save draft with only a title → publish refused with the
listed missing fields → complete → publish → visible at `/:lang/works/:slug` (after P5) → change slug → republish →
old URL 301s; featured toggle and featured reorder from the list; Editor | Preview split ≥ 1200 px; mobile
single column; keyboard save; unsaved-changes guard.

### P2. Music, media library, uploads, audio

**Owns:** `app/routes/studio/music/**`, `app/routes/studio/media/**`, `app/routes/api/studio/media.ts`,
`app/routes/api/studio/media-content.ts`, `app/components/studio/music/**`, `app/components/studio/media/**`
(including `uploader.tsx` from F), `app/lib/cms/repositories/music.server.ts`, `media-library.server.ts`,
`app/lib/cms/media/upload.server.ts`, `signatures.ts`, `cleanup.server.ts`, `metadata.client.ts`,
`app/components/media/**` (public players), `app/lib/media/**` except `media-repository.server.ts` (legacy, deleted
by I), `app/lib/motion/audio-level.ts`, `app/styles/studio/music.css`, `media.css` (studio), `app/styles/media.css`,
tests: `tests/unit/{media-url,motion-tokens,playback-coordinator,audio-bounds,media-signatures,upload-*}.test.ts`,
`tests/worker/studio-{music,media}.test.ts`.
**Consumes:** engine (`setShowreel`, lifecycle), `media/assets.server.ts`, `readMediaConfig`, `listEntityOptions("project")`.
**Provides:** `MediaUploader` (used by F's `MediaPicker` through the stub path), stable `MediaPreview` props
`{ item: MediaItem; locale: Locale }`, `cleanupPendingUploads`, `rebuildAllUsages` UI.
**Tests:** signature table, size/type limits, stream upload into a Miniflare R2 bucket, pending cleanup, delete
safety (published/draft/unused), usage listing, showreel exclusivity through handlers, CORS host config.
**Acceptance:** brief §9–10, §18–19: register URL and upload (when configured) with filename, duration, size,
preview, usage shown; search/filter; copy URL; delete when unused, warning when used; exactly one showreel;
analysis only on configured CORS hosts; never autoplay.

### P3. Recognition, writing, social links

**Owns:** `app/routes/studio/recognition/**`, `app/routes/studio/writing/**`, `app/routes/studio/social.tsx`,
`app/components/studio/{recognition,writing,social,blocks}/**` (the block editor is ported from
`app/components/admin/BlockEditor.tsx` by copy; the original is deleted by I),
`app/lib/cms/repositories/{recognition,writing,social-links}.server.ts`,
`app/styles/studio/{recognition,writing,social}.css`, their tests.
**Consumes:** engine, taxonomy (`recognition_type`, `writing_category`), `MediaField`, `PreviewPane`.
**Tests:** writing publish rule (content vs external URL by platform), recognition filters (year, type), social
link URL rules and ordering, block editor round trip.
**Acceptance:** brief §11, §12, §15, §23, §25 for these types; external-only writing links out publicly (after P5).

### P4. Services, brand/site settings, homepage control, Studio home, taxonomies

**Owns:** `app/routes/studio/home.tsx`, `app/routes/studio/services/{list,new,edit}.tsx`,
`app/routes/studio/settings/{index,brand,site,taxonomies}.tsx`, `app/routes/studio/homepage.tsx`,
`app/components/studio/{services,settings,homepage,home}/**`,
`app/lib/cms/repositories/{services,homepage,studio-home}.server.ts`, `app/lib/cms/settings-write.server.ts`,
`app/styles/studio/{services,settings,homepage,home}.css`, their tests.
**Consumes:** engine (`setFeatured`, `reorder`, `setShowreel`), settings read, taxonomy CRUD,
`getActivePriceRule` (read-only), `listTerms`.
**Provides:** nothing to other packages (Studio home reads every table read-only through its own queries).
**Tests:** service price-mode rules (commission rows read-only price, custom quote needs no number), settings
validation and revision conflicts, homepage model and reorder, attention rules, counts.
**Acceptance:** brief §13–14, §16–17, §21, §26–27: Studio home counts, recent changes, attention list (TODO drafts,
unpublished changes, one-locale content, missing alt text, no featured projects, showreel unset/unpublished,
contact email unconfirmed, redesign copy unacknowledged, pending commissions); quick actions; homepage editor
saves live; brand settings seeded "Kamel".

### P5. Public site wiring, preview routes, brand removal, e2e

**Owns:** `app/routes/public/**`, `app/routes/studio/preview/**`, `app/components/{home,work,layout,services,legal,content,hero,commission}/**`,
`app/lib/cms/public/**` (after F), `app/lib/services/**`, `app/lib/content/**`, `app/lib/i18n/**`,
`app/content/**` (deletes), `app/styles/pages/**`, `app/styles/{components,layout,global}.css`,
`tests/e2e/**` except `studio-access.spec.ts`, `tests/fixtures/**`, `scripts/run-loopback-e2e.mjs`,
`playwright.config.ts`, unit tests for those areas (`content/*`, `footer-repository`, `service-catalog`,
`service-pages`, `language-routes`, `legacy-redirect`, `locale`), `tests/unit/brand-audit.test.ts`,
`tests/worker/admin-media-content.test.ts`, `tests/worker/cms-e2e-fixture.test.ts`.
**Consumes:** public read layer, view builders, `MediaPreview` props contract from P2.
**Provides:** preview routes at the URLs in admin-architecture §2.2.
**Tests:** e2e rewritten per §1.9 and §5.5, plus `brand.spec.ts` (no names anywhere public), `empty-sections`
unit tests (every home section renders nothing for empty input), redirect 301, draft/TODO 404, unlisted
reachable but not listed, price parity (service page = active price rule = wizard quote).
**Acceptance:** brief §8 decision and §37: no portfolio data in components; `app/content` gone; public visual
design unchanged except the removed real-name line; all commission and currency e2e unchanged and green.

### I. Integration and QA (after P1–P5)

**Owns:** `app/routes/studio/services/{pricing,terms}.tsx`, `app/routes/studio/settings/footer.tsx`,
`app/routes/studio/commissions/**`, `app/components/studio/{pricing,terms,footer,commissions}/**` (ports of
`CaseTable`, `CleanupChecklist`, `LinkGroupEditor` and the price/terms forms, reusing `app/lib/admin/{case,cleanup,
service-catalog,term}-service.server.ts` unchanged), `app/routes.ts` (flip `/admin/*` to
`admin-legacy-redirect.ts`), deletion of `app/routes/admin/**`, `app/components/admin/**`, `app/styles/admin.css`
(+ its link in `app/root.tsx`), `app/lib/admin/{content-service,media-content-service,block-form}*`,
`app/lib/db/content-repository.server.ts`, `app/lib/media/media-repository.server.ts`,
`app/lib/content/public-content.server.ts` legacy parts, their tests; `docs/design-system.md` §3.5/§6.25 and
`docs/information-architecture.md` brand lines; `docs/runbooks/cloudflare-setup.md` (Access paths, R2, CORS,
Transformations); `docs/runbooks/release-checklist.md`; build-output brand scan in `verify-production-config.mjs`;
the shared-file queue from P1–P5; optional CI job for `test:e2e:studio`.
**Acceptance:** every legacy admin capability reachable in `/studio` (content, services/prices, terms, works,
links, posts, cases, case status, student discount, cleanup); `/admin/*` GET → 301 after owner check; full
`npm run check:all` green; manual acceptance on the PR preview behind Access: create, publish, unpublish, archive,
preview, upload, reorder, showreel, settings, commission case status change; axe on Studio pages; mobile pass.
