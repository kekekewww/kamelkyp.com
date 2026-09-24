# Admin Architecture: KAMEL STUDIO

Status: design, 2026-09-24. Companions: `docs/content-architecture.md` (system, media, migration, packages) and
`docs/content-schema.md` (tables, types, repository signatures). Requirements:
`docs/superpowers/specs/2026-09-24-content-studio-brief.md` (§n). Visual sources of truth:
`app/styles/tokens.css`, `docs/design-system.md`, `docs/motion-system.md`.

"The public site is expressive; the Studio is precise." The Studio is a custom React Router surface: same
tokens, higher density, visible controls, almost no motion, keyboard first. Studio chrome is English; content
fields are zh + en.

---

## 1. Principles

1. **Server decides.** Every Studio loader, action, API route and preview route verifies the Access JWT on the
   server and fails closed. Nothing in the client grants access; no secret reaches the browser.
2. **Draft freely, publish deliberately.** Saving a working copy is never blocked by missing content; Publish
   validates and lists what is missing. Live content changes only on Publish (content) or Save (placement and
   settings, labelled as live).
3. **One mental model per surface.** Content editors: Save → Publish. Homepage, settings, social links, taxonomy:
   Save = live.
4. **Recoverable by default.** Archive before delete; permanent delete is typed; undo toasts for reversible
   actions; unsaved work is guarded and backed up locally.
5. **No modals unless destructive.** Feedback is inline or in a status region; native `<dialog>` only for
   permanent deletion and for leaving with unsaved changes.

---

## 2. Route map

### 2.1 Route tree (`app/routes.ts`)

```ts
route("studio", "routes/studio/root.tsx", [            // middleware: owner guard; loader: session data
  layout("routes/studio/shell.tsx", [                   // sidebar + top bar
    index("routes/studio/home.tsx"),
    route("projects", "routes/studio/projects/list.tsx"),
    route("projects/new", "routes/studio/projects/new.tsx"),
    route("projects/:id", "routes/studio/projects/edit.tsx"),
    route("music", "routes/studio/music/list.tsx"),
    route("music/new", "routes/studio/music/new.tsx"),
    route("music/:id", "routes/studio/music/edit.tsx"),
    route("recognition", "routes/studio/recognition/list.tsx"),
    route("recognition/new", "routes/studio/recognition/new.tsx"),
    route("recognition/:id", "routes/studio/recognition/edit.tsx"),
    route("writing", "routes/studio/writing/list.tsx"),
    route("writing/new", "routes/studio/writing/new.tsx"),
    route("writing/:id", "routes/studio/writing/edit.tsx"),
    route("services", "routes/studio/services/list.tsx"),
    route("services/new", "routes/studio/services/new.tsx"),
    route("services/pricing", "routes/studio/services/pricing.tsx"),
    route("services/terms", "routes/studio/services/terms.tsx"),
    route("services/:id", "routes/studio/services/edit.tsx"),
    route("social", "routes/studio/social.tsx"),
    route("media", "routes/studio/media/library.tsx"),
    route("media/:id", "routes/studio/media/detail.tsx"),
    route("homepage", "routes/studio/homepage.tsx"),
    route("settings", "routes/studio/settings/index.tsx"),
    route("settings/brand", "routes/studio/settings/brand.tsx"),
    route("settings/site", "routes/studio/settings/site.tsx"),
    route("settings/taxonomies", "routes/studio/settings/taxonomies.tsx"),
    route("settings/footer", "routes/studio/settings/footer.tsx"),
    route("commissions", "routes/studio/commissions/list.tsx"),
    route("commissions/status", "routes/studio/commissions/status.ts"),
    route("commissions/student-discount", "routes/studio/commissions/student-discount.ts"),
    route("commissions/cleanup", "routes/studio/commissions/cleanup.ts"),
  ]),
  route("preview", "routes/studio/preview/layout.tsx", [ // public shell + PREVIEW bar, no Studio chrome
    route("home", "routes/studio/preview/home.tsx"),
    route("projects/:id", "routes/studio/preview/project.tsx"),
    route("music/:id", "routes/studio/preview/music.tsx"),
    route("recognition/:id", "routes/studio/preview/recognition.tsx"),
    route("writing/:id", "routes/studio/preview/writing.tsx"),
    route("services/:id", "routes/studio/preview/service.tsx"),
  ]),
]),
route("api/studio/session", "routes/api/studio/session.ts"),
route("api/studio/slug-check", "routes/api/studio/slug-check.ts"),
route("api/studio/media-search", "routes/api/studio/media-search.ts"),
route("api/studio/media-register", "routes/api/studio/media-register.ts"),
route("api/studio/media", "routes/api/studio/media.ts"),
route("api/studio/media/:id/content", "routes/api/studio/media-content.ts"),
// after the integration package flips it:
route("admin/*", "routes/admin-legacy-redirect.ts", { id: "admin-legacy" }),
route("admin", "routes/admin-legacy-redirect.ts", { id: "admin-legacy-index" }),
```

The auth middleware sits on the `studio` root, so it runs for the shell and the preview branch alike. The static
`studio` segment outranks the public `:lang` route, as `admin` does today.

### 2.2 Routes

Auth column: **A** = Access JWT verified (middleware + `withOwner`), **A+C** = Access + CSRF + mutation method
(`withOwnerMutation`). Every response under `/studio` and `/api/studio` is `Cache-Control: no-store`,
`X-Robots-Tag: noindex, nofollow`. Actions are dispatched by an `intent` field; unknown intents → 422.

| Path | Purpose | Loader data | Actions (`intent`) | Auth | Pkg |
| --- | --- | --- | --- | --- | --- |
| `/studio` (root) | guard, session | `{ ownerEmail, csrfToken, csrfExpiresAt, mediaConfig: {publicBaseUrl, uploadsEnabled, corsHosts, imageTransformations}, attentionCount }` | — | A | F |
| `/studio` (index) | Studio home (§4.2) | counts per type × status, recent changes (15), attention items, homepage summary, commission queue | — | A | P4 |
| `/studio/projects` | list | rows, facets (years, categories), active filters from `?q&status&category&year&featured&sort` | `create`, `reorder` (`ids` JSON), `feature`, `unfeature`, `archive`, `restore`, `duplicate` | A / A+C | P1 |
| `/studio/projects/new` | quick create | categories | `create` (title, primary category) → 303 to editor | A / A+C | P1 |
| `/studio/projects/:id` | editor | `{ meta, content, publishedContent, issues, terms, assets (summaries of referenced ids), music (tracks referencing it), redirects, urls: {preview, publicZh, publicEn} }` | `save`, `publish` (saves then publishes), `unpublish`, `archive`, `restore`, `revert`, `duplicate`, `delete` (`confirm`), `feature`, `unfeature` | A / A+C | P1 |
| `/studio/music`, `/new`, `/:id` | list (filters artist, year, role, featured), create, editor | as projects, plus `showreel: {id, title, status} \| null`, project options | as projects, plus `set-showreel`, `clear-showreel` | A / A+C | P2 |
| `/studio/recognition`, `/new`, `/:id` | filters year, type | as projects | as projects | A / A+C | P3 |
| `/studio/writing`, `/new`, `/:id` | filters platform, status, category | as projects | as projects | A / A+C | P3 |
| `/studio/services`, `/new`, `/:id` | grouped list (filters status, group); editor | rows include live price for commission rows (`getActivePriceRule`) | as projects; commission rows: no `archive`/`delete` | A / A+C | P4 |
| `/studio/services/pricing` | commission price versions | price versions per service, active rule | `publish-price-version` (existing `publishPriceVersion`) | A / A+C | I |
| `/studio/services/terms` | legal documents | term versions, publications | `publish-term-version` (requires `legalReviewConfirmed`) | A / A+C | I |
| `/studio/social` | social links table | links | `create`, `update`, `delete`, `toggle`, `reorder` | A / A+C | P3 |
| `/studio/media` | library | page of assets (`?q&kind&usage&missingAlt&cursor`), CORS/analysis status, upload availability | `register-url`, `update`, `archive`, `delete` (`acknowledgeDraftUsages`), `rebuild-usages` | A / A+C | P2 |
| `/studio/media/:id` | asset detail | asset, usages, public URL, image sources preview | `update`, `delete` | A / A+C | P2 |
| `/studio/homepage` | homepage control (§4.2.1) | hero (brand fields), sections + counts (site), showreel, featured lists per type with candidates, availability, contact CTA | `save-hero`, `save-sections`, `set-showreel`, `feature`, `unfeature`, `reorder-featured` (`type`, `ids`) | A / A+C | P4 |
| `/studio/settings` | settings index | links to sub-pages | — | A | P4 |
| `/studio/settings/brand` | BrandSettings | `{ value, revision }`, asset summaries | `save`, `confirm-contact-email`, `acknowledge-redesign-copy` | A / A+C | P4 |
| `/studio/settings/site` | SiteSettings | `{ value, revision }` | `save` | A / A+C | P4 |
| `/studio/settings/taxonomies` | terms per vocabulary (`?vocabulary=`) | terms with usage counts | `create`, `update`, `archive`, `delete`, `reorder` | A / A+C | P4 |
| `/studio/settings/footer` | footer link groups (existing `LinkGroupEditor` logic) | groups | `save-group`, `delete-group`, `reorder` | A / A+C | I |
| `/studio/commissions` | cases (existing `CaseTable`, filters service/status, cursor) | cases, student reviews, cleanup due | — | A | I |
| `/studio/commissions/status` | resource route | — | POST status change (`updateCaseStatus`) | A+C | I |
| `/studio/commissions/student-discount` | resource route | — | POST (`resolveStudentDiscount`) | A+C | I |
| `/studio/commissions/cleanup` | resource route | — | POST verified cleanup (`confirmVerifiedCleanup` + Apps Script ledger) | A+C | I |
| `/studio/preview/home` | home as it would look (`?locale&drafts=1`) | public home view models in preview mode | — | A | P5 |
| `/studio/preview/projects/:id` | project detail preview (`?locale`) | working-copy view model | POST: form data (unsaved) → view model, nothing stored | A / A+C | P5 |
| `/studio/preview/{music,recognition,writing,services}/:id` | same pattern (music: hero + player card; recognition: home row; writing: detail or outbound card; service: its area page) | | POST (unsaved) | A / A+C | P5 |
| `GET /api/studio/session` | refresh CSRF | `{ csrfToken, expiresAt, ownerEmail }` | — | A | F |
| `GET /api/studio/slug-check` | `?type&slug&id` | `{ available, conflict? }` | — | A | F |
| `GET /api/studio/media-search` | picker search `?q&kind&cursor` | `{ items, next }` (ready assets only) | — | A | F |
| `POST /api/studio/media-register` | register external URL (JSON) | — | → `MediaAsset` | A+C (header) | F |
| `POST /api/studio/media` | declare upload (JSON) | — | → `{ assetId, uploadUrl }`; 503 `uploads_not_configured` without binding/base URL | A+C (header) | P2 |
| `PUT /api/studio/media/:id/content` | stream file body | — | → `MediaAsset` | A+C (header) | P2 |

Every route module is thin: `export const loader = withOwner(loadX)` / `export const action = withOwnerMutation(handleX)`,
where `handleX({ db, env, identity, formData, intent, params, now })` lives in the package's repository module and
is unit/worker tested without HTTP.

### 2.3 `/admin` redirects

After the integration package ports the remaining panels, `/admin` and `/admin/*` resolve to
`routes/admin-legacy-redirect.ts`: it calls `requireOwner` first (no redirect is issued to an unauthenticated
request; it gets 403 like today), then answers GET/HEAD with **301**, and any other method with **410 Gone**
(stale forms must not be replayed into new endpoints). Access keeps protecting `/admin` paths.

| Legacy path | Target |
| --- | --- |
| `/admin` | `/studio` |
| `/admin/content` | `/studio` |
| `/admin/content/:versionId/edit`, `/admin/content/:versionId/preview`, `/admin/posts/:versionId/edit` | look up `content_versions.entry_id` → `/studio/projects/:entryId` (work), `/studio/writing/:entryId` (post), `/studio/homepage` (page `home`), else `/studio` |
| `/admin/works` | `/studio/projects` |
| `/admin/posts` | `/studio/writing` |
| `/admin/services` | `/studio/services/pricing` |
| `/admin/terms` | `/studio/services/terms` |
| `/admin/links` | `/studio/settings/footer` |
| `/admin/cases` | `/studio/commissions` (query string kept) |
| `/admin/cases/status`, `/student-discount`, `/cleanup` | 410 for POST; GET → `/studio/commissions` |
| anything else under `/admin/` | `/studio` |

Until the flip, `/admin/*` stays fully functional, so commission cases, prices and terms are manageable at every
point of the build.

### 2.4 Preview routes

- Reachable only under `/studio/preview/*`: Access-gated, owner middleware, `no-store`, `X-Robots-Tag: noindex,
  nofollow`, `<meta name="robots" content="noindex,nofollow">`, UUID/seed ids, never linked from public pages.
- The preview layout renders the real `PublicShell` (header, footer from the *published* site context) and the
  real public page component, plus a fixed bar: `PREVIEW · NOT PUBLISHED · ZH | EN · DESKTOP | MOBILE · Close`.
  In-page links lead to the live public site (the bar says so).
- The Studio CSP variant for preview responses sets `frame-ancestors 'self'` so the editor can frame them; the
  editor page's variant adds `frame-src 'self'`.
- `?locale=zh|en` (default zh). Missing required fields render as empty, not as fallbacks; `TODO_CONTENT` rows
  show the existing PLACEHOLDER badge.
- Unsaved preview: editor button "Preview changes" uses `formAction="/studio/preview/<type>/<id>?locale=…"`,
  `formTarget="studio-preview"`, `formMethod="post"` on the editor form; the preview route action parses with the
  draft schema and returns the view model; nothing is written.

---

## 3. Authentication and authorization

### 3.1 Request flow

1. The browser requests `https://kamelkyp.com/studio/projects`.
2. Cloudflare Access (edge) matches the application path. Without a valid `CF_Authorization` cookie it redirects
   to the team login (One-time PIN to the allowed email). After login it sets `CF_Authorization` on
   `kamelkyp.com` (application session duration 8 h) and returns to the URL.
3. Access forwards the request to the Worker with `Cf-Access-Jwt-Assertion` (signed by the team's keys,
   `aud` = the application's AUD).
4. `workers/app.ts` creates the nonce and context and runs the router. The `studio` root route's server
   middleware calls `verifyAccessRequest(request, env)` (existing: jose remote JWKS
   `<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, `iss`, `aud`, `type: "app"`, `email === ADMIN_EMAIL`). Success:
   `context.set(ownerContext, { subject, email })`. Any failure: `throw new Response("Forbidden", { status: 403 })`.
5. Each loader/action is wrapped: `withOwner` reads `ownerContext`; if it is absent (a route accidentally
   registered outside the root), it runs `verifyAccessRequest` itself. `withOwnerMutation` additionally requires
   POST/PUT/PATCH/DELETE and a valid CSRF token (§3.4).
6. The root loader returns the CSRF token (subject = Access `sub`) and session data; child routes read it with
   `useRouteLoaderData("routes/studio/root")`.
7. `workers/app.ts` applies the Studio header set: CSP variant (§3.8), `no-store`, `X-Robots-Tag`.

Owner is the only role. A valid Access identity whose email differs from `ADMIN_EMAIL` gets 403 (the Access policy
should not admit it anyway).

### 3.2 The one dashboard change, and behaviour before it

Kevin adds `/studio`, `/studio/*` and `/api/studio/*` to the existing self-hosted Access application(s) for
production and preview (runbook `docs/runbooks/cloudflare-setup.md` §5, updated by the integration package).
Same application ⇒ same AUD ⇒ no config change.

Before that change, Cloudflare forwards `/studio` requests without `Cf-Access-Jwt-Assertion`.
`verifyAccessRequest` throws on the missing header, so **every Studio page, API and preview route answers
`403 Forbidden` with `no-store`**. A forged header fails signature, issuer, audience or email checks and also gets
403. Nothing is ever served open. The loopback e2e suite asserts exactly this state for representative URLs of
each route family.

### 3.3 Login, logout, session

- **Login** is Access's login page; the Studio has no login form and stores no passwords.
- **Session persistence** is the Access `CF_Authorization` cookie (8 h, set by Access, not by the app). The app
  sets no cookies of its own for auth.
- **Logout**: account menu → "Sign out" links to `/cdn-cgi/access/logout` on the application domain. Access clears
  the cookie and revokes the session; previously issued tokens stop being accepted within 20–30 s. The next Studio
  request goes back to the Access login.
- **Expiry mid-session**: a navigation is redirected by Access to its login; a background `fetch`/`fetcher`
  request receives Access's redirect (opaque cross-origin) and fails. The Studio treats a failed or 403 mutation
  as in §3.4.

### 3.4 CSRF

- Token: existing `createCsrfToken` (HMAC-SHA256 over a random nonce + expiry, bound to the Access `sub`,
  30 minutes), verified by `verifyCsrfToken` including `Origin === APP_ORIGIN`.
- Forms send it as the hidden field `csrfToken` (every Studio `<Form>` gets it from the `StudioForm` primitive).
  JSON and upload requests send it as header `X-Studio-CSRF`; foundation adds
  `requireOwnerMutation(request, env, { token })` next to the existing FormData variant.
- Refresh: `session.client.ts` fetches `GET /api/studio/session` every 20 minutes while the tab is visible and on
  window focus, and updates the token used by `StudioForm`. React Router's post-action revalidation also refreshes
  the root loader's token.
- On a 403 from a mutation the client refreshes the token once and retries automatically. If the retry is still
  403 (Access session ended), the save state becomes **Error: "Session expired. Sign in again, then retry."** with a
  link that opens `/studio` in a new tab (Access login); the form content is already in the sessionStorage backup,
  so after signing in "Retry" succeeds without data loss.

### 3.5 API authorization

`/api/studio/*` handlers call `withOwner` / `withOwnerMutation` explicitly (they are resource routes outside the
root's middleware). GET routes are read-only. Mutations need the header token and a mutation method. Errors:
403 plain text for auth; JSON `{ code }` with 409 (stale revision), 413 (upload too large), 415 (type not allowed),
422 (validation, with `issues`), 503 (`uploads_not_configured`).

### 3.6 Local development and tests (without weakening production)

What exists today and is reused: auth is tested in worker tests with an injected `JwtVerifier`
(`tests/worker/admin-guard.test.ts`); admin behaviour is tested at the service layer; e2e only asserts that
`/admin` is 403; `verify:production` rejects builds containing `TEST_ADMIN_BYPASS`/test JWT keys (the loopback
`.dev.vars` line `TEST_ADMIN_BYPASS=true` is inert: no code reads it).

| Layer | How the Studio is tested |
| --- | --- |
| Guard | `tests/worker/studio-auth.test.ts`: `requireOwner`, middleware and header-CSRF variant with the injected verifier (valid, wrong email, missing header, expired CSRF, wrong origin, GET mutation). |
| Coverage | `tests/unit/studio-route-guards.test.ts`: statically asserts that every `loader`/`action` exported under `app/routes/studio/**` and `app/routes/api/studio/**` is `withOwner(...)`/`withOwnerMutation(...)`, and that `routes/studio/root.tsx` exports the middleware. |
| Behaviour | Worker tests call each package's `handleX(...)` / `loadX(...)` functions directly against migrated D1 (no HTTP, no auth), exactly like `tests/worker/admin-*.test.ts` today. |
| UI | Unit tests render Studio components with `react-dom/server` (pattern of `tests/unit/block-renderer.test.tsx`) and test pure hooks/reducers (save state, reorder, form parsing). |
| Fail-closed e2e | `tests/e2e/studio-access.spec.ts` (loopback, **production build**): `/studio`, `/studio/projects`, `/studio/projects/x`, `/studio/preview/home`, `/api/studio/session`, `PUT /api/studio/media/x/content` → 403 with `no-store` and `X-Robots-Tag`. |
| Browser flows (optional CI job) | `npm run test:e2e:studio`: Playwright against `react-router dev` (Vite dev server) with the dev owner below; specs in `tests/e2e-studio/`. |

**Dev owner (local only).** `requireOwner` contains:

```ts
if (import.meta.env.DEV && env.STUDIO_DEV_OWNER_EMAIL &&
    env.STUDIO_DEV_OWNER_EMAIL === env.ADMIN_EMAIL) {
  return { subject: "dev-owner", email: env.ADMIN_EMAIL };
}
```

`import.meta.env.DEV` is `true` only under the Vite dev server and is replaced by the literal `false` in
`react-router build`, so the branch is dead code in every deployable bundle (production, preview, loopback).
Belt and braces: `verify-production-config.mjs` fails if the build output contains `STUDIO_DEV_OWNER` or if the
rendered config defines that var; the renderer never emits it; the loopback e2e (a production build) proves the
403. Local `.dev.vars` for Studio work: `ADMIN_EMAIL`, `STUDIO_DEV_OWNER_EMAIL` (same value),
`APP_ORIGIN=http://localhost:5173`, `CSRF_SECRET` (≥ 32 chars), plus the existing loopback values.

### 3.7 Failure modes

| Situation | Result |
| --- | --- |
| No Access header (paths not yet protected, or direct Worker hit) | 403, no-store |
| Header present, bad signature / wrong aud / wrong iss / not `type: app` | 403 |
| Valid Access user, different email | 403 |
| JWKS fetch fails | 403 (verifier throws) |
| `ADMIN_EMAIL`/`ACCESS_*` missing in env | 403 |
| CSRF missing/expired/wrong subject/wrong Origin | 403; client refreshes once and retries |
| GET to a mutation endpoint | 405 |
| Legacy `/admin/*` POST after the flip | 410 |

### 3.8 Headers for Studio responses (`app/lib/security/headers.server.ts`)

`buildSecurityHeaders({ nonce, mode, surface })` with `surface` derived from the path:

| Surface | Differences from the public CSP |
| --- | --- |
| `studio` (`/studio/*` except preview, `/api/studio/*`) | `img-src 'self' https: data: blob:`; `media-src 'self' https: blob:` (local upload previews, metadata probing); `frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com` (preview pane); `frame-ancestors 'none'` |
| `studio-preview` (`/studio/preview/*`) | public CSP plus `frame-ancestors 'self'` |
| both | `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |

`style-src 'self'` is unchanged everywhere: **no inline `style` attributes** in Studio markup (progress uses
`<progress>`, focal points use CSS classes or SVG attributes, dynamic sizes use CSS grid/classes).

---

## 4. Information architecture and UX

### 4.1 Shell

Desktop (≥ 1024 px): fixed sidebar (15 rem) + main column; top bar inside the main column.

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ KAMEL STUDIO  │ Projects / Signal Garden        ● DRAFT  SAVED 14:02  [Preview changes] [Save] [Publish ▾] │
│               ├──────────────────────────────────────────────────────────────┤
│ HOME        3 │                                                              │
│ CONTENT       │                         page content                         │
│  Projects     │                                                              │
│  Music        │                                                              │
│  Recognition  │                                                              │
│  Writing      │                                                              │
│  Services     │                                                              │
│ SITE          │                                                              │
│  Homepage     │                                                              │
│  Social links │                                                              │
│  Media        │                                                              │
│ SETTINGS      │                                                              │
│  Brand · Site · Taxonomies · Footer                                          │
│ OPERATIONS    │                                                              │
│  Commissions 2│                                                              │
│  Pricing      │                                                              │
│  Terms        │                                                              │
│───────────────│                                                              │
│ Preview site ↗│                                                              │
│ Live site ↗   │                                                              │
│ owner@… ▾     │  (menu: Sign out)                                            │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- Nav groups are mono XS labels; items are Body·S links with `aria-current="page"`; counts: attention on HOME,
  pending review on Commissions.
- "Preview site" → `/studio/preview/home?drafts=1` (new tab); "Live site" → `/zh` (new tab).
- Skip link to main content; `<title>`: `<Page> — KAMEL STUDIO`; `<html lang="en">` on Studio routes.

### 4.2 Studio home (§26–27)

Top: quick actions row: **New Project**, **New Music Entry**, **New Recognition**, **New Writing**,
**Upload Media**, **Edit Homepage**, **Preview Site** (buttons; each `New` posts `create` and lands in the editor).

Two columns (single column on mobile), ruled lists, no charts, no cards grid:

| Block | Content |
| --- | --- |
| Needs attention | Ordered by severity; each row links to the fix: contact email unconfirmed; redesign copy unacknowledged; showreel unset or its track not published; no featured projects; published items with unpublished changes; published items missing a locale (legacy); `TODO_CONTENT` drafts (count, link to filtered lists); images used by published entries without alt text; pending uploads/failed uploads; commissions pending review, student reviews, cleanup due. |
| Recent changes | 15 most recent `updated_at` across content tables, settings and social links: type, title (current locale zh), status badge, relative time. |
| Content | Table: rows Projects, Music, Recognition, Writing, Services; columns Published, Draft, Archived, TODO; each number links to the filtered list. |
| Homepage | Showreel (title + status), featured projects in order (titles), counts of featured music/recognition/writing/services, section visibility summary, "Edit homepage". |
| Commissions | Pending review, awaiting deposit, in production counts; link to Commissions. |

#### 4.2.1 Homepage control (`/studio/homepage`, §21)

One page, ruled sections, each with its own Save (label: "Save — goes live immediately"):

1. **Hero**: brand name (read-only here, link to Brand), roles, statement, subtext, primary and secondary CTA,
   availability status + message.
2. **Sections**: visibility toggles in homepage order (showreel, selected work, capabilities, recognition,
   services, pricing, about, writing, contact) and the counts (featured projects, writing, recognition).
3. **Showreel**: current track, "Change" opens a picker of music tracks with audio; "Clear". Warning if the track
   is not published.
4. **Featured projects / music / recognition / writing / services**: ordered lists with order controls (§4.12),
   remove (unfeature), "Add…" picker of published or draft items (drafts marked "not live until published").
5. **Contact CTA**: contact band body and variants (site settings).

### 4.3 List views (§25)

- Header: title, total count, primary button "New <type>".
- Filter bar (URL search params, so filtered views are linkable and survive reload): search input (`/` focuses it;
  matches titles and metadata in both locales), status segmented control (Active = draft + published (default),
  Draft, Published, Archived, All), type filters: Projects: category, year, featured; Music: artist, year, role,
  featured; Recognition: year, type; Writing: platform, status, category; Services: status, group.
- Rows (40 px): order position/handle (manual order mode only) · title (current zh value, en value as secondary
  line when different; "Untitled" in meta colour when empty) · status badge (+ CHANGES / TODO_CONTENT / SHOWREEL /
  FEATURED markers) · type-specific meta (year, primary category, platform, group, live price) · updated
  (relative) · row menu (`⋯`: Edit, Preview, Duplicate, Feature/Unfeature, Archive/Restore).
- Whole row is a link to the editor (focus ring inset); menu and handle are separate focus stops.
- Sort: Manual order (default when no filter/search), Updated, Year/Date. Reordering is only available in manual
  order with no filters active.
- Empty states: "No projects yet — New project" / "No results for 'x' — Clear filters".
- Bulk actions: none this phase (single owner, small collections).

### 4.4 Editor layout (§8)

≥ 1200 px: three regions.

```
┌─ section index ─┬──────────── form ────────────┬──────── preview ────────┐
│ BASIC        ●  │ BASIC                        │ [ZH|EN] [Desktop|Mobile]│
│ MEDIA           │  Title   ZH [……]  EN [……]    │                         │
│ CLASSIFICATION  │  Slug    /en/works/[……] ✓    │   iframe                │
│ CASE STUDY   2  │  …                           │   /studio/preview/…     │
│ LINKS           │ MEDIA  ▸                     │                         │
│ CREDITS         │ …                            │                         │
│ PUBLICATION  !  │                              │ [Hide preview]          │
└─────────────────┴──────────────────────────────┴─────────────────────────┘
```

- Section index: sticky; each entry shows a dot when the section has unsaved edits and a count of blocking issues.
- Sections are `<details>` (open by default for BASIC and PUBLICATION; others remember their state per type in
  `localStorage`); headers are mono XS labels with a hairline.
- Preview pane: iframe of `/studio/preview/<type>/<id>?locale=…`; refreshes after each successful save; "Preview
  changes" (Mod+Shift+Enter) posts the unsaved form into it. Mobile width toggle sets the iframe to 390 px.
  Collapsible; hidden below 1200 px, where "Preview" opens a new tab.
- Localized fields (§4.13 `LocalizedTextField`): ZH and EN side by side with mono labels, `lang="zh-Hant"` /
  `lang="en"` on the inputs, a fill marker per locale, "Required to publish" hint on required fields, optional
  "Same in both" for names and titles that do not translate.

Section maps per type:

| Type | Sections (fields) |
| --- | --- |
| Project | **BASIC** title, slug, year, role, short description, description · **MEDIA** cover image, cover video, gallery (ordered, captions), social image · **CLASSIFICATION** primary category, categories, tools, technologies · **CASE STUDY** context, problem, approach, process, architecture, result, reflection, additional content blocks (legacy bodies) · **LINKS** · **CREDITS** · **PUBLICATION** status, listed, featured, SEO title/description, checklist, danger zone |
| Music | **BASIC** title, artist, year, role, genre, description · **AUDIO** preview audio, full audio, duration, preview start/end, artwork · **LINKS** Spotify, YouTube, SoundCloud, other · **CREDITS** · **RELATIONS** project · **PUBLICATION** featured, homepage showreel toggle |
| Recognition | **BASIC** event, organization, result, type, year, date · **DETAILS** description, URL, image, discipline, related project · **PUBLICATION** |
| Writing | **BASIC** title, slug, date, platform (+ label for Other), category, excerpt · **SOURCE** external URL · **CONTENT** block editor with ZH/EN tabs (ported `BlockEditor`) · **MEDIA** cover, social image · **PUBLICATION** listed, featured, SEO |
| Service | **BASIC** name, slug (locked for commission rows), group, short description, description · **PRICING** price mode, amount, currency; commission rows: read-only live price "NT$8,000 from price version full-2026-08-10 → Change in Pricing" · **DETAILS** turnaround, revisions, deliverables, requirements, process, FAQ, inquiry subject · **PUBLICATION** |
| Social links | single table, inline edit rows (platform, label ZH/EN, URL, username, enabled), add row, order controls |
| Media asset | preview, filename, type, size, dimensions/duration, public URL (copy), title/alt/caption ZH/EN, credit, focal point (images: click on an SVG overlay), preview range (audio), tags, usages list, delete |
| Brand settings | **IDENTITY** brand name, tagline, roles, location · **HERO** statement, subtext, CTAs · **ABOUT** short bio, long bio, sections · **CAPABILITIES** · **CONTACT** email + "Confirm this address" · **ASSETS** portrait, logo, favicon, brand assets |
| Site settings | **SEO** site title, site description, SEO description, OG image, default social image · **NAVIGATION** order/visibility · **FOOTER** message, copyright · **AVAILABILITY** · **SERVICE PAGES** service areas, services process, software page |

### 4.5 Publication panel

In the PUBLICATION section and mirrored in the top bar (status badge + menu):

- Status line: `DRAFT` / `PUBLISHED 2026-09-24 14:02` / `ARCHIVED`, plus `CHANGES` when the working copy differs
  from the snapshot, and links "View live" (zh/en) and "Preview".
- **Checklist**: blocking issues (error) and warnings from `validateXForPublish`, computed on the client for the
  dirty form (same zod schemas) and on the server after save; each item focuses its field (opening its section and
  locale).
- Actions by state: Draft → Publish · Archive · Duplicate · Delete permanently (danger zone). Published → Publish
  changes (when CHANGES) · Revert to published (when CHANGES) · Unpublish · Archive · Duplicate. Archived →
  Restore to draft · Delete permanently.
- `TODO_CONTENT` rows: Publish disabled with the explanation "Seeded sample content. Replace the text, then clear
  the TODO_CONTENT flag." and a checkbox "This is real content" (clears the flag on save).
- Commission-linked services: no Archive/Delete; Unpublish explains that the wizard entry disappears too.

### 4.6 Save-state model

Always exactly one of four states, shown in the top bar (mono XS, `role="status"`, `aria-live="polite"`):

| State | Shown | Entered when |
| --- | --- | --- |
| Saved | `SAVED 14:02` (or `NO CHANGES` for a fresh record) | load; successful save; revert |
| Unsaved Changes | `UNSAVED CHANGES` (warning colour) | any field differs from the last saved baseline (deep compare of the serialized form) |
| Saving | `SAVING…` | a `save`/`publish` submission is in flight |
| Error | `ERROR — RETRY` (danger colour) + message below the top bar | the last submission failed (network, 403 after retry, 409, 422 structural). Stays until the next successful save; edits keep the form dirty but the Error stays visible |

409 (edited in another tab): message "This entry changed elsewhere." with **Reload latest** (your edits stay in the
local backup and a "Restore my unsaved changes" banner appears after reload). 422 on save: field errors inline
(structural only). Publish returns `{ ok: false, issues }` with the draft already saved: state goes to Saved and
the checklist opens.

### 4.7 Unsaved-changes guard and autosave

- **Autosave: off.** Reasons: (1) "Saved" must mean "stored on the server"; a background save failing on an
  expired CSRF token or Access session would be silent or ambiguous; (2) revision conflicts would surface at
  random moments; (3) every pause would bump `revision` and flood Recent changes; (4) the working copy never
  touches the live site, so an explicit Save costs little. This satisfies §31 ("only if reliable and
  unambiguous").
- **Local backup instead:** while dirty, the serialized form is written to `sessionStorage` (key
  `studio:<type>:<id>`) at most every 2 s; cleared on successful save. On load, a newer backup than the server's
  `updated_at` shows a banner: "Unsaved changes from 14:05 found. Restore · Discard".
- **Guard:** `useBlocker` for in-app navigation when dirty → native `<dialog>`: "Leave without saving?" [Stay]
  [Save and leave] [Discard]; `beforeunload` when dirty for tab close/reload.
- **Shortcut:** Mod+S saves (prevents the browser save dialog).

### 4.8 Feedback

- Toast region: bottom-right on desktop, bottom full width on mobile; max 3 stacked; `role="status"` (success,
  4 s auto-dismiss, pause on hover/focus) or `role="alert"` (errors, persistent until dismissed). Examples:
  "Published · View live", "Archived · Undo", "Order saved", "Uploaded signal-garden.jpg · 2.4 MB", "Upload failed:
  file type not allowed".
- Inline messages for field errors and section issues; the top bar shows save state; buttons show pending state
  (`aria-busy`, label "Publishing…").
- No confirmation modals for reversible actions (archive, unpublish, unfeature, reorder): they happen at once and
  offer Undo where meaningful.

### 4.9 Delete safety (§32)

- Published content cannot be deleted (UI hides it; DB trigger enforces). Primary path: Archive (Undo toast) or
  Unpublish.
- Permanent delete: only for Draft or Archived, inside a collapsed "Danger zone" `<details>`; opens a `<dialog>`
  listing consequences (slug redirects removed, homepage slot cleared, media usages removed) and requires typing
  the slug (or `DELETE` for types without a slug); the confirm button stays disabled until it matches.
- Media: blocked while used by published content (lists where); draft-only usage → dialog lists usages and asks for
  confirmation; unused → single confirm.
- Taxonomy terms: delete only when unused; otherwise Archive (hidden from pickers and filters).
- Commission-linked services and price/term versions: no delete (immutable by design).

### 4.10 Validation UX (§23)

- Draft saves never fail for missing content. Structural problems (text over limits, malformed URL fields in
  settings, unknown ids) are shown inline and are the only save blockers.
- Publish readiness is visible before pressing Publish (checklist count on the Publish button: "Publish · 3
  issues"). Pressing it with blocking issues does not submit; it opens the checklist and focuses the first issue.
- Required rules: Project = title, slug, year, category, short description (zh + en); Service = name, description,
  pricing mode (+ price and currency for fixed/starting-from non-commission rows); Writing = title, date, platform,
  and content (zh + en) or external URL; Music = title, artist, one playable source; Recognition = year, type,
  event. Plus shared rules: alt text on used images, https URLs, unique slug, no `TODO_CONTENT`, brand guard,
  snapshot size.
- Locale issues name the locale: "EN missing". One-locale optional fields are warnings: "Reflection is only in
  ZH; it will not show on the English page."

### 4.11 Slug UX (§24)

- `SlugField` under the title shows the public URL prefix (`/en/works/`) and the slug.
- Auto mode: slugified from the EN title as it is typed (fallback from ZH is not transliterated; a zh-only title
  yields `project-<6 chars>`), until Kevin edits the slug or the entry has been published (then it is manual for
  good). Title changes never alter a published slug.
- Live check (300 ms debounce, `/api/studio/slug-check`): Available ✓ · Taken by "X" (status) ✗ · Old URL of "Y"
  (redirect; allowed with a warning that the redirect will be replaced).
- Editing the slug of a published entry shows: "After you publish, /en/works/old-slug will redirect here."
- Validation: `[a-z0-9-]`, no leading/trailing hyphen, ≤ 96 chars; invalid characters are converted on blur.

### 4.12 Ordering UX (§21)

- Default: explicit controls, no dependency. In manual-order mode each row has a handle button
  (`aria-label="Reorder: Signal Garden, position 3 of 12"`), Move up / Move down buttons (visible on hover and focus
  on desktop, always visible on touch), and "Move to position…" in the row menu.
- Keyboard: focus the handle, Space/Enter picks up (live region "Picked up Signal Garden, position 3"),
  ArrowUp/ArrowDown move, Space/Enter drops, Escape cancels. Alt+ArrowUp/ArrowDown moves the focused row at once.
- Each drop saves immediately (one `reorder` request with the full ordered id list, applied by a single
  `json_each` statement); the moved row flashes a background highlight (`--dur-3`); toast "Order saved"; a failure
  restores the previous order and shows an error toast.
- Pointer drag-and-drop is not required. No library is added; if pointer dragging is wanted later, a ~150-line
  Pointer Events hook that moves rows via CSSOM in an effect (CSP-safe) is enough; explicit controls stay as the
  accessible path.

### 4.13 Shared Studio primitives (foundation, `app/components/studio/ui/`)

`StudioForm` (CSRF field, intent buttons, fetcher wiring), `useEditorForm` (dirty tracking, save state, Mod+S,
guard, sessionStorage backup), `Field`, `TextInput`, `TextArea` (CSS `field-sizing: content` with a `rows`
fallback), `NumberInput`, `DateInput`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `LocalizedTextField`,
`LocalizedTextArea`, `ListEditor` (repeatable rows: links, credits, deliverables, FAQ), `TagInput`, `TermSelect` /
`TermMultiSelect` (inline "Add category"), `MediaField` / `MediaListField` + `MediaPicker` (search, select, register
URL; upload tab provided by P2), `SlugField`, `StatusBadge`, `FlagBadge` (CHANGES, TODO_CONTENT, FEATURED,
SHOWREEL), `SaveStateIndicator`, `ToastProvider`/`useToast`, `ConfirmDialog` + `TypeToConfirm`, `FilterBar`,
`RowList`, `EmptyState`, `OrderControls` + `useKeyboardReorder`, `EditorLayout` (section index, sections, preview
slot), `PublicationPanel`, `ValidationChecklist`, `PreviewPane`, `ShortcutHelp`.

### 4.14 Mobile (§28)

- < 768 px: top bar with `KAMEL STUDIO` and a Menu button (nav in a disclosure panel); no sidebar, no split, no
  preview pane (Preview opens a new tab).
- Lists: stacked rows (title, status, one meta line); filters inside a "Filters" disclosure; order controls always
  visible.
- Editors: one column; sections collapsed except BASIC; sticky bottom bar with save state, **Save** and **More**
  (Publish, Unpublish, Archive, Preview). ZH/EN inputs stack vertically.
- Uploads through the native file input (photo library works); media grid becomes a list.
- Targets ≥ 44 px under `(pointer: coarse)`; body text 16 px in inputs (prevents iOS zoom).
- Supported on mobile: text edits, publish/unpublish/archive, status changes, simple uploads, reordering, homepage
  toggles, commission status changes. Desktop-only: preview split, block editor comfort (usable but cramped).

### 4.15 Keyboard shortcuts

Shown by `?` (help panel). Single-key shortcuts are ignored while focus is in a text field, except Mod combos and
Escape.

| Keys | Action |
| --- | --- |
| Mod+S | Save |
| Mod+Shift+Enter | Preview changes (editor) |
| `/` | Focus list search |
| `n` | New item (list pages) |
| `g` then `h` / `p` / `m` / `r` / `w` / `s` / `l` / `d` / `o` / `,` | Go to Home / Projects / Music / Recognition / Writing / Services / Social links / Media / Homepage / Settings |
| Alt+↑ / Alt+↓ | Move focused row (manual order) |
| Space / Enter on a handle, arrows, Escape | Keyboard reorder |
| Escape | Close panel, dialog or menu |
| `?` | Shortcut help |

Publishing has no single-key shortcut (deliberate click).

---

## 5. Visual specification

### 5.1 Derivation

Same tokens as the public site (`app/styles/tokens.css`): cold dark palette, Archivo / Noto Sans TC / IBM Plex Mono,
radius 0 with 2 px for controls, hairline rules, accent budget, focus ring (design-system §2, §3, §5). The Studio
changes **density and motion**, not identity: smaller type steps, tighter rhythm, visible controls, no ambient
motion, no display-size headings. Styles live in `app/styles/studio/base.css` (foundation) and per-area files, all
scoped under `.studio` and loaded by Studio route `links` only (public pages never load them). The legacy global
`admin.css` is removed by the integration package.

### 5.2 Density tokens (defined on `.studio`)

| Token | Value | Use |
| --- | --- | --- |
| `--studio-sidebar-w` | `15rem` | sidebar |
| `--studio-topbar-h` | `3rem` | top bar |
| `--studio-row-h` | `2.5rem` (coarse pointer: `var(--target-min)`) | list and table rows |
| `--studio-control-h` | `2.25rem` (coarse: `var(--control-h-s)`) | inputs, buttons, selects |
| `--studio-control-h-compact` | `2rem` | row buttons, badges' hit area on desktop |
| `--studio-gap` | `var(--space-4)` | default gap; `--space-3` inside rows, `--space-6` between sections |
| `--studio-panel-pad` | `var(--space-5)` | section padding |
| `--studio-measure` | `72ch` | long text areas |

### 5.3 Type

| Role | Style |
| --- | --- |
| Wordmark | `KAMEL` Archivo 700, `font-stretch: 125%`, 1rem, tracking 0.08em, uppercase + `STUDIO` IBM Plex Mono 500 `--text-meta-xs`, `--color-text-meta`. Accessible name "KAMEL STUDIO" |
| Page title | `--text-h2` (display 600), sentence case; one per page |
| Section header | IBM Plex Mono 500 `--text-meta-xs`, uppercase, tracking 0.1em, `--color-text-meta`, hairline below |
| Field label | Noto Sans TC / body 500, `--text-body-s` (0.875rem), `--color-text` |
| Hint / meta | body 400 0.8125rem `--color-text-secondary`; mono `--text-meta-xs` for dates, counts, ids |
| Body in rows and inputs | `--text-body-s` 0.875rem, line-height 1.5 (zh 1.7); inputs 16 px under coarse pointer |
| Numbers | `font-variant-numeric: tabular-nums lining-nums` (counts, prices, positions, sizes) |

### 5.4 Surfaces and layout

- Page background `--color-bg`; sidebar `--color-bg-2` with a `--color-rule` inline-end hairline; panels
  (editor sections, dialogs, preview frame chrome) `--color-surface` with the level-2 top light edge; menus and
  toasts level 3 (surface + edge + near-black shadow). No glow, no gradients, no rounded cards.
- Region dividers are `1px --color-rule` hairlines (a Studio-only allowance: app regions, not page sections).
- Editor grid: `grid-template-columns: 12rem minmax(0, 1fr) minmax(24rem, 40%)`; list pages: single column,
  max-inline-size none (tables use the width).

### 5.5 Rows and tables

Row height `--studio-row-h`, `border-block-end: 1px solid var(--color-rule)`, hover `--color-surface-hover`,
current/selected row: inset 2 px `--color-accent` bar on the inline start. Column headers: mono XS meta,
sticky. Row focus ring inset (`outline-offset: -2px`, design-system §5.5).

### 5.6 Form controls

Fill `--color-bg-2`; border `1px solid var(--color-control-border)` (3:1, fixing the old admin's 1.6:1);
radius `--radius-xs`; height `--studio-control-h`; focus: border `--color-accent` + focus ring; invalid:
border `--color-danger` + message in `--color-danger` with `aria-describedby`; disabled: `--color-text-meta`
text, dashed border. Checkbox/switch use native inputs styled with `accent-color: var(--color-accent)`.
Localized pairs: two columns with a 1 px rule between; mono `ZH` / `EN` labels.

### 5.7 Buttons

Display family 600, 0.8125rem, tracking 0.06em, uppercase via `text-transform` (accessible names keep authored
case). Primary: `--color-accent` fill, `--color-on-accent` text (Publish, Save). Secondary: transparent,
`--color-control-border` border. Danger: transparent with `--color-danger` text/border; filled danger only
inside the delete dialog. Pending: `aria-busy="true"`, label change, no spinner animation beyond an opacity pulse
(disabled under reduced motion).

### 5.8 Status badges and flags

Metadata·XS mono, uppercase, height 1.375 rem, `padding-inline: var(--space-2)`, radius `--radius-xs`
(PLACEHOLDER badge geometry, design-system §6.10):

| Badge | Style |
| --- | --- |
| DRAFT | `1px dashed var(--color-control-border)`, text `--color-text-secondary` (dashed = provisional) |
| PUBLISHED | `1px solid color-mix(in srgb, var(--color-success) 55%, transparent)`, text `--color-success` |
| ARCHIVED | no border, fill `--color-bg-2`, text `--color-text-meta` |
| TODO_CONTENT | `1px dashed var(--color-warning)`, text `--color-warning` |
| CHANGES | text `--color-accent`, 6 px square marker before the label (radius 0) |
| FEATURED / SHOWREEL | text `--color-accent`, no border |

Status is never conveyed by colour alone (the word is always present).

### 5.9 Focus and accessibility

Focus ring per design-system §5.5 (2 px accent, 2 px offset; inset for rows). All controls reachable by keyboard
in visual order; section index and row menus are real buttons/links; dialogs use native `<dialog>` with focus
return; live regions for save state, toasts and reorder announcements; axe clean (integration package runs axe on
home, a list, an editor, media, settings).

### 5.10 Motion (§29)

Allowed, all ≤ `--dur-2` (200 ms) with `--ease-standard` unless noted: colour/border transitions on hover and
focus (`--dur-1`); disclosure open/close via `grid-template-rows: 0fr → 1fr` (`--dur-2`); toast enter (opacity +
8 px translate, `--dur-2`); reorder highlight fade (`--dur-3`); upload progress (native). Not allowed: page
transitions, scroll reveals, parallax, magnetic hover, canvas/WebGL, ambient loops, text reveals, skeleton
shimmer loops. Under `prefers-reduced-motion: reduce` the duration tokens already collapse to `--dur-1`
(`tokens.css`); the Studio additionally sets `transition: none` for translate-based motion.

### 5.11 Imagery in the Studio

Thumbnails are `object-fit: cover` in fixed-ratio boxes (1:1 in lists, 16:9 in pickers) using the same
`imageSources` helper as the public site (small widths); audio assets show filename + duration (no waveform
rendering in lists); broken/missing assets render a hairline box with "Missing asset" in meta colour.
