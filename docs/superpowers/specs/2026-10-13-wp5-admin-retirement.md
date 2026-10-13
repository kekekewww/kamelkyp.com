# WP5: Retire the legacy `/admin` (integration package "I", flip + delete)

Status: spec, 2026-10-13. Branch `claude/wp5-admin-retirement`, cut from `origin/main` once WP1–WP3 are merged
(integration plan `docs/superpowers/plans/2026-10-13-finish-code-work.md` §1, §4.4; the plan's §2 and §9 win over
this spec).
Depends on: **WP1** (commissions), **WP2** (pricing + terms), **WP3** (footer), specced in parallel under
`docs/superpowers/specs/2026-10-13-wp{1,2,3}-*.md`. WP5 is the last step of package I in
`docs/content-architecture.md` §9 ("I. Integration and QA") and must merge after all three.

Scope in one line: point every `/admin` URL at the owner-gated redirect module, delete the legacy admin routes,
components, styles and admin-only library code, keep the four operations services that WP1/WP2 reuse, and update
the tests and docs that still describe `/admin`.

---

## 1. Goal

1. `/admin` and every legacy `/admin/...` URL is answered by `app/routes/admin-legacy-redirect.ts`: owner check
   first (no owner: 403, nothing read), then `GET`/`HEAD` → **301** to the Studio equivalent, any other method →
   **410 Gone**.
2. No legacy admin UI code is left: `app/routes/admin/**`, `app/components/admin/**`, `app/styles/admin.css` and
   its global `<link>` in `app/root.tsx`, plus library code that only the legacy screens used.
3. The four service modules the Studio operations screens reuse (`case`, `cleanup`, `service-catalog`, `term`)
   stay where they are, unchanged.
4. `/studio` stays protected exactly as today: Access JWT verified on the server, fail closed, CSRF on mutations.
   No new Studio route is added by WP5.
5. Tests and docs describe the post-flip behaviour. No public page changes. No price, term, or case data changes.
   No migration.

Out of scope: dropping legacy D1 tables (content-architecture §5.1 step 5 defers this to a later project),
renaming `app/lib/admin/*` survivors, the inert `TEST_ADMIN_BYPASS` loopback line and its
`verify-production-config.mjs` guard (both stay), brand-line doc edits (design-system §3.5 and checklist item 5
at `:874`, IA `:14-16`, `:186`, `:367`, `:711`, `:828`, `:835`). Those belong to the brand/QA part of package I
(content-architecture.md:560, `:801-802`). **WP6 (hygiene) claims them**: `2026-10-13-wp6-hygiene.md` item (e),
file rows `:559-560`, and conflict note `:717`. WP5 edits other lines of the same two files (§5), so whichever WP
merges second rebases. Also out of scope: dead
public CSS that is not admin-related (`.content-index-page`, `.content-index*` in `app/styles/legacy.css`, which
have no consumer anywhere in `app/`). WP6 removes the real-name rules; wp7 retires the rest of the file after WP5
(integration plan §9 C3 a).

---

## 2. Source requirements

| Source | Requirement (quoted or summarised) |
| --- | --- |
| Brief §3 (`docs/superpowers/specs/2026-09-24-content-studio-brief.md:33-38`) | "Prefer `/studio` (else `/admin`)… Never linked from public navigation." |
| Brief §4 (`…brief.md:40-45`) | Single Owner role; "protected server-side routes, unauthorized → login, API authorization, no client-only security". |
| Brief §33-34 (`…brief.md:186-191`) | "Inspect and reuse existing database, auth, storage, API." |
| admin-architecture §2.1 (`docs/admin-architecture.md:84-86`) | After the flip: `route("admin/*", "routes/admin-legacy-redirect.ts", { id: "admin-legacy" })` and `route("admin", …, { id: "admin-legacy-index" })`. **This snippet is wrong as written; see §3.5 and §4.3.** |
| admin-architecture §2.3 (`docs/admin-architecture.md:138-160`) | "`/admin` and `/admin/*` resolve to `routes/admin-legacy-redirect.ts`: it calls `requireOwner` first (no redirect is issued to an unauthenticated request; it gets 403 like today), then answers GET/HEAD with **301**, and any other method with **410 Gone**… Access keeps protecting `/admin` paths." Target table at `:145-157`. |
| admin-architecture §3.6 (`docs/admin-architecture.md:251-254`) | Current testing statement ("e2e only asserts that `/admin` is 403"; `tests/worker/admin-guard.test.ts`). Must be updated. |
| admin-architecture §3.7 (`docs/admin-architecture.md:292`) | Failure mode: "Legacy `/admin/*` POST after the flip → 410". |
| admin-architecture §5.1 (`docs/admin-architecture.md:596-597`) | "The legacy global `admin.css` is removed by the integration package." |
| content-architecture §2 decision 1 (`docs/content-architecture.md:141`) | "legacy admin panels (pricing, terms, cases, links) ported into the Studio shell; `/admin/*` GET → 301 to the Studio equivalent after an owner check… legacy `/admin` stays live until the port lands." |
| content-architecture §7 (`docs/content-architecture.md:610`) | "`/admin/*` keeps working until the redirect flip, which is released only after Kevin confirms `/studio` loads". |
| content-architecture §9 F (`docs/content-architecture.md:677,682`) | F created `admin-legacy-redirect.ts` "(created, not yet wired)"; `app/root.tsx` is "handed to I, which removes the global `admin.css` link". |
| content-architecture §9 I (`docs/content-architecture.md:791-807`) | I owns the ports (WP1-3 here), "`app/routes.ts` (flip `/admin/*` to `admin-legacy-redirect.ts`), deletion of `app/routes/admin/**`, `app/components/admin/**`, `app/styles/admin.css` (+ its link in `app/root.tsx`), `app/lib/admin/{content-service,media-content-service,block-form}*`, `app/lib/db/content-repository.server.ts`, `app/lib/media/media-repository.server.ts`, `app/lib/content/public-content.server.ts` legacy parts, their tests; `docs/design-system.md` §3.5/§6.25 …; `docs/runbooks/cloudflare-setup.md` (Access paths…); `docs/runbooks/release-checklist.md`". Acceptance: "every legacy admin capability reachable in `/studio` (content, services/prices, terms, works, links, posts, cases, case status, student discount, cleanup); `/admin/*` GET → 301 after owner check". |
| content-architecture §1.9 (`docs/content-architecture.md:126,129`) | Tests owned by I: `admin-block-form.test.ts` ("legacy admin form parsing deleted"); worker `content-repository`, `media-repository`, `public-content`, `admin-publication` ("legacy libraries deleted after cut-over (legacy tables stay)"). |
| content-architecture §5.1 step 5 (`docs/content-architecture.md:455-456`) | "Legacy tables (`content_*`, `media_items`) stay read-only for at least one release, then a later migration may drop them (not part of this project)." |
| content-architecture §8.1 (`docs/content-architecture.md:625-627`) | Access: "add paths `/studio`, `/studio/*`, `/api/studio/*` (keep the `/admin` paths)". |
| content-schema §3.3 (`docs/content-schema.md:1327-1329`) | "`content_entries` of kind `page` other than `home` are not read by any public route today and are not imported." |
| content-schema conventions (`docs/content-schema.md:17`) | "Imported rows keep the legacy id (`content_entries.id`…) so… `/admin/content/:versionId` can be mapped. `legacy_source` records the origin". |
| Standing rules (Kevin) | Kamel-only public identity; never invent pricing (strict NT$ and US$260.00 assertions); sample/TODO content never public; Studio is "KAMEL STUDIO" under `/studio` behind Access; exact-pinned deps; lockfile only via `.github/workflows/lockfile.yml`. |

---

## 3. Current state (main @ 6bd682a)

### 3.1 Route table

- `app/routes.ts:15-60`: the Studio root (`routes/studio/root.tsx`, middleware `studioMiddleware`, root.tsx:29)
  with shell and preview branches; `:61-66` the `/api/studio/*` resource routes.
- `app/routes.ts:67-84`: the legacy block, still live:
  `route("admin", "routes/admin/layout.tsx", [index, content, content/:versionId/edit, content/:versionId/preview,
  services, terms, works, links, posts, posts/:versionId/edit, cases, cases/status, cases/student-discount,
  cases/cleanup])`. The comment at `:67-68` says the redirect "replaces the block below once the integration
  package has ported every legacy panel".
- `app/routes.ts:85-114`: `index("routes/language-redirect.tsx")` and the public `:lang` layout with children
  (`works`, `services`, `terms`, `about`, `writing`, `privacy`, `commission/...`, ...).
- Precedent for one module under several ids: `app/routes.ts:108-111` (`other-redirect`, `other-slug-redirect`).

### 3.2 Legacy feature inventory and Studio replacement

| # | Legacy feature (file:line) | Studio replacement | Status |
| --- | --- | --- | --- |
| 1 | Shell, Access guard, CSRF via outlet context, email local part shown in sidebar (`app/routes/admin/layout.tsx:7-18`, `:11`; `app/components/admin/AdminShell.tsx:3-11,21-34`) | `routes/studio/root.tsx:29-42` (middleware + `withOwner` loader, `createStudioSession`), shell nav `app/components/studio/shell/nav.ts:22-71`, account menu "Sign out" (admin-architecture §3.3) | Built (F) |
| 2 | Overview list (`app/routes/admin/index.tsx:1-23`) | `/studio` home (`routes/studio/home.tsx`, P4) | Built |
| 3 | Content versions list + "create draft" for any `entryId/slug/kind/locale` (`app/routes/admin/content-index.tsx:23-53,62-102`) | Projects list/new (`routes/studio/projects/list.tsx:14-15`, `new.tsx:16-17`), Writing list/new (`routes/studio/writing/list.tsx`, `new.tsx:16-18` → `writing.server.ts:268`), Homepage (`routes/studio/homepage.tsx:17-20`) for page `home`. Pages other than `home` are retired on purpose (content-schema.md:1327-1329); their copy lives in Brand/Site settings. Free-form entry ids are retired (Studio generates ids). | Built (P1, P3, P4) |
| 4 | Version editor: title, summary, block list (edit text, reorder, delete, add), SEO title/description, social image URL; intents `save` (409 on `stale_revision`), `publish`, `unpublish` per locale (`app/routes/admin/content-edit.tsx:25-73`; `BlockEditor.tsx:28-155`; `PublishPanel.tsx:4-38`; `lib/admin/block-form.ts:28`) | Project editor `routes/studio/projects/edit.tsx:15-16` → `projects.server.ts:584-670` (`save`, `publish`, `unpublish`, `archive`, `restore`, `duplicate`, `revert`, `delete`, `feature`, `unfeature`, `create-term`); Writing editor `routes/studio/writing/edit.tsx:21-23` → `writing.server.ts:279`; block editor ported to `app/components/studio/blocks/block-editor.tsx:1-7`; 409 stale revision (admin-architecture §4.6). Both locales publish together (content-architecture decision 4). | Built (P1, P3) |
| 5 | Version preview, noindex (`app/routes/admin/content-preview.tsx:7-27`) | `/studio/preview/projects/:id` (`routes/studio/preview/project.tsx:19-26`), `/studio/preview/writing/:id` (`preview/writing.tsx`), embedded in the editors' preview pane | Built (P5) |
| 6 | Works: list, create `work-<slug>` draft, attach external media JSON to a draft with a hard-coded R2 host (`app/routes/admin/works.tsx:24-60`, `:55`; `ExternalMediaFields.tsx:5-64`; `media-content-service.server.ts:64-137`) | Projects list/new/editor MEDIA section (`MediaField`, gallery) + Media library `register-url` (`routes/studio/media/library.tsx:16-18` → `media-library.server.ts:624,633`) | Built (P1, P2) |
| 7 | Posts: list, create `post-<slug>` draft, edit via the shared editor (`app/routes/admin/posts.tsx:22-44`; `post-edit.tsx:1-6`) | Writing list/new/editor | Built (P3) |
| 8 | Link groups: list, replace one group by fixed key `social / workRepository / otherWebsite / footer / postReference`, zh/en labels, `https:`/`mailto:` links (`app/routes/admin/links.tsx:20-41`; `LinkGroupEditor.tsx:5-79`; `media-content-service.server.ts:25-46,90-92,139-229`) | `/studio/settings/footer` (**WP3**) for footer groups; `/studio/social` (`routes/studio/social.tsx:13-15`) for the former `social` group (imported into `social_links` by `0007_cms_legacy_import.sql:274`; the public footer skips `stable_key = 'social'`, `app/lib/cms/public/site.server.ts:307`). The legacy editor writes groups with id `admin-<key>` (`media-content-service.server.ts:145`) and re-creates every link with a new UUID on each save (`:161-178`). As a result, (a) every non-`social` group it created (`workRepository`, `otherWebsite`, `footer`, `postReference`) is rendered by the public footer and must stay editable in WP3's screen, and (b) a `social` edit made after 0007 ran is in `links` but not in `social_links` (§8.1). | WP3 pending; social built (P3) |
| 9 | Prices: list price versions, publish an immutable version (service, base, per-song after five, four bps modifiers, effective from) (`app/routes/admin/services.tsx:22-53,67-113`; `lib/admin/service-catalog-service.server.ts:52,65`) | `/studio/services/pricing` (**WP2**), today a stub (`routes/studio/services/pricing.tsx:1-9`) | WP2 pending |
| 10 | Terms: list term versions, publish an immutable version (document, locale, clauses JSON, effective from, legal-review checkbox required) (`app/routes/admin/terms.tsx:22-55,35-37`; `lib/admin/term-service.server.ts:16,42`) | `/studio/services/terms` (**WP2**), today a stub (`routes/studio/services/terms.tsx:1-9`) | WP2 pending |
| 11 | Cases list: filters `service`, `status`, `cursor`, limit 100; pending student reviews; cleanup due (`app/routes/admin/cases.tsx:17-40`; `CaseTable.tsx:16-105`) | `/studio/commissions` (**WP1**), today a stub (`routes/studio/commissions/list.tsx:1-9`) | WP1 pending |
| 12 | Case status change (`app/routes/admin/case-status.ts:7-18`, form at `CaseTable.tsx:52`) | `POST /studio/commissions/status` (**WP1**), stub returns 501 (`commissions/status.ts:5-10`) | WP1 pending |
| 13 | Student discount accept/reject (`app/routes/admin/student-discount.ts:6-16`, form at `CaseTable.tsx:77-92`) | `POST /studio/commissions/student-discount` (**WP1**), stub (`commissions/student-discount.ts:5-10`) | WP1 pending |
| 14 | Verified cleanup + Apps Script ledger (`app/routes/admin/cleanup-confirm.ts:7-35`; `CleanupChecklist.tsx:1-31`) | `POST /studio/commissions/cleanup` (**WP1**), stub (`commissions/cleanup.ts:5-10`) | WP1 pending |

Nothing else is reachable under `/admin`: `AdminShell.tsx:3-11` lists exactly the seven sections above, and the
route table (`app/routes.ts:69-84`) has no other modules.

### 3.3 Library code and its importers (traced, not guessed)

An import-graph walk over `app/`, `workers/` and `tests/` (entry points: `app/root.tsx`, `workers/app.ts` and every
route file in `app/routes.ts`) gives, with the legacy route files removed:

| Module | Importers today | After WP1-3 + legacy routes removed |
| --- | --- | --- |
| `app/lib/admin/block-form.ts` | `routes/admin/content-edit.tsx` | dead → delete |
| `app/lib/admin/content-service.server.ts` | 5 admin routes, `BlockEditor`, `PublishPanel`, `block-form.ts`; tests `admin-publication`, `admin-media-content` | dead → delete |
| `app/lib/admin/media-content-service.server.ts` | `routes/admin/{links,works}.tsx`; tests `admin-block-form`, `admin-media-content` | media half (`:7-23,48-60,64-88,94-137`) dead; link-group half (`:25-46,62,90-92,139-229`) dead **unless WP3 imports it** (WP3 spec: it does not, `:660-661`) → delete the whole file |
| `app/lib/admin/case-service.server.ts`, `cleanup-service.server.ts` | admin cases routes, `CaseTable`; tests `admin-cases`, `admin-student-discount`, `admin-cleanup` | **kept**: WP1's Studio routes import them (content-architecture.md:795-796 "reusing … unchanged") |
| `app/lib/admin/service-catalog-service.server.ts`, `term-service.server.ts` | `routes/admin/{services,terms}.tsx`; test `admin-pricing-terms` | **kept, unchanged by WP5**: WP2 imports `publishPriceVersion` only (WP2 §4.17); `listPriceVersions`, `listTermVersions`, `publishTermVersion` keep only the legacy test after the flip and are removed by wp7 (plan §9 C3 b) |
| `app/lib/auth/admin.server.ts` | 13 admin routes (`requireAdmin`, `requireAdminMutation`); `app/lib/cms/studio/auth.server.ts:27-30` (`assertMutationMethod`, `verifyMutationToken`); test `admin-guard` | `requireAdmin*` dead (`requireAdminMutationWithToken`, `:71-81`, already has no caller); the two helpers stay for the Studio guard |
| `app/lib/db/content-repository.server.ts` | type import in `lib/admin/content-service.server.ts:6` and `routes/admin/content-index.tsx:20`; value imports in `lib/content/public-content.server.ts:5-10` (legacy half only); tests | dead once the public-content legacy half goes → delete |
| `app/lib/media/media-repository.server.ts` | **no app importer today** (already unreachable); test `media-repository` | delete |
| `app/lib/content/public-content.server.ts` | `routes/public/{terms,privacy}.tsx` and `tests/worker/admin-pricing-terms.test.ts:5` use only `listPublishedTerms` (`:65-99`) | trim `:5-10` (content-repository import), `:12` (block-schema import), `:14-16` (`PublicContent`), `:36-63` (legacy content reads). **Keep** `:1-4` (`parseTermClauses`/`TermClause` from terms-repository) and `:11` (`Locale`, used by `PublishedTerm`) |
| `app/lib/integrations/google-submission-gateway.server.ts` `cleanupGoogleLedger` (`:83`), `app/lib/cases/retention.server.ts` `listCleanupDue` (`:54`), `app/lib/admin/case-service.server.ts` `listCases`/`updateCaseStatus`/`listPendingStudentPriceReviews`/`resolveStudentDiscount`, `cleanup-service.server.ts` `confirmVerifiedCleanup` | **only** `routes/admin/{cases,case-status,student-discount,cleanup-confirm}.ts*` in `app/` today (the Studio has no importer yet; `attention.server.ts` does not use them) | kept, and must be imported by WP1's `app/lib/cms/repositories/commissions.server.ts` before WP5 deletes the legacy routes, otherwise case operations become unreachable (capability gate, §4.1) |
| `app/lib/admin/service-catalog-service.server.ts` `listPriceVersions`/`publishPriceVersion`, `term-service.server.ts` `listTermVersions`/`publishTermVersion` | only `routes/admin/{services,terms}.tsx` in `app/` today | kept unchanged. WP2 must import `publishPriceVersion` (capability gate, §4.1); the price and term capabilities are otherwise proven by WP2's own Studio handlers (second gate command), since WP2 replaces the other three with its own repositories (WP2 §4.17, plan §2.2) |
| `app/components/content/block-renderer.tsx` | also `components/content/writing-entries.tsx`, `components/work/project-page.tsx` | kept |
| `app/lib/services/catalog.ts` `name` field (`:18-22`, `@deprecated` "for the legacy `/admin` screens only… removed together with `app/routes/admin/**`") | only `routes/admin/services.tsx:79,117` | dead → remove **unless WP2 reads it** (WP2 §4.12: it does not) |
| `app/components/studio/shell/stub-panel.tsx` (`StubPanel` `:7-40`, `PreviewStub` `:43-63`) | `StubPanel`: the four stubs in 3.2 rows 9-11 + footer; `PreviewStub`: none | dead after WP1-3 → delete |

Pre-existing unreachable files that are **not** admin-related and stay out of scope: `app/lib/commission/steps.ts`,
`app/lib/pricing/post-quote-fees.ts`.

### 3.4 Styles

- `app/root.tsx:20` imports `./styles/admin.css?url`; `app/root.tsx:53` adds it to `links()`, so **every public
  and Studio page downloads the admin stylesheet** today.
- `app/styles/admin.css` (229 lines) is fully scoped: `.admin-*`, `.case-table`, `.cleanup-checklist`,
  `.publish-panel` (including the `@media (max-width: 800px)` block at `:205-229`). No public or Studio markup
  uses these classes (grep: only `app/components/admin/**` and `app/routes/admin/**`). Removing it changes no
  public pixel.
- `.content-detail-page*` selectors in `app/styles/legacy.css:98,109,132,379,387,414-425` have one consumer:
  `app/routes/admin/content-preview.tsx:21`.

### 3.5 The redirect module as created by F, and two defects

`app/routes/admin-legacy-redirect.ts:1-81` exists, unwired: static target table `:14-26`, version path regex
`:28-29`, D1 lookup `:32-62`, loader `:64-72` (`requireOwner` then 301 + `no-store`), action `:74-81`
(`requireOwner` then 410).

1. **Route ranking (blocking).** Simulated with `react-router@8.3.0` `matchRoutes` against the real route config:
   with only `admin` + `admin/*` registered (admin-architecture §2.1 as written), `/admin/services`,
   `/admin/terms` and `/admin/works` match the public `:lang/services`, `:lang/terms` and `:lang/works`
   routes (score 15 vs 10 for the splat), so they would render the public 404 instead of redirecting.
   `/admin/links`, `/admin/posts`, `/admin/cases*`, `/admin/content*` do reach the splat. Registering each
   legacy path as its own static route (`admin/works` scores 22) fixes all fourteen. Verified result:

   | Path | Splat-only config (doc) | Explicit static routes (this spec) |
   | --- | --- | --- |
   | `/admin`, `/admin/` | redirect | redirect |
   | `/admin/services`, `/admin/terms`, `/admin/works` | **public `:lang` 404** | redirect |
   | `/admin/content`, `/admin/links`, `/admin/posts`, `/admin/cases`, `.../status`, `.../student-discount`, `.../cleanup`, version paths | redirect | redirect |
   | `/admin/unknown`, `/admin/a/b/c` | redirect (splat) | redirect (splat) |
   | `/admin/about`, `/admin/writing`, `/admin/privacy`, `/admin/works/x` (never legacy) | public 404 | public 404 (residual, §9 R6) |

2. **Version lookup trusts the legacy id.** `:47-50` maps a work/post entry to `/studio/projects/<entry id>` /
   `/studio/writing/<entry id>`. That is right for rows imported by `0007` (projects/writings keep the legacy id
   and set `legacy_source = 'content_entries:<id>'`, `migrations/0007_cms_legacy_import.sql:57-76,151-170`), but
   an entry created in `/admin` after 0007 ran, or a Studio row deleted since, lands on a Studio 404. A D1 error
   (for example after a future migration drops the legacy tables) currently throws a 500.

Also: the action answers 410 with the request body unread; `app/lib/cms/studio/auth.server.ts:46-71` documents
that answering with an unread body drops the local runtime's connection under `wrangler dev` / the Vite dev server.

### 3.6 Tests that touch `/admin` or legacy code

| File:line | What it asserts / imports |
| --- | --- |
| `tests/e2e/final-acceptance.spec.ts:12,122-124` | `GET /admin` → 403 + `no-store` (loopback, no Access identity) |
| `tests/e2e/security-headers.spec.ts:25-35` | `GET /admin` → 403 + `no-store` |
| `tests/e2e/studio-access.spec.ts:5-29,46-49` | Studio paths → 403 + `no-store` + `X-Robots-Tag`; `POST /studio/commissions/status` → 403 |
| `tests/unit/studio-route-guards.test.ts:110-116` | "keeps the legacy /admin panels routed until the integration flip" (`/admin` registered, redirect not registered) |
| `tests/unit/studio-shell.test.tsx:68-77` | `StubPanel` renders `href="/admin/works"` |
| `tests/unit/security-headers.test.ts:57` | `requiresNoStore("/admin/content", 200)` is true |
| `tests/unit/admin-block-form.test.ts:1-79` | `parseAdminMediaInput` (`:9-66`), `parseAdminLinkGroup` (`:68-78`) |
| `tests/worker/admin-guard.test.ts:1-62` | `requireAdmin`, `requireAdminMutation` |
| `tests/worker/admin-publication.test.ts` | legacy content-service publication |
| `tests/worker/admin-media-content.test.ts:17-67` | legacy `replaceDraftMedia`; `:69-96` footer composition via `replaceLinkGroup` + `getPublicSiteContext` (>3 links shown, legacy `social` group skipped) |
| `tests/worker/content-repository.test.ts:21-114` | legacy content triggers; **`:115-…` "rejects a term publication pointer with a mismatched version tuple" covers live `term_publications`** |
| `tests/worker/media-repository.test.ts` | legacy `listMediaForVersion` |
| `tests/worker/public-content.test.ts:28-48` | **`listPublishedTerms` (live)**; `:50-…` legacy `listPublishedContent` |
| `tests/worker/admin-{cases,student-discount,cleanup,pricing-terms}.test.ts` | the four kept services (stay) |
| `tests/worker/access-jwt.test.ts:11`, `tests/worker/csrf.test.ts:12` | `/admin` only as a URL string / test name (no behaviour; unchanged) |
| `tests/unit/commission-retention-policy.test.ts` (added by WP1, WP1 spec §7.1 "Subset rule") | allowlists `app/routes/admin/cleanup-confirm.ts` as a `confirmVerifiedCleanup` referrer (subset rule) |
| `tests/worker/cms-public-read.test.ts:67-125` | footer composition from settings and `social_links` (kept; fallback home for the ported footer cases, §5) |

### 3.7 Docs and runbooks that describe `/admin`

`README.md:3,11`; `docs/admin-architecture.md:84-86,88-89,119-120,138-160,205,251-254,292,597`;
`docs/content-architecture.md:141-142,626` (decision rows, Access paths);
`docs/information-architecture.md:18-19,58,68`; `docs/design-system.md:29,579-591` (§6.25 "Admin, token-only
pass"); `docs/content-schema.md:300` ("the existing `/admin/services` flow"); `docs/runbooks/cloudflare-setup.md:54-58`
(Access paths list has no `/studio` yet), `:117`; `docs/runbooks/google-setup.md:62` ("回 `/admin/cases`");
`docs/runbooks/release-checklist.md:19`. Historical plans/specs under `docs/superpowers/` stay as records
(content-architecture.md:563).

Public copy check: `app/routes/public/privacy.tsx:78` and `terms.tsx:91` say "…會從後台發布…" ("will publish from the
back office"). Generic, still true for the Studio; no change.

---

## 4. Design

### 4.1 Preconditions and the WP1-3 contract

WP5 starts only when WP1, WP2 and WP3 are merged into the branch. Before deleting anything, the implementer checks
this contract and records the result in the PR description:

| From | WP5 needs | Check |
| --- | --- | --- |
| WP1 | `/studio/commissions` list reads the same query names as the legacy list (`service`, `status`, `cursor`) because the redirect forwards `/admin/cases?…` verbatim; resource routes `/studio/commissions/{status,student-discount,cleanup}` use `withOwnerMutation`; no import from `app/components/admin/**`, `app/routes/admin/**`; styles in `app/styles/studio/*` (no reliance on `.case-table` / `.cleanup-checklist` from `admin.css`) | grep + open `/studio/commissions?status=pending_review` in the Studio e2e harness. If WP1 renamed the params, WP5 maps them in `staticLegacyAdminTarget` (§4.5). |
| WP2 | `/studio/services/pricing` publishes through `publishPriceVersion`, and the Pricing/Terms route modules call WP2's own loaders and handlers (`loadPricingIndex`, `loadPriceEditor`, `handlePriceEditorAction`, `loadTermsIndex`, `loadTermEditor`, `handleTermEditorAction`; WP2 §4.17 replaces `listPriceVersions`, `listTermVersions` and `publishTermVersion`); whether it reads `SERVICE_CATALOG[*].name` | the amended capability gate below; grep `\.name\b` on catalog entries. |
| WP3 | `/studio/settings/footer` built; whether it imports anything from `app/lib/admin/media-content-service.server.ts`; it lists and edits **every** `link_groups` row with `stable_key <> 'social'`, including groups created by the legacy editor with id `admin-<key>` (`workRepository`, `otherWebsite`, `footer`, `postReference`), so no public footer group becomes uneditable after the flip; whether its tests cover "more than three footer links render" and "legacy `social` group is not a footer group" (today `admin-media-content.test.ts:69-96`, `admin-block-form.test.ts:68-78`) | grep + read WP3's test files; in the Studio e2e harness insert an `admin-footer` group with plain SQL and check that it appears in Studio → Footer. |
| all | No route still renders `StubPanel`; no Studio copy says "legacy admin" or links to `/admin` | grep. |
| all | **Capability gate.** Every legacy operation has a Studio caller before its legacy caller is deleted | The two capability-gate commands below list each of their names at least once. A write path to `link_groups`/`links`/`link_group_labels` exists outside `app/lib/admin/media-content-service.server.ts`, or WP3 imports `replaceLinkGroup` from it. A missing name blocks WP5. |

Already confirmed for WP1 by its spec (`docs/superpowers/specs/2026-10-13-wp1-commissions.md`; cited by section
because its line numbers moved during review): list query `?status&service&cursor` (§4.1, §4.3
`parseCommissionQuery`), so `/admin/cases?…` forwards unchanged; `case`/`cleanup` services reused unchanged (§2.1);
styles in `app/styles/studio/commissions.css` (§4.10); the Studio must not use `SERVICE_CATALOG[].name` (§3.2);
`studio-access.spec.ts` extended with commissions paths (§5.2, §7.3); its
cleanup gateway factory reproduces the `cleanupGoogleLedger` closure of `admin/cleanup-confirm.ts:22-31` (WP1 §4.4),
which satisfies the capability gate for `cleanupGoogleLedger`; it edits `google-setup.md:62` and
`release-checklist.md:19` (WP1 §5.2 and §12), which WP5 reconciles (§5). WP1 adds no migration (WP1 §6; plan §2.1).

Confirmed for WP2 by `docs/superpowers/specs/2026-10-13-wp2-pricing-terms.md`:

- WP2 never reads `SERVICE_CATALOG[].name` (§4.12, `:672-683`), so WP5 removes it.
- Only `publishPriceVersion` is reused (WP2 §4.17). `listPriceVersions`, `listTermVersions` and `publishTermVersion`
  are replaced by WP2's own repositories and keep only their legacy test after the flip. The capability gate below is
  therefore the plan's amended gate (plan §2.2): `publishPriceVersion` plus WP2's six Studio loaders/handlers. WP5
  leaves the three legacy-only functions unchanged; wp7 removes them (plan §9 C3 b).
- WP2 **modifies** `publishPriceVersion` (metadata row in the same batch, `:369-372`).
- WP2 changes `listPublishedTerms` **in place**, adding an `at` parameter and an `effective_from <= ?` filter
  (`:532-536`, `:786`). WP5's trim of `public-content.server.ts` therefore goes by symbol, not by the main-branch line
  numbers.
- WP2 adds `migrations/0009_pricing_terms_studio.sql` (`:897`).
- WP2 leaves `StubPanel` and the legacy screens to WP5 (`:806-809`).

Confirmed for WP3 by `docs/superpowers/specs/2026-10-13-wp3-footer.md`:

- WP3 does not import `app/lib/admin/media-content-service.server.ts`, and leaves the legacy writer to WP5
  (`:660-661`). WP5 deletes the whole file.
- The footer loader reads every `link_groups` row with `stable_key <> 'social'` (`:469`), so `admin-<key>` groups
  stay editable.
- WP3's worker tests already cover "`admin-footer` with 8 links renders all 8" and "`admin-social` is not a footer
  group" (`:757-759`). The fallback port into `cms-public-read.test.ts` (§5) is therefore expected to be unneeded.
- WP3 adds `migrations/0010_cms_footer_groups.sql` (fixed number, plan §2.1; WP3 §7).

The implementer still runs the contract checks against the merged code. Sibling-spec line numbers above are as of
this review (2026-10-13) and may move as those specs are revised.

**Capability gate** (run before deleting anything; every name of both commands must appear at least once). This is
the integration plan's amended gate (plan §2.2); the earlier single command that also required `listPriceVersions`,
`listTermVersions` and `publishTermVersion` would have blocked WP5 forever, because WP2 does not call them:

```sh
git grep -nwE "listCases|updateCaseStatus|listPendingStudentPriceReviews|resolveStudentDiscount|confirmVerifiedCleanup|cleanupGoogleLedger|listCleanupDue|publishPriceVersion" \
  -- app ":(exclude)app/routes/admin" ":(exclude)app/lib/admin" \
  ":(exclude)app/lib/cases/retention.server.ts" ":(exclude)app/lib/integrations"
git grep -nwE "loadPricingIndex|loadPriceEditor|handlePriceEditorAction|loadTermsIndex|loadTermEditor|handleTermEditorAction" \
  -- app/routes/studio/services
```

**Dead-code gate.** Run it before and after the deletions. It uses `git grep`, which every checkout has; `rg` is
not guaranteed on the Windows dev machine. After the deletions it must print nothing:

```sh
git grep -nE "routes/admin/|components/admin/|lib/admin/(block-form|content-service|media-content-service)|lib/db/content-repository|lib/media/media-repository|auth/admin\.server|stub-panel|admin\.css|requireAdmin" \
  -- app workers tests \
  ":(exclude)tests/unit/admin-retirement-audit.test.ts" ":(exclude)tests/unit/admin-legacy-routes.test.ts" \
  ":(exclude)tests/unit/studio-route-guards.test.ts"
```

The three excluded tests name the deleted paths on purpose, as negative assertions. Two known hits are cleaned up
by WP5:

- WP1's `tests/unit/commission-retention-policy.test.ts` allowlists `app/routes/admin/cleanup-confirm.ts` (WP1 spec §7.1
  "Subset rule"). That entry is removed. The rule is a subset rule, so it stays green either way, but the gate would
  flag it.
- The `app/components/studio/blocks/block-editor.tsx:3-4` comment (§4.7).

Any other hit inside a WP1-3 file is edited out the same way and listed in the PR. If
`media-content-service.server.ts` survives (WP3 imports it), drop `media-content-service` from the pattern and check
by hand that only WP3 imports it.

**Release gate (content-architecture §7).** The WP5 PR is **not merged to `main`** until the gate is met. Production
deploys whatever `main` holds, so a merged-but-undeployed flip would ship with the next unrelated deploy. The gate:

1. Production already runs a build that contains WP1-3, with the legacy `/admin` still live.
2. Kevin has added the Studio paths to the **existing** production Access application. He does not create a new
   one, because `ACCESS_AUD` is per application and a second application would 403 every Studio request. The paths
   are `/studio`, `/studio/*`, `/api/studio/*` and `/studio.data` (see below).
3. Kevin has confirmed in production that `/studio`, `/studio/commissions`, `/studio/services/pricing`,
   `/studio/services/terms` and `/studio/settings/footer` load behind Access, and that clicking **Home** in the
   Studio sidebar from another Studio page renders the Studio home, not "Sign in to open the Studio".

Until then the previous deployment (legacy `/admin` live) stays in production.

Why `/studio.data`: React Router 8 client navigations fetch `<path>.data`. For the Studio home that is
`/studio.data` (`singleFetchUrl`, `node_modules/react-router/dist/development/lib/dom/ssr/single-fetch.js:228-232`).
Cloudflare documents that a wildcard path does not cover its parent, so `/studio/*` does not match it. Whether a
bare `/studio` path covers the sibling `/studio.data` is not documented. Without the header Access injects, the
Worker answers 403 (fail closed), and every client-side navigation to the Studio home breaks. Listing the path
explicitly costs nothing. Every other Studio data URL (`/studio/<x>.data`, `/studio/_.data`) is under `/studio/*`.

### 4.2 Data flow after the flip

```
Browser ─▶ Cloudflare Access (app paths still include /admin, /admin/*) ─▶ Worker workers/app.ts
   └▶ React Router match: explicit legacy route or admin/* splat ─▶ routes/admin-legacy-redirect.ts
        ├─ withOwner → requireOwner (Access JWT, iss/aud/type/email; dev owner only under Vite DEV)
        │     └─ failure: thrown Response 403 "Forbidden" (body drained), nothing read from D1
        ├─ GET/HEAD: legacyAdminTarget(db, url)
        │     ├─ version path → one D1 query content_versions ⋈ content_entries ⋈ projects/writings(legacy_source)
        │     ├─ static path → table (admin-architecture §2.3), /admin/cases keeps ?query
        │     └─ anything else / lookup error → "/studio"
        │   → 301 Location: <studio path>, Cache-Control: no-store, X-Robots-Tag: noindex, nofollow
        └─ POST/PUT/PATCH/DELETE: discardRequestBody → 410 "Gone", no-store, noindex
workers/app.ts then adds the public CSP set (securitySurface("/admin") = "public") and, because
requiresNoStore() covers /admin (headers.server.ts:78-79) and every status ≥ 400, no-store again.
```

The redirect never reads the request body, never checks CSRF (it changes nothing), and never echoes the
version id into logs.

### 4.3 Route table after the flip (`app/routes.ts`)

Replace `app/routes.ts:67-84` with:

```ts
  // Legacy /admin, retired (docs/admin-architecture.md §2.3). Every former admin
  // URL is owner-checked, then GET/HEAD → 301 to its Studio equivalent and any
  // other method → 410. The legacy paths are registered one by one: a lone
  // `admin/*` splat ranks below the public `:lang/<child>` routes, so
  // /admin/services, /admin/terms and /admin/works would otherwise reach the
  // public layout (404) instead of the redirect.
  ...[
    "admin",
    "admin/content",
    "admin/content/:versionId/edit",
    "admin/content/:versionId/preview",
    "admin/services",
    "admin/terms",
    "admin/works",
    "admin/links",
    "admin/posts",
    "admin/posts/:versionId/edit",
    "admin/cases",
    "admin/cases/status",
    "admin/cases/student-discount",
    "admin/cases/cleanup",
  ].map((path) =>
    route(path, "routes/admin-legacy-redirect.ts", {
      id: `legacy-${path.replace(/[/:]+/g, "-")}`,
    }),
  ),
  route("admin/*", "routes/admin-legacy-redirect.ts", {
    id: "legacy-admin-splat",
  }),
```

Ids come out as `legacy-admin`, `legacy-admin-content`, `legacy-admin-content-versionId-edit`, …,
`legacy-admin-splat` (unique, `[a-z0-9-]` plus camel case). React Router typegen supports one file under several
ids (`fileToRoutes` map in `@react-router/dev` 8.3.0; precedent `app/routes.ts:108-111`). The block stays before
`index("routes/language-redirect.tsx")` for readability; ranking, not order, decides matches.

Re-verified in review with `react-router@8.3.0` `matchRoutes` against the real `app/routes.ts` and this block
spliced in. All fourteen paths, trailing-slash variants and the splat cases reach the redirect. React Router
matching is **case-insensitive** (no `caseSensitive` on these routes), so `/ADMIN/Works` and `/Admin/Cases` also
reach it, through the `legacy-admin-works` and `legacy-admin-cases` ids. The pure helpers must therefore match
case-insensitively (§4.5), or those URLs fall through to `/studio`.

### 4.4 Redirect module (`app/routes/admin-legacy-redirect.ts`, rewritten)

Behaviour table (owner present). Without an owner every row answers **403** (`text/plain` "Forbidden", body
drained, `no-store`, no `Location`).

| Legacy path | GET / HEAD | Other methods |
| --- | --- | --- |
| `/admin`, `/admin/` | 301 `/studio` | 410 |
| `/admin/content` | 301 `/studio` | 410 |
| `/admin/content/:versionId/edit`, `/admin/content/:versionId/preview`, `/admin/posts/:versionId/edit` | entry `work` with a Studio row → `/studio/projects/:projectId`; `work` without → `/studio/projects`; `post` with a row → `/studio/writing/:writingId`; `post` without → `/studio/writing`; `page` `home` → `/studio/homepage`; other page, unknown version, malformed id, D1 error → `/studio` | 410 |
| `/admin/works` | `/studio/projects` | 410 |
| `/admin/posts` | `/studio/writing` | 410 |
| `/admin/services` | `/studio/services/pricing` | 410 |
| `/admin/terms` | `/studio/services/terms` | 410 |
| `/admin/links` | `/studio/settings/footer` | 410 |
| `/admin/cases`, `/admin/cases/status`, `/admin/cases/student-discount`, `/admin/cases/cleanup` | `/studio/commissions` + the original `?query` | 410 |
| any other `/admin/...` reaching the splat | `/studio` | 410 |

Every 301/410 carries `Cache-Control: no-store` (browsers must not cache the permanent redirect) and
`X-Robots-Tag: noindex, nofollow`. HEAD runs the loader (React Router treats HEAD as a non-mutation,
`node_modules/react-router/dist/development/lib/router/router.js:1585`); the runtime drops the body.

"Other methods" means React Router's mutation methods: POST, PUT, PATCH and DELETE (`router.js:16-22`) reach the
action. `OPTIONS` is not a mutation, so it runs the loader like GET: owner check, then 301. Any other verb
(`PROPFIND` and so on) is answered 405 by the router before any route code runs, so nothing is read and no owner
is needed.

Matching is case-insensitive (§4.3). `/ADMIN/Works` → `/studio/projects`, and `/Admin/Cases?status=paused` →
`/studio/commissions?status=paused`. `requiresNoStore()` compares `/admin` case-sensitively, which is why the
module sets `no-store` itself.

Module shape:

```ts
import {
  type LegacyEntryRow, legacyEntryTarget, legacyVersionId, staticLegacyAdminTarget,
} from "../lib/cms/studio/legacy-admin";
import { discardRequestBody, withOwner } from "../lib/cms/studio/auth.server";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

const LOOKUP_SQL = `SELECT e.kind, e.slug,
    (SELECT p.id FROM projects p WHERE p.legacy_source = 'content_entries:' || e.id) AS project_id,
    (SELECT w.id FROM writings w WHERE w.legacy_source = 'content_entries:' || e.id) AS writing_id
  FROM content_versions v JOIN content_entries e ON e.id = v.entry_id
  WHERE v.id = ?`;

/** Studio path for a retired /admin URL; never throws. */
export async function legacyAdminTarget(db: D1Database, url: URL): Promise<string> {
  const versionId = legacyVersionId(url.pathname);
  if (versionId === undefined) return staticLegacyAdminTarget(url) ?? "/studio";
  if (versionId === null) return "/studio";               // malformed or overlong id
  try {
    return legacyEntryTarget(
      await db.prepare(LOOKUP_SQL).bind(versionId).first<LegacyEntryRow>(),
    );
  } catch {
    console.warn("legacy_admin_lookup_failed");             // no id, no URL in the log
    return "/studio";
  }
}

export const loader = withOwner(async ({ db, request }) =>
  new Response(null, {
    status: 301,
    headers: { Location: await legacyAdminTarget(db, new URL(request.url)), ...HEADERS },
  }),
);

export const action = withOwner(async ({ request }) => {
  await discardRequestBody(request);
  return new Response("Gone", { status: 410, headers: HEADERS });
});
```

Why `withOwner` for both exports: it reuses the Studio identity path (`ownerContext` → `requireOwner`,
`app/lib/cms/studio/auth.server.ts:168-184`), so worker tests can inject an owner through the router context
exactly like `tests/worker/studio-auth.test.ts:46-56`, and the static guard audit can check it. The action
deliberately skips CSRF (`withOwnerMutation` would turn a stale legacy form with an expired token into 403 instead
of the specified 410; no state changes here). `legacy_source` is `UNIQUE` on both tables
(`migrations/0005_cms_schema.sql:138` projects, `:286` writings), so each sub-select returns at most one row.

### 4.5 Pure helpers (`app/lib/cms/studio/legacy-admin.ts`, new, no server imports)

Kept pure so node unit tests can import it without the Worker runtime:

- `STATIC_LEGACY_TARGETS` — the targets from `admin-legacy-redirect.ts:14-26`, unchanged
  (`/^\/admin\/?$/i` → `/studio`, … `cases(\/(status|student-discount|cleanup))?` → `/studio/commissions`). Every
  pattern carries the **`i` flag**, because React Router matches routes case-insensitively (§4.3).
- `staticLegacyAdminTarget(url: URL): string | null` — first matching pattern; appends `url.search` only for
  `/studio/commissions` (today's rule, `:56-58`); `null` when nothing matches. If WP1 chose different query names,
  this is the one place that maps them.
- `legacyVersionId(pathname: string): string | null | undefined` — `undefined` when the path is not a version path
  (regex `:28-29`, with the `i` flag); otherwise the `decodeURIComponent`d id, or `null` when decoding throws or the
  id is longer than 128 characters.
- `type LegacyEntryRow = { kind: string; slug: string; project_id: string | null; writing_id: string | null }`.
- `legacyEntryTarget(row: LegacyEntryRow | null): string` — the mapping in §4.4 (ids passed through
  `encodeURIComponent`).

The module needs no `/admin` string literal (regex literals only). It stays on the audit's allowlist (§6.1) anyway,
so a future test-friendly constant does not break the audit.

### 4.6 Auth helpers

- `git mv app/lib/auth/admin.server.ts app/lib/auth/mutation-guard.server.ts`; keep `MUTATION_METHODS`,
  `assertMutationMethod` (`:19-23`) and `verifyMutationToken` (`:31-50`) byte-for-byte; delete `requireAdmin`
  (`:11-17`), `requireAdminMutation` (`:52-68`), `requireAdminMutationWithToken` (`:71-81`). Then drop the imports
  that only they used: `JwtVerifier` and `verifyAccessRequest` from `./access-jwt.server`. `biome.json` sets
  `noUnusedImports: "error"`, so `npm run check` fails otherwise. The file keeps `Env`, `type AdminIdentity` and
  `verifyCsrfToken`. Update the import in
  `app/lib/cms/studio/auth.server.ts:27-30`. `AdminIdentity` in `access-jwt.server.ts` keeps its name (it is the
  Studio's `OwnerIdentity` alias, `auth.server.ts:36`); renaming it is churn without benefit.
- Extract the body-discard logic of `refusing()` (`auth.server.ts:53-71`) into an exported
  `discardRequestBody(request: Request): Promise<void>` (drain ≤ 1 MiB with a finite `Content-Length`, otherwise
  cancel; swallow errors; no-op when there is no body or it was used). `refusing()` calls it; behaviour of every
  Studio guard is unchanged (covered by `studio-auth.test.ts` "discards the body of every refused request").

### 4.7 Deletions

All deletions are `git rm`; nothing is commented out.

- **Routes:** the fifteen files in `app/routes/admin/` (case-status, cases, cleanup-confirm, content-edit,
  content-index, content-preview, index, layout, links, post-edit, posts, services, student-discount, terms,
  works).
- **Components:** the seven files in `app/components/admin/` (AdminShell, BlockEditor, CaseTable,
  CleanupChecklist, ExternalMediaFields, LinkGroupEditor, PublishPanel).
- **Styles:** `app/styles/admin.css`; `app/root.tsx:20` (import) and `:53` (`links` entry). The
  `.content-detail-page` selectors in `app/styles/legacy.css` (`:98`, `:109`, `:132`, `:379`, `:387`, the
  `.content-detail-page__back` member at `:415` and the rule at `:422-425`); every other selector in those grouped
  rules stays.
- **Library:** `app/lib/admin/block-form.ts`, `app/lib/admin/content-service.server.ts`,
  `app/lib/db/content-repository.server.ts` (directory becomes empty), `app/lib/media/media-repository.server.ts`;
  `app/lib/content/public-content.server.ts` loses `PublicContent`, `parseBlocks`, `toPublicContent`,
  `listPublishedContent`, `getPublicContent` and the imports of `content-repository` and `block-schema`. On main
  these are `:5-10`, `:12`, `:14-16` and `:36-63`. WP2 edits `listPublishedTerms` in place first, so remove them by
  symbol. Keep the `terms-repository` import at `:1-4` and the `Locale`
  import at `:11`, which `PublishedTerm` and `listPublishedTerms` still use. `listPublishedTerms` and
  `PublishedTerm` stay. The file name is unchanged, so `routes/public/terms.tsx:18`, `privacy.tsx:17` and
  `tests/worker/admin-pricing-terms.test.ts:5` need no edit.
- **`app/lib/admin/media-content-service.server.ts`:** delete the file. WP3's spec does not import it (`:660-661`).
  Only if the merged WP3 code does import the link-group functions after all, delete just the media half
  (`OptionalText`, `OptionalHttpsUrl`, `AdminMediaInputSchema`, `ParsedAdminMediaInput`, `parseAdminMediaInput`,
  `replaceDraftMedia`, and the `MediaKind` / `parseMediaUrl` imports) and leave the rest to WP3.
- **`SERVICE_CATALOG.name`:** remove the `name` property from `ServiceDefinition`
  (`app/lib/services/catalog.ts:18-22`) and the four `name:` lines (`:30,36,42,48`). WP2 guarantees it does not read
  them (WP2 §4.12). With `name` and `media-content-service.server.ts` gone, `LocalizedText` (`catalog.ts:3-6`) has no
  user left. Remove it as well once no file imports `LocalizedText` from `services/catalog`. Check with
  `git grep -n "LocalizedText" -- app tests`. Other modules define their own `LocalizedText` types (for example
  under `app/lib/cms/`), and those stay. If the merged WP2 code reads `name` after all, keep it and rewrite the JSDoc to "Internal
  label for Studio operations screens (never rendered publicly)".
- **Stub panel:** `app/components/studio/shell/stub-panel.tsx` once the dead-code gate shows no importer.
  `.studio-stub*` rules in `app/styles/studio/base.css:1182-1208` stay (the Studio root `ErrorBoundary` uses them,
  `routes/studio/root.tsx:92-96`).
- **Comment:** `app/components/studio/blocks/block-editor.tsx:3-4` → "Ported from the retired /admin block editor
  and extended…". The path it names now no longer exists. The new wording is chosen to pass the audits: no
  `components/admin/` path (dead-code gate), and no backtick- or quote-wrapped `/admin` (literal check).

### 4.8 Kept on purpose

- `app/lib/admin/{case-service,cleanup-service,service-catalog-service,term-service}.server.ts` and their worker
  tests (consumed by WP1/WP2).
- `requiresNoStore()` `/admin` clauses (`app/lib/security/headers.server.ts:78-79`) and
  `securitySurface()` unchanged (`/admin` stays "public" surface; the module adds `X-Robots-Tag` itself).
- Access application paths `/admin`, `/admin/*` (the redirect is owner-gated, and Access keeps the 403 at the edge;
  admin-architecture §2.3 "Access keeps protecting `/admin` paths"). `/api/admin/*` stays in the list; no route
  serves it.
- Legacy D1 tables and every existing migration (`0001`–`0010`: WP2's `0009`, WP3's `0010`), untouched; the redirect is their only remaining runtime reader besides
  `link_groups`/`links`/`link_group_labels` for the footer (`site.server.ts:296-312`).
- `TEST_ADMIN_BYPASS` handling in `scripts/run-loopback-e2e.mjs:63` and `scripts/verify-production-config.mjs:230`.

### 4.9 Copy, accessibility, brand, pricing

- **Bilingual copy:** none added. The redirect has no UI; bodies are empty (301), "Gone" (410) and "Forbidden"
  (403), owner-only, English like the Studio chrome. Public pages are untouched.
- **Accessibility:** no new UI. After WP1-3 and WP5 the Studio sidebar's Operations items (`nav.ts:63-70`) open
  real screens, and no Studio screen renders an "Open the legacy admin" link (`stub-panel.tsx:10,28-36`). Removing
  `admin.css` from the global `links()` stops every public page from downloading an unused stylesheet.
- **Brand:** deleting `app/routes/admin/layout.tsx:11` removes the private sidebar display of the owner email's
  local part (content-architecture.md:560) and the "KAMEL / ADMIN" eyebrow. Redirect responses contain no name
  variant. `tests/unit/brand-audit.test.ts` and `tests/e2e/brand.spec.ts` must stay green unchanged.
- **Pricing:** WP5 changes no price data or price code path. `price_versions`, `publishPriceVersion` and the
  wizard are untouched; the strict NT$ and US$260.00 assertions in `tests/e2e/final-acceptance.spec.ts`,
  `service-currency.spec.ts` and the commission specs must pass unchanged. The legacy form defaults
  (`app/routes/admin/services.tsx:94-106`: 3000/5000/5000/500 bps) are not a price source; the active
  `price_versions` rows hold the real values, and WP2 owns any pre-fill.
- **Sample content:** untouched; no `TODO_CONTENT` path is involved.

### 4.10 Error states

| Situation | Response |
| --- | --- |
| No Access header / bad JWT / wrong email (loopback, direct Worker hit) | 403 `Forbidden`, `no-store`, body drained, no D1 read |
| Owner, GET legacy static path | 301 to the table target |
| Owner, GET version path, row found | 301 to the editor or list per §4.4 |
| Owner, GET version path, unknown id / malformed `%` / id > 128 chars | 301 `/studio` |
| Owner, GET version path, D1 throws (for example legacy tables dropped later) | 301 `/studio`, `console.warn("legacy_admin_lookup_failed")` |
| Owner, POST/PUT/PATCH/DELETE (stale legacy form or bookmark) | 410 `Gone` |
| Owner, `OPTIONS` | loader path: 301 like GET |
| Any client, non-standard verb | 405 from React Router before any route code (no D1 read) |
| Owner, mixed-case path (`/Admin/Cases?status=paused`) | 301 to the same target as the lower-case path |
| `/admin/<public child>` that was never a legacy URL | public 404 page (residual, §9 R6) |

---

## 5. File plan

### Create

| Path | Purpose |
| --- | --- |
| `app/lib/cms/studio/legacy-admin.ts` | Pure mapping helpers (§4.5) |
| `app/lib/auth/mutation-guard.server.ts` | `git mv` of `app/lib/auth/admin.server.ts`, trimmed (§4.6) |
| `tests/unit/admin-legacy-routes.test.ts` | Route matching + pure mapping (§6.1) |
| `tests/unit/admin-retirement-audit.test.ts` | Static "nothing legacy left" audit (§6.1) |
| `tests/worker/admin-legacy-redirect.test.ts` | D1 lookup, loader/action behaviour (§6.2) |
| `tests/worker/public-terms.test.ts` | `git mv` of `tests/worker/public-content.test.ts`, trimmed, plus the moved term-pointer test (§6.2) |
| `tests/e2e/admin-legacy.spec.ts` | Loopback: every legacy URL fails closed (§6.3) |
| `tests/e2e-studio/wp5-admin-legacy.spec.ts` | Dev owner: 301 targets, 410, landing in the Studio (§6.4) |

### Modify

| Path | Change |
| --- | --- |
| `app/routes.ts` | Replace `:67-84` with §4.3 |
| `app/routes/admin-legacy-redirect.ts` | Rewrite per §4.4 (header comment: "WIRED: …" instead of "CREATED, NOT WIRED") |
| `app/root.tsx` | Remove `:20` and `:53` |
| `app/lib/cms/studio/auth.server.ts` | Import from `../../auth/mutation-guard.server`; export `discardRequestBody` (§4.6) |
| `app/lib/content/public-content.server.ts` | Remove legacy half (§4.7) |
| `app/lib/services/catalog.ts` | Remove `name` and the then-unused `LocalizedText` (or, only if merged WP2 reads `name`, rewrite its JSDoc), per §4.7 |
| `app/styles/legacy.css` | Remove `.content-detail-page*` selectors |
| `app/components/studio/blocks/block-editor.tsx` | Comment `:3-4` |
| `tests/unit/studio-route-guards.test.ts` | Invert `:110-116`; add the redirect-module guard check (§6.1) |
| `tests/unit/studio-shell.test.tsx` | Remove the `StubPanel` case `:68-77` and its import `:9` |
| `tests/unit/service-catalog.test.ts` | Add `expect(service).not.toHaveProperty("name")` in the "holds no price or marketing copy" case (only when `name` is removed) |
| `tests/e2e/final-acceptance.spec.ts` | Header comment `:12` → "/admin 403 (legacy redirect is owner-gated)"; assertion `:122-124` unchanged |
| `tests/e2e/studio-access.spec.ts` | Ensure `STUDIO_PATHS` (`:5-15`) contains `/studio/commissions`, `/studio/services/pricing`, `/studio/services/terms`, `/studio/settings/footer` (add any WP1-3 did not add) |
| `tests/unit/commission-retention-policy.test.ts` (created by WP1) | Remove `app/routes/admin/cleanup-confirm.ts` from the subset allowlist (WP1 spec §7.1 "Subset rule"; WP1 §12 says wp5 needs no change, but the dead-code gate would flag the stale path); the file no longer exists (§4.1 dead-code gate) |
| `tests/worker/cms-public-read.test.ts` | **Expected not needed** (WP3 §6.2 `:757-759` covers both cases). Only if the merged WP3 tests lack them: add "a footer group with 8 links renders all 8" and "the legacy `social` link group is not a footer group" (port of `admin-media-content.test.ts:69-96`, rows inserted with plain SQL into `link_groups`/`links`/`link_group_labels`, ids `admin-footer` / `admin-social` as the legacy editor wrote them), next to the existing footer composition cases `:67-125` |
| `.github/workflows/config-contract.yml` | The `npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts` step points at the deleted `content-repository.test.ts`; replace that path with `tests/worker/public-terms.test.ts`, which receives the moved term-pointer trigger test (§6.2), so the required contract check keeps exercising the live `term_publications` trigger (plan §2.3) |
| `README.md` | `:3`, `:11`: `/admin` → KAMEL STUDIO at `/studio` (Access JWT + Origin/HMAC CSRF; content, media, settings, prices, terms, cases) |
| `docs/admin-architecture.md` | §2.1 code `:84-86` → the §4.3 block; §2.1 prose `:88-89` ("The static `studio` segment outranks the public `:lang` route, as `admin` does today") → add that a splat does **not** outrank `:lang/<child>`, hence the explicit legacy routes; §2.2 rows `:119-120`: if they still say "existing `LinkGroupEditor` logic" / "existing `CaseTable`" after WP1/WP3, reword to "port of the former …" (the components are deleted); §2.3 `:138-160` → §4.4 table, the ranking note, case-insensitive matching and the residual; drop "Until the flip…" (`:159-160`) for "Shipped in WP5 (2026-10)"; §3.2 `:205` → add `/studio.data` to the Access paths (§4.1) and "add them to the existing application, never a new one"; §3.6 `:251-254` → guard tests live in `studio-auth.test.ts`, legacy redirect in `admin-legacy-redirect.test.ts`, e2e asserts `/admin/*` 403; §3.7 `:292` keep, add "Legacy `/admin/*` without owner → 403"; §5.1 `:597` → "was removed (WP5)" |
| `docs/content-architecture.md` | §2 row 1 (`:141`): append "Flip shipped in WP5"; §2 row 2 (`:142`) and §8.1 (`:626`): add `/studio.data` to the Access paths; §9 I (`:791-807`): add a status line naming the WP1/2/3/5 specs |
| `docs/content-schema.md` | `:300` "the existing `/admin/services` flow" → "the former `/admin/services` flow" |
| `docs/design-system.md` | `:29` "admin sidebar" → "Studio sidebar"; §6.25 (`:579-591`) → "Admin (retired). `admin.css` was deleted in WP5; the Studio's visual spec is admin-architecture §5 and `app/styles/studio/*`." |
| `docs/information-architecture.md` | `:18-19` "the admin CMS are kept and reskinned" → "…; the admin CMS is replaced by the Content Studio at `/studio`"; `:58` row → `/studio/**` (Content Studio, Access-gated, noindex, see admin-architecture) and `/admin/**` (owner check, then 301 to the Studio, 410 for other methods); `:68` "the admin should update them" → "update them in Studio → Settings → Footer" |
| `docs/runbooks/cloudflare-setup.md` | §5 step 4 (`:54-58`): paths `/studio`, `/studio/*`, `/studio.data`, `/api/studio/*`, plus "keep `/admin`, `/admin/*`, `/api/admin/*` (legacy redirects stay owner-gated)"; one line: "add them to the **existing** application (same Audience tag / `ACCESS_AUD`); a separate application for `/studio` makes every Studio request 403"; one line on why `/studio.data` is listed (§4.1). Do not copy the owner address into any new line; the existing operational email lines stay as content-architecture.md:563 decided. §7 step 3 (`:117`): "`/studio` and `/admin` are blocked by Access; after the email OTP `/studio` opens, the sidebar Home link works from another Studio page, and `/admin` 301s to `/studio`" |
| `docs/runbooks/google-setup.md` | `:62`: WP1 rewrites this line to "Studio → Commissions (`/studio/commissions`; `/admin/cases` until the flip)" (WP1 §5.2). WP5 removes the "; `/admin/cases` until the flip" clause. Whatever WP1's final wording, the end state is the same: only `/studio/commissions` is named, in zh like the runbook |
| `docs/runbooks/release-checklist.md` | B `:19`: WP1 **extends** this line to also cover Studio → Commissions (`/studio/commissions`; `/admin/cases` until the flip) (WP1 §5.2, §12). WP5 rewrites the same line so it names only Studio → Commissions (`/studio/commissions`) with the same checks (six limited fields, no proof or full form, cleanup only through the three-item checklist). The legacy `/admin` subject and the "until the flip" clause go; no second line is added. B: add "`/admin` after login 301s to `/studio`; an old `/admin` form POST answers 410". C: add "Access application includes `/studio`, `/studio/*`, `/studio.data`, `/api/studio/*` and still `/admin`, `/admin/*`". D: add "WP5 (legacy `/admin` retirement) merged and deployed only after production ran WP1-3 and `/studio` plus its Operations screens were confirmed behind Access" |

### Delete

`app/routes/admin/` (15 files), `app/components/admin/` (7 files), `app/styles/admin.css`,
`app/lib/admin/block-form.ts`, `app/lib/admin/content-service.server.ts`,
`app/lib/admin/media-content-service.server.ts` (whole file; WP3 does not import it),
`app/lib/db/content-repository.server.ts`, `app/lib/media/media-repository.server.ts`,
`app/lib/auth/admin.server.ts` (moved), `app/components/studio/shell/stub-panel.tsx` (when unused),
`tests/unit/admin-block-form.test.ts`, `tests/worker/admin-guard.test.ts`, `tests/worker/admin-publication.test.ts`,
`tests/worker/admin-media-content.test.ts`, `tests/worker/content-repository.test.ts`,
`tests/worker/media-repository.test.ts`, `tests/worker/public-content.test.ts` (moved).

Before deleting `admin-media-content.test.ts` and `admin-block-form.test.ts`: if WP3's tests do not already
assert "a footer group with 8 links renders all 8" and "the legacy `social` link group is not a footer group",
port `admin-media-content.test.ts:69-96` into `tests/worker/cms-public-read.test.ts`, as described in Modify
above. That file is shared and already holds the footer composition cases, so WP5 does not have to edit a
WP3-owned test file. `admin-block-form.test.ts:68-78` tests the deleted `parseAdminLinkGroup` parser. Its
behaviour, "a group may hold more than three links", is required of WP3's own footer schema. If WP3's unit tests
do not cover it, the PR names the gap and WP5 adds one `it` to WP3's footer schema unit test. That file is then
listed in the PR.

---

## 6. Test plan

All suites: `npm run check` (format, typecheck incl. typegen, unit, worker, apps-script, build),
`npm run test:e2e:ci` (loopback production build, both Playwright projects), `npm run test:e2e:studio`.

### 6.1 Unit (`vitest.config.ts`, node)

`tests/unit/admin-legacy-routes.test.ts` (new):
- Converts the default export of `app/routes.ts` to React Router route objects (`{ id, path, index, children }`,
  keeping an id → file map) and calls `matchRoutes` from `react-router`.
- `it.each` over `/admin`, `/admin/`, `/admin/content`, `/admin/content/v-1/edit`, `/admin/content/v-1/preview`,
  `/admin/services`, `/admin/services/`, `/admin/terms`, `/admin/works`, `/admin/links`, `/admin/posts`,
  `/admin/posts/v-1/edit`, `/admin/cases`, `/admin/cases/status`, `/admin/cases/student-discount`,
  `/admin/cases/cleanup`, `/admin/unknown`, `/admin/a/b/c`, `/ADMIN/Works`, `/Admin/Cases`: the deepest match's
  file is `routes/admin-legacy-redirect.ts`. Named regression case: `/admin/services`, `/admin/terms`, `/admin/works`
  never match `routes/public/layout.tsx`.
- `/zh/works`, `/en/services`, `/en/terms`, `/studio`, `/studio/commissions` still match their own modules.
- Residual pinned (§9 R6): `/admin/about` and `/admin/works/x` match the public layout. A future change that closes
  the residual updates this case on purpose.
- No route file starts with `routes/admin/`. Explicit ids are unique, and no two entries **without** an explicit id
  share a file (React Router derives the default id from the file).
- `staticLegacyAdminTarget`: each row of §4.4 (with and without trailing slash);
  `/admin/cases?service=full_mix&status=paused` → `/studio/commissions?service=full_mix&status=paused`;
  `/admin/works?x=1` → `/studio/projects` (query dropped); `/ADMIN/WORKS` → `/studio/projects`; `/admin/nope` →
  `null`.
- `legacyVersionId`: content edit/preview and post edit → id; `/ADMIN/Content/v-1/EDIT` → `v-1`;
  `/admin/posts/x/preview` → `undefined`; `%E0%A4%A` → `null`; 129-char id → `null`; percent-encoded id decoded.
- `legacyEntryTarget`: work with/without project, post with/without writing, page home, page about, `null` row;
  ids with reserved characters are encoded.

`tests/unit/admin-retirement-audit.test.ts` (new; `import.meta.glob("../../app/**/*.{ts,tsx,css}", { query: "?raw", eager: true })`
like `studio-route-guards.test.ts:11-21`):
- No source path under `app/routes/admin/`, `app/components/admin/`; no `app/styles/admin.css`,
  `app/lib/admin/block-form.ts`, `app/lib/admin/content-service.server.ts`, `app/lib/db/`, 
  `app/lib/media/media-repository.server.ts`, `app/lib/auth/admin.server.ts`.
- No source text (raw, comments included) contains `admin.css`, `components/admin/`, `auth/admin.server` or
  `\brequireAdmin`.
- The next three checks run on the source with comments stripped: block comments `/\/\*[\s\S]*?\*\//g`, then line
  comments ``/(^|[^:"'`])\/\/.*$/gm`` (so `https://` and `"//"` survive). JSDoc in this repo uses backtick code spans, so ``(port of `/admin/cases`)``
  in a comment would otherwise trip them.
  - (case-insensitive) `legacy admin` appears in no file under `app/routes/studio/` or `app/components/studio/`
    (Studio UI copy).
  - A string literal starting with `/admin` (regex ``["'`]\/admin(?:[/?"'`]|$)``, unchanged because WP4 mirrors
    it, WP4 spec `:433-437`, `:764`) appears only in the allow-listed files. Four are WP5's own: `app/routes.ts`,
    `app/routes/admin-legacy-redirect.ts`, `app/lib/cms/studio/legacy-admin.ts` and
    `app/lib/security/headers.server.ts`. In practice only `headers.server.ts` has one; the others use `admin…`
    paths and regex literals. The fifth is **`app/lib/cms/schemas/footer.ts`** (WP3 §4.6): its
    `RESERVED_PATH_PREFIXES = ["/studio", "/api", "/admin"]` refuses footer links into private surfaces, which is
    a legitimate deny-list. Without it in the allowlist the audit fails on WP3's code.
  - No `className` value has a token starting with `admin-`. Match `className="…"` / ``className={`…`}`` values
    only, not the many `admin-architecture` comment references.
- `STUDIO_NAV` (`app/components/studio/shell/nav.ts`) has no item whose `to` starts with `/admin`.

(The former check of `app/root.tsx` `links()` hrefs is dropped: importing `root.tsx` in the node unit environment
pulls in every `?url` stylesheet and client component for no gain. The raw `admin.css` check above and the build
check in §6.5 cover it.)

`tests/unit/studio-route-guards.test.ts` (modify):
- Replace `:110-116` with "routes every /admin path to the owner-gated redirect": every flattened route whose path
  starts with `/admin` has file `routes/admin-legacy-redirect.ts`, there is at least one (`/admin`) plus the splat
  `/admin/*`, and no file starts with `routes/admin/`.
- New case: the raw source of `app/routes/admin-legacy-redirect.ts` has `export const loader = withOwner(` and
  `export const action = withOwner(` and no other `loader`/`action` export form (same regexes as `:45-64`). It
  also has no `export default` and no `ErrorBoundary`. The module must stay a resource route, so the thrown 403
  is returned as plain text, React Router never renders UI for it, and it never imports anything from
  `routes/admin/`.
- The existing Studio assertions (`:38-108`) stay unchanged: they are the proof that `/studio` stays guarded.

`tests/unit/studio-shell.test.tsx`: remove the `StubPanel` case (`:68-77`). `tests/unit/service-catalog.test.ts`:
`not.toHaveProperty("name")` when `name` is removed. `tests/unit/security-headers.test.ts:57`: unchanged
(`/admin/content` stays no-store).

### 6.2 Worker (`vitest.worker.config.ts`, migrated D1 `env.DB`)

`tests/worker/admin-legacy-redirect.test.ts` (new). Fixtures inserted with plain SQL (legacy tables exist in
`env.DB` because every migration (`0001`–`0010`) applies in `tests/helpers/apply-migrations.ts`): `content_entries`
`legacy-work-1` (work), `legacy-work-orphan` (work, no Studio row), `legacy-post-1` (post), `legacy-page-home`
(page `home`), `legacy-page-about` (page `about`), one `content_versions` row each (`zh`, `draft`); a Studio
project via `insertProject(env.DB, { id: "legacy-work-1" })` + `UPDATE projects SET legacy_source =
'content_entries:legacy-work-1'`; a `writings` row (plain SQL with the NOT NULL columns of
`migrations/0005_cms_schema.sql`, or `createEntity`) with `legacy_source = 'content_entries:legacy-post-1'`.
Owner injection: the `contextFor(env, owner)` pattern of `tests/worker/studio-auth.test.ts:46-56`.

| Case | Assertion |
| --- | --- |
| `legacyAdminTarget` version paths | work → `/studio/projects/legacy-work-1`; orphan work → `/studio/projects`; post → `/studio/writing/<writing id>`; home page → `/studio/homepage`; about page → `/studio`; unknown version → `/studio`; `/admin/posts/<post version>/edit` and `/admin/content/<version>/preview` resolve the same way |
| D1 failure | a `db` stub whose `prepare().bind().first()` rejects → `/studio`, no throw |
| Loader with owner | `GET https://kamelkyp.com/admin/works` → 301, `Location: /studio/projects`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`; `HEAD /admin` → 301 `/studio`; `/admin/cases?status=paused` → `Location: /studio/commissions?status=paused`; `GET /ADMIN/Works` → `Location: /studio/projects` |
| Loader without owner | request without `Cf-Access-Jwt-Assertion` → thrown `Response` 403, and a spy on `env.DB.prepare` is never called. Env from `createTestEnv({ DB })` with **no** `STUDIO_DEV_OWNER_EMAIL`, so the `import.meta.env.DEV` dev-owner branch cannot apply in the worker pool |
| Action with owner | `POST /admin/cases/status` (form body) → 410 `Gone`, `no-store`, `request.bodyUsed === true`; same for `PUT /admin/links` and `DELETE /admin/terms` |
| Action without owner | 403; body consumed |
| `discardRequestBody` | drains a small body; cancels an unsized stream; no-op on a used body (extend `studio-auth.test.ts:306-…` or test here) |

`tests/worker/public-terms.test.ts` (moved from `public-content.test.ts`): keep "parses published legal clauses
using the term schema" (`public-content.test.ts:28-48`) unchanged; add "rejects a term publication pointer with a
mismatched version tuple" moved verbatim from `content-repository.test.ts:115-…` (it guards the live
`term_publications` trigger); drop the legacy listing cases and the `publishContent` helper.

Unchanged and must stay green: `studio-auth.test.ts` (guard semantics, CSRF, 405, origin), `access-jwt.test.ts`,
`csrf.test.ts`, `admin-cases`, `admin-student-discount`, `admin-cleanup`, `admin-pricing-terms`,
`cms-legacy-import.test.ts`, WP1-3's new tests.

### 6.3 E2E loopback (`npm run test:e2e:ci`, production build on 127.0.0.1:8787, no Access identity)

`tests/e2e/admin-legacy.spec.ts` (new):
- For each legacy URL of §6.1 (plus `/admin/cases?status=paused`): `request.get(path, { maxRedirects: 0 })` →
  status **403**, `cache-control` contains `no-store`, no `location` header, body does not contain `/studio`.
  The colliding trio `/admin/services`, `/admin/terms`, `/admin/works` is the regression guard for §3.5 defect 1
  (with a splat-only route table they answer 404).
- `request.head("/admin")` → 403.
- `request.post("/admin/cases/status", { form: { caseId: "x", status: "paused" } })` → 403 (not 410: no owner);
  `request.post("/admin/links", { form: {} })` → 403.
- `GET /en` and `GET /zh` bodies contain no `href="/admin`.
- Residual pinned (§9 R6): `GET /admin/about` → 404 with `no-store`, and the body has no `/studio`.

The preview workflow also runs `tests/e2e` against the PR Worker (`.github/workflows/deploy-preview.yml:115`). The
new spec relies on the same "no Access identity reaches the Worker → 403" assumption as the existing `/admin` and
`studio-access` assertions, so it behaves the same there. That assumption also means the PR hostname
(`kamelkyp-com-pr-<n>.<subdomain>.workers.dev`) is **not** behind Access. With Access in front, Playwright would
get Access's login redirect, not the Worker's 403, and the existing suites would already fail.

Existing assertions:
- `tests/e2e/final-acceptance.spec.ts:122-124` and `tests/e2e/security-headers.spec.ts:27-33` keep asserting
  `/admin` → 403 + `no-store`. Values do not change; the 403 now comes from the redirect route's `withOwner`
  instead of the admin layout loader, and the body is plain text instead of the root error page (no test reads it).
- `tests/e2e/studio-access.spec.ts`: unchanged assertions, extended path list (§5). This is the fail-closed proof
  that `/studio` is still protected after the flip.
- All commission, `service-currency`, `brand`, `home`, `work`, `media-*`, `public-navigation`, `responsive-a11y`
  specs unchanged and green (no public change).

### 6.4 E2E Studio (`npm run test:e2e:studio`, Vite dev server, dev owner)

`tests/e2e-studio/wp5-admin-legacy.spec.ts` (new), importing `test`, `expect`, `openStudio` from `./harness`:
- `request.get(path, { maxRedirects: 0 })` for every static row of §4.4 → 301, `location` equals the target,
  `cache-control` contains `no-store`.
- `/admin/cases?status=pending_review` → `location: /studio/commissions?status=pending_review`.
- `/admin/content/does-not-exist/edit` → `/studio`; `/admin/whatever/deep` → `/studio`.
- `request.post("/admin/cases/status", { form: { caseId: "x", status: "paused" } })` → 410; `request.fetch("/admin/links", { method: "PUT" })` → 410.
- Browser: `page.goto("/admin/works")` ends on `/studio/projects` with `#studio-main` visible; `page.goto("/admin/cases")`
  ends on `/studio/commissions` with the WP1 heading, not "Not built yet"; same for `/admin/services` → Pricing,
  `/admin/terms` → Terms, `/admin/links` → Footer.
- The Studio sidebar and the four Operations/Footer screens contain no link whose `href` starts with `/admin`.

### 6.5 Static and manual checks

- Dead-code gate (§4.1) empty.
- `npm run build` output: no `admin-*.css` asset in `build/client/assets`.
- Manual checks (content-architecture §9 I acceptance) run where Access really fronts the Worker. The PR hostname
  does not qualify: every `/admin` and `/studio` URL answers 403 there by design (§6.3). The Studio flows are
  checked in the Studio e2e harness (§6.4) and, for the Operations screens, in production **before** the WP5 merge
  (release gate, §4.1). After the WP5 production deploy:
  - open `/admin` → lands on `/studio`;
  - an old `/admin/cases` bookmark → `/studio/commissions`;
  - click Home in the sidebar from `/studio/projects` → the Studio home renders (`/studio.data` is covered);
  - change one case status, and view pricing, terms and the footer in the Studio.

  If the post-deploy check fails, roll back (§8 step 4).

---

## 7. Migration needs

**None.** WP5 adds no table, column, trigger or seed, and no file under `migrations/`. The latest migration is no
longer `0008_cms_sample_drafts.sql` when WP5 starts. WP2 adds `0009_pricing_terms_studio.sql` and WP3 adds
`0010_cms_footer_groups.sql` (fixed numbers, plan §2.1); WP1, WP4 and WP6 add none. WP5's check is that `migrations/`
holds exactly `0001`–`0010`.

Reasons: the legacy tables must stay read-only and in place for at least one release
(content-architecture.md:455-456); the redirect reads `content_versions`/`content_entries`; the footer still reads
`link_groups`/`links`/`link_group_labels`; the import tests stage legacy rows. A "freeze" trigger migration
(`CREATE TRIGGER IF NOT EXISTS … RAISE(ABORT)`) is not required by any doc and would block the footer tables WP3
may still write, so it is not added. If a later package drops the legacy tables, it is a new migration numbered
`0011` or later, and the redirect already falls back to `/studio` when the lookup fails.

---

## 8. Rollout and rollback

1. **Pre-flip data check (Kevin, production, read-only).** Legacy content edited through `/admin` after
   `0007_cms_legacy_import.sql` ran is not in the Studio:

   ```sql
   -- Legacy works/posts with no Studio row (created in /admin after the import)
   SELECT e.kind, e.id, e.slug FROM content_entries e
   WHERE e.kind IN ('work', 'post')
     AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.legacy_source = 'content_entries:' || e.id)
     AND NOT EXISTS (SELECT 1 FROM writings w WHERE w.legacy_source = 'content_entries:' || e.id);
   -- Legacy versions created or published after the import ran
   SELECT e.kind, e.slug, v.locale, v.state, v.created_at, v.published_at
   FROM content_versions v JOIN content_entries e ON e.id = v.entry_id
   WHERE julianday(v.created_at) > julianday((SELECT applied_at FROM d1_migrations WHERE name = '0007_cms_legacy_import.sql'))
      OR julianday(v.published_at) > julianday((SELECT applied_at FROM d1_migrations WHERE name = '0007_cms_legacy_import.sql'));
   ```

   The legacy editors also wrote two kinds of rows that 0007 copied once and that nothing copies since. The works
   panel's media JSON re-creates `media_items` with new UUIDs on every save (`replaceDraftMedia`, drafts only). The
   links panel re-creates `links` with new UUIDs on every save (`replaceLinkGroup`), including the `social` group,
   which 0007 copied into `social_links`. Two more read-only queries catch those:

   ```sql
   -- Media attached in /admin/works after the import (latest draft per entry/locale, https only, as 0007 imported)
   SELECT e.kind, e.slug, v.locale, m.kind AS media_kind, m.url
   FROM media_items m
   JOIN content_versions v ON v.id = m.content_version_id
   JOIN content_entries e ON e.id = v.entry_id
   WHERE v.state = 'draft' AND m.url GLOB 'https://?*'
     AND v.version_number = (SELECT MAX(x.version_number) FROM content_versions x
                             WHERE x.entry_id = v.entry_id AND x.locale = v.locale)
     AND NOT EXISTS (SELECT 1 FROM media_assets a WHERE a.legacy_source = 'media_items:' || m.id);
   -- Legacy "social" links with no Studio social_links row (edited in /admin/links after the import)
   SELECT l.label, l.url, l.enabled FROM links l JOIN link_groups g ON g.id = l.group_id
   WHERE g.stable_key = 'social' AND l.locale = 'zh'
     AND NOT EXISTS (SELECT 1 FROM social_links s WHERE s.legacy_source = 'links:' || l.id);
   ```

   The first query also lists entries that 0007 skipped with `INSERT OR IGNORE` (for example a slug that collided
   with a seeded row), which is intended. The `social` rows are already invisible on the public site: the footer
   skips that group (`site.server.ts:307`), and "Find me" reads `social_links`. A hit there only means a link Kevin
   may want to re-add in Studio → Social links. A deleted Studio social row also shows up as a hit; Kevin
   disregards those.

   If `0007_cms_legacy_import.sql` is not in `d1_migrations` yet, the `applied_at` sub-select is `NULL` and the
   time-based query returns nothing. In that case there is no gap: the deploy that brings the Studio applies
   0005-0008 and imports the legacy rows as they are at that moment. The release gate (§4.1) means production runs
   the Studio, so 0007 has been applied, before WP5 ships.

   Draft saves that only bumped `revision` on an existing version leave no timestamp; Kevin confirms he has not
   edited works/posts in `/admin` since the Studio deploy (the public site has not shown such edits since P5).
   Prices, terms and cases share tables with the Studio, so they have no gap. Non-`social` footer link groups share
   `link_groups`/`links` with the Studio too. Kevin lists them with
   `SELECT id, stable_key, enabled FROM link_groups ORDER BY sort_order;` and checks that each non-`social` group,
   including `admin-<key>` ids, appears in Studio → Settings → Footer (WP3 contract, §4.1).
2. **Release gate** (§4.1): WP1-3 running in production, Access paths for `/studio` (including `/studio.data`)
   added to the existing application, and the Operations screens confirmed. Only then is the WP5 PR merged.
3. Deploy through the normal production workflow (no migration step changes), then run the post-deploy checks of
   §6.5.
4. **Rollback:** redeploy the previous Worker. The legacy `/admin` returns with its routes, and nothing in D1
   changed. Edits made in the Studio stay in the shared tables (cases, prices, terms, footer) or the CMS tables.

---

## 9. Risks

| # | Risk | Likelihood / impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Splat-only route table sends `/admin/services`, `/admin/terms`, `/admin/works` to the public 404 | Certain if the doc snippet were followed / broken bookmarks | Explicit static routes (§4.3); `admin-legacy-routes.test.ts` matches the real config; loopback e2e asserts 403 (not 404) for the trio |
| R2 | Flip deployed before `/studio` is reachable behind Access | Medium / owner locked out of cases, prices, terms | Release gate (§4.1, content-architecture §7); release-checklist items; rollback = previous Worker |
| R3 | Legacy works/posts edited in `/admin` after 0007 are not in the Studio | Low-medium / content not editable | Pre-flip queries (§8.1); owner decision (§10) |
| R4 | WP1-3 still depend on a file WP5 deletes (`admin.css` classes, link-group functions, `SERVICE_CATALOG.name`, `StubPanel`) | Medium / build or styling break | Contract table + dead-code gate (§4.1); conditional deletions (§4.7); typecheck and Studio e2e |
| R5 | Coverage lost with deleted legacy tests | Medium / silent regressions | Term-pointer trigger test moved; `listPublishedTerms` test kept; guard semantics already in `studio-auth.test.ts`; footer cases ported into `tests/worker/cms-public-read.test.ts` if WP3 lacks them (§5) |
| R6 | `/admin/<segment that equals a public child>` that was never a legacy URL (`/admin/about`, `/admin/works/x`) renders the public 404 instead of 301 `/studio` | Low / cosmetic, owner-only (Access gates `/admin/*` at the edge) | Documented in admin-architecture §2.3; mirroring every public child under `admin/` would duplicate the public route list for no user value |
| R7 | Stale tab posts an old `/admin` form | Low | 410 by design, body drained, no state change |
| R8 | Browser caches the 301 permanently | Low | `Cache-Control: no-store` on every redirect |
| R9 | Unread body on 410 drops the dev/`wrangler dev` connection | Low / flaky Studio e2e | `discardRequestBody` before answering |
| R10 | Parallel WP specs edit the same files. WP1 edits `google-setup.md:62` and `release-checklist.md:19`, plus admin-architecture §2.2. WP4 (SEO) probably edits `app/routes.ts` (a `robots.txt`/sitemap route) and `app/root.tsx`. WP6 (hygiene) may edit `app/styles/legacy.css` (dead `.content-index*`) and the brand lines of IA and design-system | Medium / merge conflicts or duplicated runbook lines | WP5 edits only the lines listed in §5 and reconciles WP1's wording (§5 rows for google-setup and release-checklist); merge last and rebase. If WP4 adds `robots.txt`, it keeps `Disallow: /admin` and `/studio` and lists neither in a sitemap. WP5 does not need either. |
| R11 | Stale `.react-router/types` or `tsconfig.tsbuildinfo` after deleting routes in a long-lived worktree | Low / local typecheck noise | `npm run typecheck` reruns typegen (it removes the types dir); delete `*.tsbuildinfo` if needed |
| R12 | Access covers `/studio` and `/studio/*` but not `/studio.data`, so client navigations to the Studio home get 403 in production | Medium / Studio home unreachable after any in-app navigation; e2e cannot catch it (dev owner, no Access) | `/studio.data` added to the Access paths (§4.1), runbook and docs (§5), plus the manual "sidebar Home" check (§6.5) |
| R13 | Mixed-case legacy URLs (`/Admin/Cases`) match the redirect route (React Router is case-insensitive), but case-sensitive helper regexes would send them to `/studio` | Low / wrong landing page | `i` flag on every helper pattern (§4.5); unit and worker cases |
| R14 | A legacy operation has no Studio caller when its legacy route is deleted (for example WP1 never imports `cleanupGoogleLedger`) | Low / owner cannot run the 7-day cleanup or change a price | Capability gate (§4.1) blocks WP5 until every name has a Studio importer |

---

## 10. Owner decisions

1. **Only if the §8.1 queries return rows.** Such rows are legacy works or posts, media attached to them, or
   `social` links that were created or changed in `/admin` after the Studio import, so they are not in the Studio.
   Default in this spec: Kevin re-enters them in the Studio by hand before the flip (Projects / Writing editors,
   Media → register URL, Social links). The alternative is a follow-up additive import migration, numbered after the
   last WP1-3 migration (`0011` or later), which this spec does not include. If the queries return nothing, there is nothing to decide.

Everything else is decided by the docs cited in §2 (redirect semantics, Access paths kept, legacy tables kept,
services reused unchanged, deploy timing).

---

## 11. Acceptance criteria

- [ ] WP1, WP2, WP3 merged; contract table (§4.1) checked and recorded in the PR; capability gate lists every
      operation; dead-code gate (with its three test exclusions) empty.
- [ ] `app/routes.ts` registers no `routes/admin/*` module; every legacy path (§4.3) plus `admin/*` points to
      `routes/admin-legacy-redirect.ts`; `/admin/services`, `/admin/terms`, `/admin/works` (and mixed-case
      `/ADMIN/Works`) reach the redirect, and helpers map mixed case like lower case (unit test with `matchRoutes`).
- [ ] Without an owner, every `/admin` URL (GET, HEAD, POST) answers 403 with `no-store` and no `Location`, and no D1
      read happens (worker + loopback e2e).
- [ ] With the owner, GET/HEAD answer 301 to the §4.4 targets with `no-store` and `X-Robots-Tag`; version paths
      resolve through `legacy_source`, fall back to the list page or `/studio`; D1 errors fall back to `/studio`.
- [ ] With the owner, POST/PUT/PATCH/DELETE answer 410, body consumed.
- [ ] `app/routes/admin/`, `app/components/admin/`, `app/styles/admin.css`, `app/lib/admin/block-form.ts`,
      `app/lib/admin/content-service.server.ts`, `app/lib/db/content-repository.server.ts`,
      `app/lib/media/media-repository.server.ts`, `app/lib/auth/admin.server.ts` are gone;
      `media-content-service.server.ts`, `SERVICE_CATALOG.name` and `stub-panel.tsx` handled per §4.7.
- [ ] `app/root.tsx` no longer links `admin.css`; no public page changes visually; no `admin-*.css` in the build.
- [ ] `app/lib/admin/{case,cleanup,service-catalog,term}-service.server.ts` not changed by WP5 (WP2's in-place
      `publishPriceVersion` metadata change stays as merged), and their worker tests green.
- [ ] `/studio` protection unchanged: `studio-route-guards.test.ts` Studio cases, `studio-auth.test.ts` and
      `tests/e2e/studio-access.spec.ts` (with the Operations paths) all green.
- [ ] New tests in §6 written first (TDD) and green: `admin-legacy-routes`, `admin-retirement-audit`,
      `admin-legacy-redirect`, `public-terms`, `tests/e2e/admin-legacy.spec.ts`,
      `tests/e2e-studio/wp5-admin-legacy.spec.ts`.
- [ ] `final-acceptance.spec.ts` and `security-headers.spec.ts` `/admin` assertions unchanged and green; all
      commission/currency/brand specs green with the same strict NT$ and US$260.00 values.
- [ ] `npm run check`, `npm run test:e2e:ci`, `npm run test:e2e:studio` green. No dependency or
      `package-lock.json` change.
- [ ] No migration added by WP5: `migrations/` holds exactly `0001`–`0010` (WP2's `0009`, WP3's `0010`; plan §2.1).
- [ ] `.github/workflows/config-contract.yml` runs `tests/worker/public-terms.test.ts` instead of the deleted
      `tests/worker/content-repository.test.ts` (plan §2.3).
- [ ] Docs and runbooks updated per §5 (admin-architecture §2.1/§2.2/§2.3/§3.2/§3.6/§3.7/§5.1,
      content-architecture §2/§8.1/§9, content-schema, design-system §6.25, IA, cloudflare-setup §5/§7 including
      `/studio.data` and "existing application", google-setup and release-checklist reconciled with WP1's edits,
      README). No new line names the owner's address.
- [ ] Release gate satisfied **before the WP5 PR is merged**: production runs WP1-3; Access paths `/studio`,
      `/studio/*`, `/studio.data`, `/api/studio/*` are on the existing application; Studio Operations screens and
      the sidebar Home navigation are confirmed in production; the §8.1 queries (works/posts, versions, media,
      social links, link groups) have been run and any rows handled per §10.
- [ ] After the production deploy, the §6.5 manual checks pass (or the deploy is rolled back).

---

## 12. Review notes (adversarial review, 2026-10-13)

The review checked every file:line claim it could against main @ 6bd682a and `node_modules` (react-router 8.3.0).
It re-ran the route-ranking simulation with `matchRoutes` against the real `app/routes.ts`, once with the documented
splat-only block and once with the §4.3 block spliced in. The §3.5 defect is real and the §4.3 fix is correct.
Changes made in place:

1. **Wrong trim range for `public-content.server.ts`** (§3.3, §4.7). `:1-16` would delete the `terms-repository`
   import (`:1-4`) and the `Locale` import (`:11`) that `listPublishedTerms`/`PublishedTerm` still need. Corrected
   to `:5-10`, `:12`, `:14-16`, `:36-63`.
2. **Unused imports after trimming `mutation-guard.server.ts`** (§4.6). Removing `requireAdmin*` leaves
   `JwtVerifier`/`verifyAccessRequest` unused, and `biome.json` sets `noUnusedImports: "error"`, so `npm run check`
   would fail. The spec now says to drop them.
3. **The spec's own audit would have failed.** The planned `block-editor.tsx` comment ("former legacy admin block
   editor") and the redirect module's JSDoc ("legacy admin URL") both contain the phrase the audit bans across all
   of `app/`. The audit's `/admin` literal check also matched backtick code spans in JSDoc, which this repo uses
   everywhere. The audit now strips comments before its copy and literal checks. The "legacy admin" check is
   limited to Studio UI dirs. The literal regex and the four-file allowlist are unchanged, because WP4 mirrors them.
   The comment is reworded, and the `root.tsx` `links()` runtime import is dropped because it is redundant and
   fragile in node.
4. **The dead-code gate could never be empty.** After the deletions it matched the new negative-assertion tests
   (`admin-retirement-audit`, `admin-legacy-routes`, `studio-route-guards`) and WP1's
   `commission-retention-policy.test.ts` allowlist entry. It also used `rg`, which is not guaranteed on the Windows
   machine. It now uses `git grep` with explicit exclusions, and the WP1 allowlist entry is removed (file plan).
5. **Case-insensitive matching.** React Router matches `/ADMIN/Works` to the `admin/works` route, but the
   case-sensitive helper regexes would have sent it to `/studio`. The `i` flag is now required and covered by unit
   and worker cases (R13). The spec also documents OPTIONS (loader → 301) and non-standard verbs (router 405), and
   fixes the snippet's untyped `.first()` with `first<LegacyEntryRow>()`.
6. **Capability gate (new, §4.1, R14).** `cleanupGoogleLedger`, `listCleanupDue`, the `case-service` functions and
   the price/term service functions have **no** `app/` importer outside the legacy routes today. Deleting those
   routes before WP1/WP2 import them would silently remove case and pricing operations. A `git grep` gate now
   blocks WP5 until each has a Studio caller.
7. **The WP3 contract was missing the legacy `admin-<key>` link groups.** The legacy editor creates groups with id
   `admin-<key>` (`workRepository`, `otherWebsite`, `footer`, `postReference`), and the public footer renders every
   non-`social` group. WP3's screen must list and edit them, or they become public and uneditable after the flip.
   WP3's spec satisfies this (loader `:469`, tests `:757-759`). The contract row stays as a check on the merged
   code.
8. **Gaps in the pre-flip data check** (§8.1). The queries now also cover `media_items` attached in `/admin/works`
   after 0007 (new UUIDs on each save, never re-imported) and `social` links edited after 0007 (copied into
   `social_links` only once). They also list link groups for the WP3 check, and they note what happens when 0007
   has not been applied yet (`applied_at` is NULL, so there is no gap). The owner decision in §10 covers these
   rows; its default is unchanged.
9. **Access path `/studio.data` and "existing application"** (§4.1, §5, R12). React Router 8 client navigations to
   the Studio home fetch `/studio.data`, which `/studio/*` does not cover. Whether a bare `/studio` covers it is not
   documented. Without the Access header the Worker 403s, so the Studio home breaks after any in-app navigation, and
   the e2e suites cannot see this (dev owner, no Access). The path is added to the runbook, admin-architecture §3.2
   and content-architecture §2/§8.1, plus a manual sidebar-Home check. The runbook also says to use the existing
   Access application, because a new one has a different AUD and every request would 403.
10. **Enforceable release gate.** Production deploys whatever `main` holds, so "deploy only after the gate" cannot
    be enforced once the PR is merged. The gate is now "the WP5 PR is not merged until production runs WP1-3 and
    Kevin has confirmed the Operations screens behind Access".
11. **Manual acceptance location.** The PR preview hostname cannot be "behind Access": the existing preview e2e
    (`/admin` → 403, `studio-access`) only passes because Access does not front it. Manual checks now run in
    production, before the merge (Operations screens) and after the deploy (redirects), with rollback on failure.
12. **Conflicts with WP1's doc edits.** WP1 rewrites `google-setup.md:62` and extends `release-checklist.md:19`,
    both with "`/admin/cases` until the flip" (WP1 §5.2, §12). WP5 now rewrites those exact lines to the post-flip
    state instead of the original main-branch text. WP1 references are cited by section, because the WP1 spec's
    line numbers moved while this review ran. R10 also names the likely WP4 (`routes.ts`/`root.tsx`/robots)
    and WP6 (`legacy.css`, brand-line docs) overlaps.
13. **Brand-line living docs had no named owner.** design-system §3.5 and IA's real-name lines were "out of scope,
    package I brand/QA". The spec now names WP6, which does claim them (WP6 item (e), `:559-560`, `:717`).
14. **Concrete home for the ported footer tests.** "WP3's footer worker test" was an unknown file. The fallback is
    now the shared `tests/worker/cms-public-read.test.ts`. It is expected to be unneeded, because WP3's worker
    tests already cover both cases.
15. **Sibling specs that landed during this review** (WP2, WP3, WP4, WP6) changed several assumptions:
    - WP2 and WP3 each add a `0009_*` migration (WP1 may add one too). The old acceptance line, "`migrations/`
      still ends at 0008", would have failed, so it is reworded to "WP5 adds no migration file". The follow-up
      import migration in §10 is numbered after them.
    - WP2 modifies `publishPriceVersion` and `listPublishedTerms` in place. The "unchanged services" criterion now
      means "not changed by WP5", and the `public-content` trim goes by symbol.
    - WP2 never reads `SERVICE_CATALOG.name`, so `name` is removed. `LocalizedText` then has no user and goes too.
    - WP3 does not import `media-content-service.server.ts`, so the whole file is deleted and the conditional modify
      row is gone.
    - WP4 mirrors the audit regex and allowlist, so they are kept verbatim.
    - WP3's `app/lib/cms/schemas/footer.ts` holds `RESERVED_PATH_PREFIXES = [..., "/admin"]`, which matches the
      audit's literal regex. It is added to the allowlist, otherwise the audit fails as soon as WP3 is merged.
16. Smaller additions:
    - The route test pins the R6 residual on both sides (unit and loopback e2e).
    - Route-id uniqueness is defined precisely.
    - The guard test asserts the redirect module stays a resource route (no default export, no `ErrorBoundary`).
    - The worker "no owner" case states that the env has no `STUDIO_DEV_OWNER_EMAIL`.
    - The admin-architecture §2.1 ranking sentence and the §2.2 rows that name deleted components are added to the
      doc updates.

Verified as correct and left unchanged:

- The inventory in §3.2 and the importer graph in §3.3, apart from items 1 and 6.
- The `legacy_source` UNIQUE constraints (`0005:138,286`) and the 0007 id preservation.
- `withOwner`/`resolveOwner` semantics, and the `refusing()` drain behaviour.
- `requiresNoStore`/`securitySurface`.
- The HEAD handling in react-router 8.3.0.
- No public consumer of any `admin.css` selector, and `.content-detail-page*` used only by `content-preview.tsx`.
- `SERVICE_CATALOG.name` is read only by `routes/admin/services.tsx`.
- WP5 itself needs no migration.

No pricing value, public copy, sample-content path or Access/CSRF guard of `/studio` changes. The only owner decision
is still the conditional one in §10, which has a default.

Integration-plan completeness review (2026-10-13, plan §9):

- The capability gate in §4.1 is now the plan's amended gate (plan §2.2). The earlier command required
  `listPriceVersions`, `listTermVersions` and `publishTermVersion`, which WP2 never calls, so it could not pass. §3.3
  and the WP2 contract row and bullets say the same. wp7 removes the three legacy-only functions after WP5
  (plan §9 C3 b).
- Migration numbers are fixed (WP2 `0009`, WP3 `0010`, plan §2.1): §4.1, §4.8, §6.2, §7, §10 and §11 updated;
  WP1 adds no migration.
- The file plan (§5) and the acceptance (§11) now include `.github/workflows/config-contract.yml` (plan §2.3).
- The out-of-scope `legacy.css` families (§1) are retired by wp7 after WP5 (plan §9 C3 a); WP5 still removes only
  the `.content-detail-page*` members.
- The release gate depends on the owner's environment configuration (plan A10) before the first production deploy
  (A3) can run.
