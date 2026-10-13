# WP2: Studio Pricing and Terms (spec)

Status: implementation spec, 2026-10-13, revised after adversarial review (section 11). Work package
`wp2-pricing-terms`, branch `claude/wp2-pricing-terms`.
Base: `origin/main` 6bd682a. The integration plan `docs/superpowers/plans/2026-10-13-finish-code-work.md` (§2, §9) wins
over this spec where they differ. Companions: `docs/admin-architecture.md`, `docs/content-architecture.md`,
`docs/content-schema.md`, `docs/superpowers/specs/2026-09-24-content-studio-brief.md` ("brief"),
`docs/superpowers/specs/2026-08-10-kamelkyp-introduction-site-design.md` ("design spec"),
`docs/superpowers/plans/2026-08-10-04-commission-pricing-flow.md` ("plan 04"),
`docs/superpowers/plans/2026-08-10-06-admin-security-release.md` ("plan 06").

---

## 1. Goal

Replace the two remaining Studio stubs, `/studio/services/pricing` and `/studio/services/terms`, with working
screens that cover every capability of the legacy `/admin/services` and `/admin/terms` panels and close the gaps
the docs require:

1. **Pricing**: Kevin sees the active price rule of each commission service, its full immutable history and any
   scheduled change, checks a new version against sample quotes, and publishes it (now or scheduled). A scheduled
   change can be replaced or cancelled without ever editing or deleting a `price_versions` row.
2. **Terms**: each legal document (6 documents x 2 locales) gets a server-side draft (design spec §14 "editing
   terms creates a new draft version"), a preview of the real public page, a validated publish that requires the
   legal-review confirmation, and a version history.
3. **Public pages read only active D1 rows, and fail gracefully when there are none.** Prices already come from
   `price_versions` everywhere (section 3.3). What remains: the wizard's hard-coded percentage labels, the 500
   errors when a price rule, the terms or the FX snapshot are missing, and the `/terms` reader ignoring
   `effective_from`.
4. **`app/lib/services/catalog.ts` stays a typed structure with no prices** (decision in section 4.12).

Never invent pricing: every number shown, prefilled or carried comes from D1. Nothing in this package inserts
price or term content.

---

## 2. Source requirements

| # | Requirement | Source |
| --- | --- | --- |
| R1 | `/studio/services/pricing`: "commission price versions; price versions per service, active rule; `publish-price-version` (existing `publishPriceVersion`)" | admin-architecture.md:109 |
| R2 | `/studio/services/terms`: "legal documents; term versions, publications; `publish-term-version` (requires `legalReviewConfirmed`)" | admin-architecture.md:110 |
| R3 | Legacy redirects `/admin/services` → `/studio/services/pricing`, `/admin/terms` → `/studio/services/terms`; "Until the flip, `/admin/*` stays fully functional" | admin-architecture.md:152-153, :159-160 |
| R4 | `price_versions` stays the only price store; commission rows show the active rule read-only with "Change price → Pricing"; "`SERVICE_CATALOG` shrinks to structure only (`id`, `category`, `slug`)" | content-architecture.md:231-246; content-schema.md:295-303 |
| R5 | "Commission-linked services and price/term versions: no delete (immutable by design)" | admin-architecture.md:501 |
| R6 | "Never invent pricing; sample pricing does not become production content unless explicitly confirmed" | brief:100-107 |
| R7 | Prices migrate as-is: full mix NT$8,000; vocal NT$4,000; simple NT$1,000 (+NT$200 per song after five); edited NT$4,000 (+NT$800); student 30 %, rush +50 %, consultation 50 %, source prep 5 % | content-architecture.md:635-637; migrations/0002_price_terms.sql:1-15 |
| R8 | Surcharges are computed on the service base and do not compound; the student discount applies to base + surcharges | plan 04:15-22; design spec §10.8 (lines 405-415) |
| R9 | "New prices can only INSERT price_versions"; "publishing only affects later forms; drafts re-quote when reopened and lock at submit"; "old cases keep their old price and term versions" | plan 06:330, :332, :347 |
| R10 | Terms: "editing terms creates a new draft version"; "published versions cannot be overwritten"; "publishing a new version only affects new commissions" | design spec §14 (lines 493-503) |
| R11 | Content workflow "draft → preview → publish → edit"; "Chinese and English are edited and published separately"; terms follow the no-overwrite rule | design spec §17.3 (lines 601-615) |
| R12 | Publish requires `legalReviewConfirmed`; the server re-checks it and answers 422; "the UI states that this checkbox does not replace professional legal advice" | plan 06:339-343 |
| R13 | Terms must cover design spec §11-14 (payment, deposit, final payment, queue, revisions, cancellation, project files, ownership, credit, confidentiality, portfolio, progress contact, purpose) | plan 04:30, :990-1018 |
| R14 | The e2e term fixture is for preview/E2E only; "production does not auto-publish legal text"; Kamel enters or reviews it in the admin and publishes after the legal gate | plan 04:1020 |
| R15 | Term versions are not rewritten, re-seeded or brand-guarded; whether "Kamel" suffices or a legal name must appear is Kevin's (and his reviewer's) decision | content-architecture.md:584-592, :595-596 |
| R16 | Studio principles: server decides; draft freely, publish deliberately; recoverable by default; no modals unless destructive | admin-architecture.md:16-26 |
| R17 | Save state is always one of Saved / Saving / Unsaved Changes / Error; autosave off; local backup; leave guard; Mod+S saves | admin-architecture.md:450-478 |
| R18 | "Publishing has no single-key shortcut (deliberate click)" | admin-architecture.md:584 |
| R19 | Preview routes are Access-gated under `/studio/preview/*`; unsaved preview posts the form; nothing is written | admin-architecture.md:162-175; brief:146-148 |
| R20 | English prices follow the daily FX snapshot; after three business days without an update the English form stops submitting and keeps the draft | design spec §4.2 (lines 108-114) |
| R21 | No inline `style` attributes in Studio markup (CSP `style-src 'self'`) | admin-architecture.md:304-305 |
| R22 | Studio chrome is English; content is zh + en; nothing is machine-translated | admin-architecture.md:8-10; content-architecture §1.3 |
| R23 | Package I owns `app/routes/studio/services/{pricing,terms}.tsx` and `app/components/studio/{pricing,terms}/**`, reusing `app/lib/admin/{service-catalog,term}-service.server.ts` | content-architecture.md:793-807 |

---

## 3. Current state

### 3.1 Data (migrations)

| Table | Shape | File |
| --- | --- | --- |
| `service_definitions` | 4 CHECK-constrained ids, category, sort order | 0001_core.sql:89-95, seeds :251-255 |
| `price_versions` | `id`, `service_id`, `base_twd > 0`, `per_song_after_five_twd`, 4 bps columns, `effective_from`, `retired_at`; **no publish timestamp** | 0001_core.sql:97-108 |
| price seeds | `full-2026-08-10` 8000/0/3000/5000/5000/500, `vocal-2026-08-10` 4000/0/..., `simple-2026-08-10` 1000/200/..., `edit-2026-08-10` 4000/800/...; all effective `2026-08-10T00:00:00Z` (`INSERT OR IGNORE`) | 0002_price_terms.sql:1-15 (0001_core.sql has 255 lines and seeds only `service_definitions`) |
| `term_documents` | `common`, `privacy`, `full-mix`, `vocal-mix`, `simple-transition`, `edit-transition` | table 0001_core.sql:110-114, seeds 0002_price_terms.sql:17-23 |
| `term_versions` | per document + locale, `version_number`, `body_json`, `created_at`, nullable `effective_from` | 0001_core.sql:116-126 |
| `term_publications` | one pointer per (document, locale) with `effective_from`; triggers enforce a matching version | 0001_core.sql:128-162 |
| immutability | UPDATE/DELETE on `price_versions` and `term_versions` raise | 0004_admin_revision.sql:21-43 |
| `fx_rates` | daily TWD→USD snapshot, refreshed by the cron | 0001_core.sql:208-216; workers/app.ts:80-84 |
| `services` (CMS) | commission rows `svc-<id>`, `commission_service_id` immutable, CHECK forces `price_mode='starting_from'` and NULL amount | 0005_cms_schema.sql (content-schema.md:295-303); seeds 0006_cms_base_seed.sql:285-400 |

No term text is seeded in any migration. Only the loopback e2e loads `tests/fixtures/terms-e2e.sql` (versions and
publications effective 2026-08-10). The site has never been deployed to production, so the production database will
start with prices and no terms.

### 3.2 Legacy admin

- `app/routes/admin/services.tsx`: one form (service select, six raw numeric inputs with bps defaults 3000/5000/5000/500
  typed into the markup at :93-106, `datetime-local` effective time) → `publishPriceVersion`; list of versions.
  `effectiveFrom` is `new Date(String(...)).toISOString()` (:45-47): the Worker runs in UTC, so a local Taipei time
  is stored 8 hours late. Names via the deprecated `getService(id).name.zh` (:19, :79, :117).
- `app/lib/admin/service-catalog-service.server.ts`: zod `PriceInputSchema` (:4-12), `listPriceVersions` (:52-63),
  `publishPriceVersion` (:65-102) inserts one row with `crypto.randomUUID()` (:78) and no publish metadata.
- `app/routes/admin/terms.tsx`: document select, locale select, raw `clausesJson` textarea, `datetime-local`,
  legal checkbox (:35-37 → 422) → `publishTermVersion`.
- `app/lib/admin/term-service.server.ts`: `listTermVersions` (:16-40); `publishTermVersion` (:42-102) inserts the
  next version and moves the publication pointer in one batch, with **any** `effectiveFrom`, past or future.
- No drafts, no preview, no history beyond a flat list.

### 3.3 Public read path (already on D1 prices)

- `app/lib/cms/public/services.server.ts`: commission rows priced by `getActivePriceRule` (:39-49, :51-78);
  `getAreaStartingPrices` (:154-180); `getCommissionServiceNames` (:131-148).
- `app/components/services/service-detail-loader.server.ts:35-61`: service pages read the published row, price from
  the active rule, student note from the same rule.
- `app/routes/public/commission-category.tsx:31-48`: lists published commission services with an active price.
  `getService(id)` (:14, :42) is used **only for the route slug**, not for prices.
- `app/routes/public/commission-service.tsx:28-34`: `getActivePriceRule`, `getActiveTerms` and (en)
  `getUsableFxSnapshot` are awaited without handling; any missing row is a **500**. In production today (no terms
  published) every wizard URL would be a 500, and an English wizard is a 500 whenever FX is stale, contrary to R20.
- `app/lib/commission/prepare-submission.server.ts:52-79` and `submit.server.ts`: the server re-validates term version
  ids and **recomputes the quote from the active D1 rule**; `clientClaimedTotal` is ignored. Nothing reads
  `catalog.ts`. The safe-code lists name `price_rule_not_found` (`app/routes/api/commission-prepare.ts:58`,
  `commission-submit.ts:28`), but the repository throws `active_price_rule_not_found`
  (`price-repository.server.ts:31`), so the code is dead and the log says `service_unavailable`/`prepare_failed`.
- `app/lib/pricing/price-repository.server.ts:15-47`: `ORDER BY effective_from DESC, id DESC`. Two versions with
  the same `effective_from` are ordered by a random UUID.
- Hard-coded rate text in the wizard: `common-fields.tsx:215-216` ("-30%"), `:248-249` ("+50%"), `:259-260`
  ("+5%"); `simple-transition-fields.tsx:116-117` ("+50%"). They drift from the rule as soon as a bps value changes.
  `price-figure.tsx:134-143` rounds the student note (`Math.round(bps / 100)`), so 1250 bps would show 13 %.
- `/terms` and `/privacy` (`app/routes/public/terms.tsx:25-32`, `privacy.tsx:23-26`) read D1 term tables (not legacy
  content) through `listPublishedTerms` in `app/lib/content/public-content.server.ts:65-99`, a file whose other
  exports are legacy. It has **no `effective_from` filter**, while the wizard's `getActiveTerms`
  (`terms-repository.server.ts:42-69`) filters `p.effective_from <= now` and needs exactly three documents.

### 3.4 `catalog.ts`

`app/lib/services/catalog.ts:14-50` already holds structure only (`id`, `category`, `slug`) plus a deprecated
`name` used only by `app/routes/admin/services.tsx`; `LocalizedText` is also imported by the legacy
`app/lib/admin/media-content-service.server.ts:5`. `tests/unit/service-catalog.test.ts:35-42` asserts no price
fields. Consumers of the structure: `commission-category.tsx:42`, `service-detail-loader.server.ts:58`,
`service-choice.tsx:80`, `studio/preview/service.tsx:68`.

### 3.5 Studio

- Stubs: `app/routes/studio/services/pricing.tsx:1-9`, `terms.tsx:1-9` (`StubPanel` linking to `/admin/...`).
- Routes registered: `app/routes.ts:32-33`; nav entries under OPERATIONS: `app/components/studio/shell/nav.ts:63-70`.
- `PriceFields` links commission rows to `/studio/services/pricing` (`price-fields.tsx:60`).
- Established patterns this spec reuses: thin route modules `withOwner(loadX)` / `withOwnerMutation(handleX)`
  (`app/routes/studio/services/edit.tsx:20-33`); repository modules with `loadX`, `parseXForm`, `handleXAction`,
  intent sets and `actionOk`/`actionError`/`cmsErrorResult` (`app/lib/cms/repositories/services.server.ts:305-586`);
  `CmsError` codes with HTTP status (`app/lib/cms/db/errors.ts`); `formDataToObject` dotted names (`forms.ts`);
  `useEditorForm` (dirty, save state, Mod+S, sessionStorage backup, `useBlocker`) (`ui/use-editor-form.ts`);
  `StudioForm`/`IntentButton` (CSRF, intents); `LeaveGuard`, `BackupBanner`, `SaveError`, `useActionToasts`
  (`settings/form-kit.tsx`); `EditorLayout`/`EditorSection`/`PreviewPane`/`ValidationChecklist`/`ListEditor`/
  `ConfirmDialog`; preview routes with GET = stored copy, POST = unsaved form (`routes/studio/preview/service.tsx`).
- Tests: `tests/worker/admin-pricing-terms.test.ts`, `price-repository.test.ts`, `studio-services.test.ts`;
  `tests/unit/studio-p4-services.test.tsx:101-114`; loopback `tests/e2e/studio-access.spec.ts:5-15`; Studio harness
  `tests/e2e-studio/harness.ts` (Vite dev server, persistent local D1, `openStudio` waits for hydration).

### 3.6 Exact public figures the tests pin

`tests/e2e/service-currency.spec.ts:3-20` (NT$8,000, NT$4,000, US$260.00, US$130.00),
`final-acceptance.spec.ts:63-116` (NT$8,000/4,000/1,000; US$260.00; wizard NT$8,680, NT$4,000, NT$400, NT$-3,720
for base + rush + source prep + student, non-compounding), `home.spec.ts:161-180`, `services-about-writing.spec.ts:
17-45`, `commission-review.spec.ts:35`. FX fixture: `rate_scaled` 3250000 (`tests/fixtures/fx-e2e.sql`). All stay
unchanged by this package.

---

## 4. Design

### 4.1 Data flow

```
Studio Pricing ──publish-price-version / cancel-scheduled──▶ price_versions (INSERT only)
                                                            + price_version_publications (INSERT only, new)
Studio Terms ──save──▶ term_drafts (mutable working copy, new)
             ──publish-term-version (legal review)──▶ term_versions (INSERT) + term_publications (pointer) − draft
                                       │
              getActivePriceRule / getActiveTerms / listPublishedTerms / getUsableFxSnapshot
                                       │
   /mixing*, /song-transition*, /services, home pricing, /commission/:category, wizard, prepare/submit, /terms, /privacy
```

One definition of "active" per kind, shared by every reader:

- **Price**: `getActivePriceRule(db, serviceId, at)`; newest `effective_from <= at`, not retired; ties broken by the
  latest publish (section 4.3).
- **Terms**: the publication pointer with `effective_from <= at` (both `getActiveTerms` and `listPublishedTerms`).
- **FX (en only)**: `getUsableFxSnapshot`; missing or stale means "USD unavailable", never a 500.

### 4.2 Routes

Add to `app/routes.ts` inside the shell layout, directly after the existing static routes and before
`services/:id`:

```ts
route("services/pricing", "routes/studio/services/pricing.tsx"),                         // existing → index
route("services/pricing/:serviceId", "routes/studio/services/pricing-edit.tsx"),          // new
route("services/terms", "routes/studio/services/terms.tsx"),                              // existing → index
route("services/terms/:documentId/:locale", "routes/studio/services/terms-edit.tsx"),     // new
```

and inside the `preview` branch:

```ts
route("terms/:documentId", "routes/studio/preview/terms.tsx"),                            // new, ?locale=zh|en
```

| Path | Loader data | Actions (`intent`) | Auth |
| --- | --- | --- | --- |
| `/studio/services/pricing` | `PricingIndexData` | `refresh-fx` | A / A+C |
| `/studio/services/pricing/:serviceId` (`full_mix` \| `vocal_mix` \| `simple_transition` \| `edit_transition`, else 404) | `PriceEditorData` | `publish-price-version`, `cancel-scheduled` | A / A+C |
| `/studio/services/terms` | `TermsIndexData` | none | A |
| `/studio/services/terms/:documentId/:locale` (6 ids x `zh`/`en`, else 404) | `TermEditorData` | `save`, `publish-term-version`, `discard-draft` | A / A+C |
| `/studio/preview/terms/:documentId?locale=` | the public Terms or Privacy page with this document's saved draft (else live) | POST: unsaved form, nothing written | A / A+C |

Route modules stay thin, exactly like `routes/studio/services/edit.tsx:20-33`:

```ts
export const loader = withOwner(({ db, params, now }) => loadPriceEditor(db, params.serviceId ?? "", now));
export const action = withOwnerMutation(({ db, params, formData, intent, now }) =>
  handlePriceEditorAction({ db, serviceId: params.serviceId ?? "", formData, intent, now }));
```

Each Studio route exports `links` for its stylesheet (`app/styles/studio/pricing.css` or `terms.css`).
Nav is unchanged: `activeNavItem` already resolves nested paths by prefix (nav.ts:81-91).
Unknown intents answer `unknownIntent(intent)` (422).

### 4.3 Pricing model

**Values.** A version holds `baseTwd`, `perSongAfterFiveTwd`, `studentDiscountBps`, `rushBps`, `consultationBps`,
`sourcePrepBps`. Which fields a service actually uses is fixed by `calculate-quote.ts:17-43` and
`prepare-submission.server.ts:72-76`:

| Service | Editable in the Studio | Carried over unchanged (not used by its quote) |
| --- | --- | --- |
| `full_mix`, `vocal_mix` | base, student, rush, source prep | per song after 5, consultation |
| `simple_transition` | all six | none |
| `edit_transition` | base, per song after 5, student, rush, source prep | consultation |

Carried fields are not form inputs. The server always copies them from the **baseline rule** (below), so a new
version can never silently change a value the owner did not see. Percentages are entered as percent (0-100, at
most two decimals) and stored as integer bps (`30` → 3000, `5` → 500, `12.5` → 1250); `12.345` is refused.
Percent fields are posted as plain strings (names `studentDiscountPercent`, `rushPercent`, `consultationPercent`,
`sourcePrepPercent`, **no** `:number` suffix) and converted by `percentInputToBps` with string arithmetic: the
value must match `^\d{1,3}(\.\d{1,2})?$` and be <= 100, and bps = integer part x 100 + the two-digit fraction.
Never `Math.round(Number(value) * 100)` on the raw float (`0.07 * 100` is `7.000000000000001`). Amount fields use
`baseTwd:number` / `perSongAfterFiveTwd:number` and must be safe integers.

**Effective time.** Radio "Takes effect": *Immediately* (default; server uses `now.toISOString()`) or *At a
scheduled time* with a `datetime-local` labelled "Date and time (Taipei, UTC+8)". The value `YYYY-MM-DDTHH:mm` is
interpreted at the fixed offset `+08:00` (Asia/Taipei has no DST; precedent `commission-success.tsx:71`). A
scheduled time must be at least 5 minutes after `now`. Backdating is impossible by construction (plan 06:348,
no retroactive price change). All Studio times are displayed as `YYYY-MM-DD HH:mm` Taipei. The helpers live in a neutral
module, `app/lib/time/taipei.ts`, because pricing, terms and the public legal date (section 4.7) all use them.

**Baseline rule.** For *Immediately*: the active rule. For a scheduled time `T`: the rule that would be active just
before `T` (which may itself be a scheduled version). Carried values, the "unchanged" check and the warnings
compare against the baseline. The form initially fills from the active rule; when the chosen `T` lies after a
pending scheduled change, the Check section says so and offers "Use the values scheduled for <time>".
If no baseline exists (no rule at all before `T`), the server answers 409 `invalid_state` ("There is no price to
base this version on.") and inserts nothing: WP2 never creates a first price for a service, so carried fields can
never be invented. (The four seeds are immutable and cannot be retired from the Studio, so this is a guard, not a
flow.)

**Concurrency token.** `price_versions` is insert-only (UPDATE/DELETE raise), so the number of rows of a service
only grows. The editor posts hidden `expectedVersionCount` (the count at load) with every `publish-price-version`
and `cancel-scheduled`; the server recounts and answers 409 `stale_revision` on a mismatch ("The price history
changed since this page was opened. Reload to review it."). This catches what `basedOnVersionId` cannot: another
tab scheduling a change at the same instant (which would otherwise turn this publish into a silent `replace`) or
a new scheduled version that moves the baseline. `basedOnVersionId` stays for the case without any insert: a
scheduled change taking effect while the page is open.

**Publish metadata (new table, section 7).** Every Studio publish writes, in the same `db.batch`, a row in
`price_version_publications (version_id, published_at, action, replaces_version_id)`. `action` is `publish`,
`replace` (same effective time as a scheduled version: the new row wins) or `cancel` (a copy of the baseline rule
at the scheduled version's exact time). Seed rows have no metadata.

**Tie-break.** `getActivePriceRule` becomes:

```sql
SELECT v.id, v.service_id, v.base_twd, v.per_song_after_five_twd, v.student_discount_bps,
       v.rush_bps, v.consultation_bps, v.source_prep_bps
FROM price_versions v
LEFT JOIN price_version_publications p ON p.version_id = v.id
WHERE v.service_id = ? AND v.effective_from <= ? AND (v.retired_at IS NULL OR v.retired_at > ?)
ORDER BY v.effective_from DESC, p.published_at DESC, v.id DESC
LIMIT 1
```

(SQLite sorts NULL last under DESC, so a published row beats a seed at the same instant.) Existing data has no
ties, so no current result changes. For a replacement the server reuses the **exact `effective_from` string** of
the scheduled row whose instant equals the chosen time, so string comparison and instant comparison agree.

**Version states** (pure, client-safe `classifyPriceVersions`, mirroring the SQL order exactly):

| State | Rule |
| --- | --- |
| `active` | what `getActivePriceRule(now)` returns |
| `scheduled` | winner of its `effective_from` group, `effective_from > now` |
| `superseded` | was eligible, no longer active |
| `replaced` | lost its `effective_from` group to a later publish (never active) |
| `retired` | `retired_at <= now` (legacy only; the Studio never sets `retired_at`) |

**Rules on publish (`publish-price-version`).** Errors (422, `invalid_content` with issues):

- editable fields required; base safe integer >= 1; per song safe integer >= 0; percent 0-100 with <= 2 decimals;
- scheduled time missing, malformed, or less than 5 minutes ahead (`effective_in_past`);
- *Immediately* with values identical to the active rule (`unchanged`: "Nothing changed: these values match the
  active price."). A scheduled version is never refused as unchanged (it is what the Studio e2e uses, section
  6.4); identical scheduled values get the warning `unchanged` ("These values match the price that will be active
  then.") instead;
- hidden `basedOnVersionId` differs from the current active version id → 409 `stale_revision` ("The active price
  changed since this page was opened (a scheduled change may have taken effect). Reload to review it.");
- hidden `expectedVersionCount` differs from the current count → 409 `stale_revision` (concurrency token above).

The insert always goes through the reused `publishPriceVersion` (R23, section 4.4), with the computed
`effectiveFrom`, `publishedAt = now.toISOString()`, `action` and `replacesVersionId`.

Warnings (never block; shown live in the Check section, computed client-side from loader data):

- any value changes by more than 50 % relative to the baseline ("Base price changes by +125 %: NT$8,000 →
  NT$18,000. Check the number.");
- the live term documents of this service (either locale) mention an NT$ amount equal to a baseline amount that
  this version changes ("The live ZH terms for Full Song Mixing (v2) mention NT$8,000. Update them in Terms.");
- a scheduled change will still take effect after an *Immediately* publish.

**`cancel-scheduled`** (`versionId`, `expectedVersionCount`): the target must be `scheduled`; the server publishes
a copy of the baseline rule at the target's exact `effective_from` with `action = 'cancel'`,
`replaces_version_id = versionId`. If no baseline exists → 409 `invalid_state`; count mismatch → 409
`stale_revision`. No row is ever updated or deleted.

**Form layout (no nested forms).** The price `StudioForm` wraps only CURRENT PRICE, NEW VERSION and CHECK plus the
hidden `basedOnVersionId` / `expectedVersionCount`. HISTORY renders **outside** that form: each "Cancel scheduled
change" is its own small `StudioForm` (fetcher) with hidden `versionId` and `expectedVersionCount`, so no
`<form>` is nested and a cancel never posts (or backs up) the unsaved price fields.

**`refresh-fx`** (index): `refreshFxRate(db, env.FX_API_URL, fetcher, now.toISOString())` (existing,
`fx-repository.server.ts:29-89`); success toast with the rate and date; `fx_upstream_unavailable` or
`fx_response_invalid` (the two codes it throws) → 503 `fx_refresh_failed` ("The exchange-rate service did not
answer. Try again later."). The handler takes an injectable `fetcher` (default `fetch`) for tests. No manual rate
entry: rates are never typed by hand. `FxStatus` uses the same date basis as every public reader
(`getUsableFxSnapshot(db, now.toISOString().slice(0, 10))`, as `public-price.server.ts:10-13` and
`prepare-submission.server.ts:83`), so "Stale" in the Studio means exactly "English prices show as unavailable".

**No server-side price draft.** A price version is six numbers and a time; the review happens on the page (Check
section), scheduling covers "prepare in advance", and the unsaved form is protected by the leave guard and the
`useEditorForm` sessionStorage backup. Terms get a server draft because legal text is long, reviewed over days and
must survive a closed tab (R10, R11).

### 4.4 Pricing repository and helpers

`app/lib/cms/repositories/pricing.server.ts`:

```ts
export type PriceValues = {
  baseTwd: number; perSongAfterFiveTwd: number; studentDiscountBps: number;
  rushBps: number; consultationBps: number; sourcePrepBps: number;
};
export type StudioPriceVersion = PriceValues & {
  id: string; serviceId: ServiceId; effectiveFrom: string; retiredAt: string | null;
  publishedAt: string | null; action: "publish" | "replace" | "cancel" | null;
  replacesVersionId: string | null; state: PriceVersionState;
};
export type PricingServiceSummary = {
  serviceId: ServiceId; category: "mixing" | "song_transition";
  name: LocalizedText;                            // from the services row (published name, else working name); type from app/lib/cms/types.ts (plan §2.9)
  serviceRow: { id: string; status: EntryStatus } | null;
  active: StudioPriceVersion | null; next: StudioPriceVersion | null;
  livePath: string;                               // commissionServicePath(serviceId)
};
export type FxStatus = { state: "ok" | "stale" | "missing"; rateDate: string | null;
  rateScaled: number | null; fetchedAt: string | null };
export type PricingIndexData = { services: PricingServiceSummary[]; readiness: CommissionReadiness[];
  fx: FxStatus; now: string };
export type PriceEditorData = { service: PricingServiceSummary;
  editable: ReadonlyArray<keyof PriceValues>; history: StudioPriceVersion[];
  versionCount: number;                           // history.length; posted back as expectedVersionCount
  termMentions: Array<{ locale: Locale; versionNumber: number; amounts: number[] }>; now: string };

export const EDITABLE_PRICE_FIELDS: Record<ServiceId, ReadonlyArray<keyof PriceValues>>;
export async function listPriceHistory(db, serviceId, now: Date): Promise<StudioPriceVersion[]>;
export async function loadPricingIndex(db, now: Date): Promise<PricingIndexData>;
export async function loadPriceEditor(db, serviceId: string, now: Date): Promise<PriceEditorData>; // 404 Response if invalid
export function parsePriceVersionForm(formData, ctx: { serviceId; history; now }):
  | { ok: true; values: PriceValues; effectiveFrom: string; action: "publish" | "replace";
      replacesVersionId: string | null; basedOnVersionId: string | null; expectedVersionCount: number }
  | { ok: false; issues: ValidationIssue[] };
export async function handlePriceEditorAction({ db, serviceId, formData, intent, now });
export async function handlePricingIndexAction({ db, env, intent, now, fetcher = fetch });
```

`listPriceHistory`: one query (`price_versions LEFT JOIN price_version_publications`, the SQL order above) then
`classifyPriceVersions`. Names come from `services` (`COALESCE(json_extract(published_json,
'$.core.name_i18n'), name_i18n)`, as in `getCommissionServiceNames`), never from `catalog.ts`.

Client-safe helpers (pure, unit-tested, imported by both the repository and the components):

| Module | Exports |
| --- | --- |
| `app/lib/pricing/price-history.ts` | `PriceVersionState`, `compareForActive(a, b)` (mirror of the SQL ORDER BY), `ruleActiveAt(rows, atIso)`, `classifyPriceVersions(rows, nowIso)` |
| `app/lib/pricing/percent.ts` | `bpsToPercentLabel(bps)` (`3000` → `"30"`, `1250` → `"12.5"`, integer arithmetic), `percentInputToBps(value: string)` (`null` when invalid; string arithmetic, section 4.3) |
| `app/lib/time/taipei.ts` | `STUDIO_TIME_ZONE = "Asia/Taipei"`, `taipeiLocalToIso(value)`, `isoToTaipeiLocal(iso)`, `formatTaipei(iso)`, `taipeiDate(iso)` (`YYYY-MM-DD` of the Taipei calendar day; fixed +08:00 arithmetic, no `Intl`, so SSR and hydration agree) |
| `app/lib/pricing/sample-quotes.ts` | `includedSongsFor(serviceId)` (5 for transitions, 0 otherwise; `price-repository.server.ts` switches to it), `priceRuleFromValues(serviceId, values, versionId)`, `sampleQuotes(serviceId, rule)`, `priceChangeWarnings(baseline, next)`, `extractTwdAmounts(text)` (`NT$8,000`, `NT$ 1,000`, `NT$200`, `新臺幣 8,000 元`, `新台幣8000元`, `TWD 1,000` → numbers; other currencies and percentages are ignored) |

`sampleQuotes` (all via `calculateQuote`, so the Studio shows exactly what the wizard computes):
mixing: base; base + rush; base + rush + source prep + student. Simple: 5 songs; 8 songs; 8 songs + consultation +
rush; 5 songs + student. Edited: 5 songs; 8 songs; 8 songs + rush + source prep + student. Song counts are UI
sample sizes, not prices.

`app/lib/admin/service-catalog-service.server.ts` changes minimally (reused per R23): `publishPriceVersion` accepts
optional `publishedAt` (default `new Date().toISOString()`), `action` (default `publish`) and `replacesVersionId`,
and writes the version and its metadata row in one `db.batch`. The legacy `/admin/services` keeps working and its
versions get metadata too. `listPriceVersions` is unchanged. This is a deliberate, additive deviation from
content-architecture.md:795-796 ("reusing … unchanged"): without a publish timestamp two versions at the same
instant are ordered by a random UUID (section 3.3). The doc line is updated with the file plan.

### 4.5 Terms model

**Documents** (fixed, from `term_documents`): `common` (kind common, page `/terms`), `privacy` (kind privacy, page
`/privacy`), `full-mix`, `vocal-mix`, `simple-transition`, `edit-transition` (kind service, page `/terms`). Studio
labels: "General terms", "Privacy notice", "Service terms · <English service name>" (from the `services` row,
fallback to the service id).

**Draft.** At most one draft per (document, locale) in `term_drafts` (section 7): `body_json` (clause array),
`base_version_id` (the live version id when the draft was created, informational, no FK), `revision` (>= 1),
`created_at`, `updated_at`. Drafts are never read by any public route.

**Clause fields.** `key` (stable id used for anchors, `^[a-z0-9]+(?:[_-][a-z0-9]+)*$`, <= 100, unique within the
version; keep the same key in ZH and EN), `title` (<= 200), `text` (<= 8000, plain text: the public page renders one
paragraph per clause, so the hint says line breaks are not kept). 1-100 clauses; serialized body <= 1,000,000 bytes
(D1 row-size guard).

**Schemas** (`app/lib/cms/schemas/term-draft.ts`, client-safe):

- `TermDraftSchema`: lenient (all strings may be empty, keys may be empty, 0-100 clauses, trimmed, length limits).
  Only structural problems (over a limit, more than 100 clauses, malformed key characters) block a save.
- `validateTermClausesForPublish(clauses, ctx)` → `ValidationIssue[]`, with `ctx = { live: TermClause[] | null;
  expectedKeys: readonly string[]; activeAmounts: number[] | null; baseOutdated: boolean }`:
  - errors: no clauses; empty key/title/text (`required`); malformed key (`invalid_value`); duplicate key
    (`duplicate_key`); identical to the live version (`unchanged`); body too large (`too_long`);
  - warnings: expected clause keys missing (`expected_clause`, see outline below); NT$ amounts in a service
    document that are not amounts of that service's active rule (`price_mention`; the message names only the
    amounts the service's quote uses, `EDITABLE_PRICE_FIELDS`: "Mentions NT$9,000; the active Full Song Mixing
    base price is NT$8,000." for mixing, "… base NT$1,000, NT$200 per song after the 5th" for transitions; the
    figures in the message come from D1 at run time); the draft started from an older version than the current
    live one (`base_outdated`).
  - The server adds brand warnings with `findBrandViolations` (`brand_name`, **severity warning**: terms are exempt
    from the blocking brand guard per R15; message "Contains a personal-name variant ("<term>"). Legal texts are
    exempt from the brand guard; keep it only if your legal reviewer requires an operator identity.").
  - A strict pass also implies `parseTermClauses` succeeds; the server calls `parseTermClauses` once more before
    inserting. `term-draft.ts` is client-safe, so it may only `import type { TermClause }` from
    `app/lib/commission/terms-repository.server.ts` (a `.server` module cannot reach the client bundle); it
    re-declares the limits (key 1-100, title 1-200, text 1-8000, 1-100 clauses) and `term-draft.test.ts` proves the
    parity (every strict-valid draft passes `parseTermClauses`; every limit + 1 fails both).
- `diffClauses(live, draft)` → `{ added: string[]; removed: string[]; changed: string[]; unchanged: number }` by key.

**Expected outline** (`app/lib/commission/term-outline.ts`, client-safe; keys and English Studio topics only, never
legal text): `common` = the 17 keys of plan 04:992-1008 (`payment_methods`, `deposit`, `final_payment`,
`minor_revisions`, `major_revisions`, `client_cancellation`, `provider_delay_completed`, `provider_failure`,
`client_inactivity`, `queue_and_timing`, `delivery_and_retention`, `project_file_purchase`, `ownership`,
`confidentiality`, `credit_and_portfolio`, `progress_contact`, `purpose_no_price_effect`); `full-mix` =
`full_mix`, `mixing_source`; `vocal-mix` = `vocal_mix`, `mixing_source`; `simple-transition` = `simple_transition`,
`transition_delivery`, `schedule_adjustment`; `edit-transition` = `edit_transition`, `transition_delivery`,
`schedule_adjustment` (plan 04:1010-1018); `privacy` = none (the docs name no privacy keys). Missing keys are
warnings: the legal reviewer has the last word.

**Publish (`publish-term-version`).** Order matters:

1. `legalReviewConfirmed` must be `on`; otherwise 422 `legal_review_required` with an issue on field
   `legalReviewConfirmed` and **nothing is saved** (R12; matches `admin/terms.tsx:35-37`).
2. Save the posted form into the draft (same as `save`, revision-checked).
3. Validate the stored draft; blocking issues → `actionOk({ published: false, issues, message: "Saved. Publishing
   is blocked by N issues." })` (the services pattern, `services.server.ts:520-540`). If no draft row exists after
   step 2 (no draft yet and the posted clauses equal the live version, so `save` created none), answer the same
   shape with the blocking `unchanged` issue ("Nothing to publish: this matches the live version.") instead of
   running the batch.
4. One `db.batch` (transaction):

```sql
INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from)
SELECT ?1, d.document_id, d.locale,
       COALESCE((SELECT MAX(v.version_number) FROM term_versions v
                 WHERE v.document_id = d.document_id AND v.locale = d.locale), 0) + 1,
       d.body_json, ?2, ?2
FROM term_drafts d WHERE d.document_id = ?3 AND d.locale = ?4 AND d.revision = ?5;

INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES (?3, ?4, ?1, ?2)
ON CONFLICT(document_id, locale) DO UPDATE SET
  version_id = excluded.version_id, effective_from = excluded.effective_from;

DELETE FROM term_drafts WHERE document_id = ?3 AND locale = ?4 AND revision = ?5;
```

The version is copied from the stored, validated draft row. If the draft revision moved in between, the first
statement inserts nothing, the pointer trigger raises `term_publication_version_mismatch` (or the composite FK
fails), the batch rolls back, and the handler maps either message to 409 `stale_revision`. D1 runs a batch
as one transaction and batches one at a time, so `MAX(version_number) + 1` cannot collide with another publish;
should `UNIQUE (document_id, locale, version_number)` ever fail anyway, it maps to 409 `stale_revision` as a
defensive fallback. Any other error is rethrown (Studio error boundary). After the batch the handler reads the inserted row by id to return
`versionNumber` (as `term-service.server.ts:89-93` does).

**Effective time for terms = publish time** (`?2 = now.toISOString()`), with no scheduling and no backdating. Reason:
the pointer model moves at once, and the wizard needs all three documents active (`terms-repository.server.ts:61`),
so a future pointer would close the commission form until that date (the legacy `/admin/terms` can do exactly
that today). R10 says new versions apply to new commissions, which "on publish" satisfies. Dropping the legacy
"effective from" input is a deliberate non-port, listed in section 4.16 so the wp5 parity check sees it.

**Save (`save`).** `expectedRevision = 0` (no draft yet) → `INSERT ... ON CONFLICT(document_id, locale) DO NOTHING`
with `base_version_id` = current pointer, `revision = 1`; zero changes → 409. Otherwise `UPDATE ... SET body_json,
revision = revision + 1, updated_at WHERE document_id = ? AND locale = ? AND revision = ?`; zero changes → 409
`stale_revision`. Identical body → no revision bump (`message: "No changes"`). No draft yet and the posted clauses
equal the live version → no row created.

**Discard (`discard-draft`).** `DELETE ... WHERE revision = ?`; zero changes → 409. The UI confirms with a native
`ConfirmDialog` ("Discard this draft? The live version stays as it is."), allowed because the loss is permanent.

**Repository** `app/lib/cms/repositories/terms.server.ts`:

```ts
export type TermDocumentId = "common" | "privacy" | "full-mix" | "vocal-mix" | "simple-transition" | "edit-transition";
export type TermDocumentInfo = { id: TermDocumentId; kind: "common" | "service" | "privacy";
  serviceId: ServiceId | null; label: string; publicPath: "/terms" | "/privacy" };
export type TermVersionSummary = { id: string; versionNumber: number; createdAt: string;
  effectiveFrom: string | null; clauseCount: number; live: boolean; clauses: TermClause[] };
export type TermLocaleState = { live: TermVersionSummary | null; liveEffective: boolean;
  draft: { revision: number; updatedAt: string; baseVersionId: string | null; clauseCount: number } | null };
export type TermsIndexData = { documents: Array<TermDocumentInfo & { locales: Record<Locale, TermLocaleState> }>;
  readiness: CommissionReadiness[]; serviceNames: Partial<Record<ServiceId, LocalizedText>>; now: string };
export type TermEditorData = { document: TermDocumentInfo; locale: Locale; otherLocale: Locale;
  live: TermVersionSummary | null; liveEffective: boolean;
  draft: { clauses: TermDraftClause[]; revision: number; updatedAt: string; baseVersionId: string | null } | null;
  otherLocaleKeys: string[]; history: TermVersionSummary[]; issues: ValidationIssue[];
  diff: ReturnType<typeof diffClauses> | null; expected: ReadonlyArray<{ key: string; topic: string }>;
  activeAmounts: number[] | null; now: string };

export async function loadTermsIndex(db, now: Date): Promise<TermsIndexData>;
export async function loadTermEditor(db, documentId: string, locale: string, now: Date): Promise<TermEditorData>;
export function parseTermDraftForm(formData: FormData): { clauses: TermDraftClause[];
  expectedRevision: number | null; legalReviewConfirmed: boolean };
export async function saveTermDraft(db, input): Promise<{ revision: number; updatedAt: string; changed: boolean }>;
export async function publishTermDraft(db, input): Promise<{ versionId: string; versionNumber: number; effectiveFrom: string }>;
export async function discardTermDraft(db, input): Promise<void>;
export async function handleTermEditorAction({ db, documentId, locale, formData, intent, now });
```

Form names: `clauses.<i>.key`, `clauses.<i>.title`, `clauses.<i>.text`, `expectedRevision`,
`legalReviewConfirmed`, plus hidden `locale` (read only by the preview action, section 4.7). Rows whose three
fields are all empty are dropped on parse. `otherLocaleKeys` are the keys of the other locale's draft when one
exists, else of its live version. The legacy `publishTermVersion` stays unchanged for `/admin/terms` until the
flip; the Studio does not call it (its publish must delete the draft in the same batch), see section 4.17.

### 4.6 Commission availability (shared)

New `app/lib/commission/availability.server.ts`:

```ts
export type CommissionReadiness = {
  serviceId: ServiceId;
  serviceStatus: EntryStatus | null;                    // the marketing row
  price: { versionId: string; baseTwd: number } | null; // active rule
  terms: Record<Locale, { ready: boolean; missing: TermDocumentId[] }>; // common + privacy + service doc, effective
  open: Record<Locale, boolean>;                        // price && terms[locale].ready
};
export async function getCommissionReadiness(db, now: Date): Promise<CommissionReadiness[]>;
export async function loadCommissionWizard(db, locale, serviceId, now: Date):
  Promise<{ priceRule; terms; serviceName; fxSnapshot: FxSnapshot | null } | null>;
```

- `loadCommissionWizard` returns `null` when `getActivePriceRule` throws `active_price_rule_not_found` or
  `getActiveTerms` throws `active_terms_unavailable` (other errors rethrow); for `en` it catches
  `fx_rate_missing`/`fx_rate_stale` → `fxSnapshot: null` + `console.warn("commission_fx_unavailable", code)` (the
  wizard and `QuoteSummary` already render "USD unavailable", `quote-summary.tsx:19-25`; prepare still refuses with
  `fx_rate_stale`, satisfying R20). The service name keeps P5's rule (`getCommissionServiceNames`, published name,
  else working name), so a direct wizard URL keeps working for an unpublished marketing row, as P5 decided
  (`app/lib/cms/public/services.server.ts:125-130`).
- `commission-service.tsx` becomes `const data = await loadCommissionWizard(...); if (!data) throw new
  Response("Not Found", { status: 404 })`. The 500 disappears. The loader's return shape is unchanged
  (`locale`, `serviceId`, `serviceName`, `priceRule`, `terms`, `fxSnapshot`, Turnstile fields): wp4 adds a `meta`
  export to this route that reads `loaderData?.serviceName` (`2026-10-13-wp4-seo.md` §4.9). The FX catch mirrors
  `getPublicPriceContext` (`public-price.server.ts:9-19`: UTC date, `console.warn`, `null`).
- `commission-category.tsx` keeps its published + active-price filter and additionally requires
  `readiness.open[locale]`. When nothing is open it renders the existing `EmptyState` (copy in 4.10).
- The Studio Pricing and Terms indexes show `CommissionReadinessTable` from the same function. The EN column also
  states the FX state when it is not "Current" ("Open · USD unavailable (FX stale): English commissions cannot be
  submitted"), because an open English wizard still refuses submission without a usable snapshot (R20).

Also align the dead safe codes so logs name the real cause:

- `app/routes/api/commission-prepare.ts:58`: replace `price_rule_not_found` with `active_price_rule_not_found` and
  add `active_terms_unavailable`. This route returns the safe code to the caller, so the visible `code` changes
  from `prepare_failed` to the real cause; the message stays the generic fallback (`:38-43`). No client reads it:
  the wizard never calls `/api/commission/prepare` (it posts only to `/api/commission/submit`).
- `app/routes/api/commission-submit.ts:28`: same replacement and addition, **but** `:137-140` maps every safe code
  to the public code `validation_failed` ("check the details"), which is wrong for a closed service. Add the two
  codes to a small `UNAVAILABLE_CODES` set that keeps the public code `service_unavailable` (today's value for
  them) while the log line carries the real code. The public message is the same generic one either way
  (`:49-63`), and the wizard only branches on `retry_required` (`commission-wizard.tsx:242`).

Price validation on submit needs no change: it already recomputes from the active D1 rule, and it **ignores**
`clientClaimedTotal` by design (plan 04, test "ignores client totals and recomputes the locked quote",
`tests/worker/commission-prepare.test.ts:83`). Consequence for WP2 copy: a visitor whose wizard was loaded before
a price publish still sees the old figures and is locked at the rule active at submit (plan 06:332 "lock at
submit"); the Studio note says so truthfully (section 4.9). Changing that contract is out of scope.

### 4.7 Public terms reads

- Keep `listPublishedTerms` and `PublishedTerm` where they are (`app/lib/content/public-content.server.ts:18-25,
  65-99`) and change them in place: new last parameter `at = new Date().toISOString()` and `AND p.effective_from <=
  ?` in the WHERE clause, so `/terms` and `/privacy` apply the same "effective now" rule as `getActiveTerms`. No
  move: the admin-retirement package (wp5, `2026-10-13-wp5-admin-retirement.md` §4.7) trims only the legacy half of
  this file, keeps `listPublishedTerms`, and relies on the route import paths staying the same.
- Extract the page bodies of `app/routes/public/terms.tsx:39-139` and `privacy.tsx:33-114` verbatim into
  `app/components/legal/legal-pages.tsx` as `TermsPage({ locale, terms, serviceNames, brandName })` and
  `PrivacyPage({ locale, terms, brandName })`. Public routes become loader + `usePublicSite()` + component; markup,
  copy and classes do not change (e2e unchanged). The routes **keep** their `handle` and `export const meta`
  (wp4 rewrites both `meta` call sites to `pageMeta({ matches, location }, …)` and its unit test requires every
  public route module except `layout.tsx`/`home.tsx` to export `meta`; moving `meta` into the component file would
  break that test and the wp4 rebase).
- `previewTerms(db, locale, documentId, { formData?, now })` in `app/lib/cms/public/preview.server.ts` returns
  `{ page: "terms" | "privacy"; terms: PublishedTerm[]; serviceNames }`: the published documents of that page for
  the locale, with the target document replaced (or inserted in reading order) by the unsaved form (POST, parsed
  with `TermDraftSchema`, empty rows dropped; `PreviewFormError` → 422), else the saved draft, else live. The draft's
  effective date shows as `now`. The preview route renders `TermsPage`/`PrivacyPage` inside the existing preview
  layout (real public shell + PREVIEW bar); `meta` uses `previewMeta`. Unknown `documentId` → 404.
- Locale guard for the unsaved preview: a term draft belongs to one locale, but `PreviewPane` has its own ZH/EN
  toggle. The term editor therefore always posts to `previewSrc(src, <editor locale>)` (not the pane's current
  locale), and `previewTerms` throws `PreviewFormError` (→ 422) when the posted hidden `locale` differs from
  `?locale=`. A GET with the other locale simply shows that locale's saved draft or live version.
- Effective date display: `formatLegalDate` (`app/components/legal/legal-document.tsx:18-20`) slices the **UTC**
  date. Today all effective dates are UTC midnight fixtures, but Studio publishes set `effective_from = now`, so a
  publish between 00:00 and 08:00 Taipei would print the previous day, a date before the text actually took
  effect. `formatLegalDate` switches to `taipeiDate(value)` (section 4.4) with the same `YYYY.MM.DD` format; the
  `<time dateTime>` attribute keeps the ISO value. Fixture output is unchanged (`2026-08-10T00:00:00Z` →
  `2026.08.10`).

### 4.8 Wizard rate labels

`CommissionFieldProps` (`common-fields.tsx:4-8`) gains `priceRule: PriceRule`; `commission-wizard.tsx:348-367`
passes it to all four field components. Labels use `bpsToPercentLabel`:

| Field | zh | en |
| --- | --- | --- |
| student (`common-fields.tsx:215-216`) | `申請學生優惠（所有計價 -${p}%）` | `Request student discount (${p}% off)` |
| rush (`:248-249`) | `詢問急件（服務基價 +${p}%）` | `Request rush scheduling (+${p}% of service base)` |
| source prep (`:259-260`) | `需要素材整理（服務基價 +${p}%）` | `Source preparation needed (+${p}% of service base)` |
| consultation (`simple-transition-fields.tsx:116-117`) | `需要協助決定順序或銜接點（服務基價 +${p}%）` | `Need help choosing order or transition points (+${p}% of service base)` |

With the seeded rule the strings are byte-identical to today. `studentDiscountNote` (`price-figure.tsx:139`)
switches to `bpsToPercentLabel` (no rounding). `calculatePostQuoteFee` is a terms concept, not a price column, and
stays as is.

### 4.9 Studio components and screens

Files under `app/components/studio/pricing/` and `app/components/studio/terms/` (R23). Styles in
`app/styles/studio/pricing.css` and `terms.css`, scoped under `.studio`, density tokens from `base.css`, no inline
styles (R21), tabular numbers for every figure.

**Action results (wp6 coordination).** New WP2 components react to fetcher results only through the shared hooks
(`useActionToasts`, `useEditorForm`) or by keying on the identity of `fetcher.data` (as `service-editor.tsx:172-182`
does), or through wp6's `useFetcherSettled` if it has landed. They never use the busy-state-only pattern
(`previous.current !== "idle" && fetcher.state === "idle"`): wp6 fixes it in the shared hooks and adds a static ban
over `app/components/studio/**` and `app/routes/studio/**` (`2026-10-13-wp6-hygiene.md` §4.1.5) that a WP2 copy of
the pattern would fail. This applies to clearing the legal checkbox after a publish, remounting the price form,
and the cancel/refresh toasts.

**Pricing index** (`PricingIndex`, page title "Pricing", narrow width):

- Intro: "Commission prices. Each change adds an immutable price version; submitted cases keep the price they
  locked."
- One ruled row per service (`<h2>` English name, zh name secondary): active base "NT$8,000"; transitions add "+
  NT$200 per song after the 5th"; rates line "Student 30% · Rush 50% · Source prep 5%" (+ "Consultation 50%" for
  simple); "since 2026-08-10 08:00 Taipei"; version id in mono; next change ("Scheduled: NT$9,000 from 2027-01-01
  00:00" or "No scheduled change"); marketing row status badge with link "Edit service page" →
  `/studio/services/<row id>`; links "Change price" → `/studio/services/pricing/<serviceId>` and "View live" →
  `/zh<livePath>`. "No active price" in danger colour with "The commission form for this service is closed."
- `CommissionReadinessTable`: caption "Commission form availability"; rows = services, columns ZH, EN; cells "Open"
  or "Closed" + reason ("no active price", "terms missing: General terms (EN)"); words always present.
- `FxStatusPanel`: "1 TWD = 0.0325 USD · rate date 2026-10-12 · fetched 2026-10-13 09:15 Taipei"; states "Current",
  "Stale (older than 3 business days): English prices show as unavailable and English commissions cannot be
  submitted", "Missing"; `IntentButton intent="refresh-fx"` "Refresh now".

**Price editor** (`PriceVersionEditor`, title "<English name> pricing", breadcrumb "Pricing"):

- Uses `useEditorForm({ type: "price-version", id: serviceId, updatedAt: <latest publishedAt or active
  effectiveFrom>, fetcher, saveIntent: null })` for dirty tracking, local backup and the leave guard. **Mod+S does
  nothing here** (R18) except suppressing the browser's save dialog (section 4.11). No `SaveStateIndicator`
  (nothing is "saved" until publish); feedback is the pending button and toasts. The form is keyed by the active
  and scheduled ids so it resets after a publish. `LeaveGuard` is rendered **without** `onSaveAndLeave` (Stay /
  Discard only): leaving never publishes implicitly.
- Sections (`EditorSection`, mono labels): **CURRENT PRICE** (read-only plate of the active rule); **NEW VERSION**
  (`NumberInput` base and per-song in NT$, percent inputs `type="number" step="0.01" min="0" max="100"
  inputMode="decimal"`, carried fields as a `<dl>` "Not used by this service, carried over unchanged:
  Consultation 50%" (text, not disabled inputs), "Takes effect" fieldset, hidden `basedOnVersionId`); **CHECK**
  (`QuoteCheck` table: rows = samples, columns Current / New / Difference, plus warnings list); **HISTORY**
  (`PriceHistoryTable`).
- Defaults are the active rule's values. No placeholder ever shows a number.
- Submit: `IntentButton intent="publish-price-version"` labelled "Publish now" or "Schedule for 2027-01-01 00:00"
  (Taipei), with the summary line "Base NT$8,000 → NT$9,000 · effective immediately". No dialog (R16 principle 5);
  the Check section is the review step. Pending label "Publishing…".
- Note under the button (plan 06:332), worded to match what the code does (section 4.6): "New commissions are
  quoted with this version from its effective time. Submitted cases keep their locked price. A visitor who already
  has the form open keeps seeing the old figures until the page reloads, and is charged the price active when they
  submit. Scheduling the change for a quiet hour avoids that." It also reminds: "Review the price wording in Terms."
  (percentages in legal text cannot be matched automatically).
- `PriceHistoryTable`: caption "Price history for <name>"; columns State, Effective from (Taipei), Base, Per song
  after 5, Student, Rush, Consultation, Source prep, Published, Version; `PriceStateBadge` words Active /
  Scheduled / Superseded / "Replaced (never active)" / Retired, plus "Cancels the change of <time>" for `cancel`
  rows. Scheduled winners get two buttons: "Replace…" (client-side: fills the form with that version's values and
  time, mode scheduled, then calls `editor.onInput()`; confirm dialog only if the form is dirty) and
  `IntentButton intent="cancel-scheduled"` "Cancel scheduled change" (accessible name includes the time) in its own
  small form (section 4.3 "Form layout"). Wrapped in a focusable scroll region (`role="region"`, `aria-label`,
  `tabIndex={0}`) for narrow screens.

**Terms index** (`TermsIndex`, title "Terms"):

- Intro (R10): "Legal texts per language. Published versions never change: editing creates a draft, and each
  publish adds a new version that applies to new commissions only."
- Table: rows = 6 documents, columns ZH and EN. Cell: "v3 · live since 2026-10-13 18:02" or "Not published"; a
  "Draft · edited 14:02" marker when a draft exists; "Not yet effective (<time>)" in warning colour for a legacy
  future pointer; each cell links to `/studio/services/terms/<id>/<locale>`.
- `CommissionReadinessTable` (shared component).

**Term editor** (`TermEditor`, title "<label> · ZH", breadcrumb "Terms"):

- `useEditorForm({ type: "term-draft", id: "<documentId>:<locale>", updatedAt: draft?.updatedAt ?? live?.createdAt ??
  null, fetcher })` (Mod+S saves the draft). Top bar: status (`LIVE v3` or `NOT PUBLISHED`, `DRAFT` flag),
  `SaveStateIndicator`, "Preview changes", Save, Publish. Link "Switch to EN" (`otherLocale`).
- "Preview changes" posts the unsaved form (R19, admin-architecture §2.4) the way `project-editor.tsx:182-210`
  does (hidden poster form, CSRF token included, `intent` stripped), always to
  `previewSrc("/studio/preview/terms/<id>", locale)` with the editor's locale (section 4.7 locale guard); into the
  pane from 1200 px, else a new tab.
- **List changes mark the form dirty.** `ListEditor` add, remove and move change React state and rename inputs
  without firing `input` events (`list-editor.tsx:41-118`), so `useEditorForm` alone would stay clean and the
  leave guard, backup and save state would miss them. The term editor watches its form with a `MutationObserver`
  (`childList`, `subtree`, `attributeFilter: ["name"]`) that calls `editor.onInput()`, the technique of
  `app/components/studio/projects/use-form-watch.ts:1-8,127` (that hook itself is project-specific, so the term
  editor carries a small local copy).
- **Backup restore rebuilds the list.** `useEditorForm.restoreBackup` (`applyFields`, `use-editor-form.ts:69-102`)
  only fills controls that exist, so clauses added after the last save would be lost on restore. The term editor's
  `BackupBanner` "Restore" parses the backup's `clauses.<i>.*` entries into a clause array, remounts the
  `ListEditor` with it (form key) and then calls `editor.onInput()`.
- **The legal checkbox is not form content.** `legalReviewConfirmed` is added to `IGNORED_FIELDS` in
  `app/components/studio/ui/editor-state.ts:75` (next to `csrfToken`, `intent`, `expectedRevision`), so ticking it
  never makes the form dirty, is never written to the sessionStorage backup and is never re-checked by a restore.
  No existing editor uses that name.
- `EditorLayout` sections: **CLAUSES** (`ListEditor name="clauses"` with Key (mono), Title, Text; inputs carry
  `lang="zh-Hant"` or `lang="en"`; Move up/down from `ListEditor`; max 100); **PUBLICATION** (live line, diff
  summary "2 changed · 1 new · 0 removed", `ValidationChecklist`, the expected-outline checklist with each key's
  topic and a present/missing mark, the legal review block, publish note, "Discard draft" in a collapsed danger
  zone); **HISTORY** (`TermHistory`: versions newest first with LIVE marker; each in a `<details>` showing its
  clauses read-only; "Use as starting point" button). Preview pane (`PreviewPane src="/studio/preview/terms/<id>"
  defaultLocale={locale} reloadKey={draft?.revision}`) from 1200 px; below that, Preview opens a new tab.
- Starting content when there is no draft: the live clauses (pristine; the first Save creates the draft). A "Start
  over" disclosure offers: "Start blank", "Copy clause keys from <OTHER> (titles and text empty)", "Start from the
  expected outline (keys only)" and, from History, "Use as starting point". Each remounts the clause list
  client-side (form key + `editor.onInput()` after remount); if the form is dirty a `ConfirmDialog` asks first
  ("Replace the editor content? Unsaved edits are lost."). The e2e fixture text is never offered (R14).
- Legal review block (`LegalReview`): unchecked native checkbox `name="legalReviewConfirmed"` labelled "A qualified
  legal professional has reviewed this version." with `aria-describedby` note "This confirmation does not replace
  professional legal advice." (R12). It is never stored and is cleared after each publish.
- Publish button "Publish ZH version" (or "Publish · N issues" when blocking issues exist). Clicking with blocking
  issues does not submit and focuses the first issue (admin-architecture §4.10); clicking without the checkbox does
  not submit, focuses it and shows the inline error. The server enforces both anyway.
- Publish note (R9, R10), worded to match the code: "Publishing takes effect immediately for new commissions.
  Submitted cases keep the version their client accepted. A visitor who already has the form open cannot submit
  with the old version; they see an error and must reload the page to read and accept the new one." (The wizard
  resets acceptance only when new version ids arrive with a reload, `commission-wizard.tsx:141-152`; the submit
  route refuses with `term_version_mismatch` and answers the generic "check the details" message,
  `commission-submit.ts:27,137-140`. A dedicated message plus revalidation is a public-wizard change outside WP2;
  see section 8.)
- Banners: `BackupBanner`; `base_outdated` ("This draft started from v2; v3 has been published since. Compare before
  publishing."); 409 → `SaveError` "This draft changed elsewhere." + "Reload latest".

**Service editor pointer.** `PriceFields` gets `commissionServiceId` (from `content.commissionServiceId` in
`service-editor.tsx:360`) and links to `/studio/services/pricing/<commissionServiceId>`, falling back to
`/studio/services/pricing` when it is absent (label unchanged: "Change in Pricing").

### 4.10 Bilingual copy (public)

Only two public additions; Studio chrome is English (R22).

| Where | zh | en |
| --- | --- | --- |
| `commission-category.tsx` empty state title | 目前沒有開放線上委託的服務 | No services are open for online commissions right now |
| empty state description | 請稍後再回來，或透過頁尾的聯絡方式詢問。 | Please check back later, or get in touch using the contact details in the footer. |
| wizard rate labels | section 4.8 (computed, identical to today for seeded values) | section 4.8 |

No new public text names a person; no new public text contains a price.

### 4.11 Shared primitive changes

Two one-line changes in shared Studio primitives; all existing callers are unaffected:

- `useEditorForm` accepts `saveIntent?: string | null` (default `"save"`). With `null` the Mod+S handler still
  calls `event.preventDefault()` (admin-architecture §4.7: Mod+S never opens the browser's save dialog) but
  submits nothing. Without this, today's handler calls `form.requestSubmit(undefined)` on a form that has no
  `save` button, which posts the price form with no intent (`use-editor-form.ts:185-195`). wp6 rewrites `:160-182`
  of the same file; the hunks do not overlap.
- `editor-state.ts` `IGNORED_FIELDS` gains `legalReviewConfirmed` (section 4.9).

### 4.12 `catalog.ts` decision

Keep `app/lib/services/catalog.ts` as the typed structure (`id`, `category`, `slug`, `getCategoryServices`,
`getService`, `commissionServicePath`, `categoryPath`), as content-architecture.md:243 prescribes. It already holds
no prices or copy (`tests/unit/service-catalog.test.ts:35-42` keeps guarding that). WP2 adds no consumer of the
deprecated `name`; every Studio and public name comes from the `services` rows. The deprecated `name` field goes
with its last consumer, `app/routes/admin/services.tsx:19,79,117`, which the admin-retirement package deletes
(wp5 §4.7 removes `name` exactly when WP2 does not read it, which this spec guarantees; admin-architecture §2.3
keeps `/admin/*` functional until that flip, so WP2 must not delete the legacy screen itself). `LocalizedText` stays
exported while `app/lib/admin/media-content-service.server.ts:5` imports it. WP2's own check before handoff:
`rg "SERVICE_CATALOG|getService\(" app/components/studio app/lib/cms/repositories app/routes/studio` finds no
`.name` access.

### 4.13 Error states

| Situation | Response | UI |
| --- | --- | --- |
| No Access / wrong owner / bad CSRF / GET mutation | 403 / 405 (guards) | Access login; CSRF retry once (existing) |
| Unknown `serviceId`, `documentId`, `locale` | 404 Response from the loader | Studio error boundary |
| Unknown intent | 422 `unknown_intent` | error toast |
| Price form invalid / past time / unchanged | 422 `invalid_content` + issues | inline field errors + error toast (the pricing page has no save-state indicator) |
| Active price changed since load, or the service's version count changed | 409 `stale_revision` | message + "Reload" |
| Cancel on a non-scheduled version, or no baseline (publish or cancel) | 409 `invalid_state` | error toast |
| Term publish with nothing to publish (no draft, form equals live) | 200 `{ ok: true, published: false, issues: [unchanged] }` | checklist opens |
| Unsaved term preview posted for the other locale | 422 | preview frame shows the error |
| FX upstream failure | 503 `fx_refresh_failed` | error toast; old snapshot kept |
| Draft too large / malformed key on save | 422 `invalid_content` + issues | inline |
| Publish without legal review | 422 `legal_review_required` (nothing saved) | checkbox focused, inline error |
| Publish with blocking issues | 200 `{ ok: true, published: false, issues }` (draft saved) | checklist opens |
| Draft revision moved (save, publish, discard) | 409 `stale_revision` | "This draft changed elsewhere." |
| Public wizard without active price or terms | 404 | public not-found page |
| Public category with nothing open | 200 with empty state | section 4.10 |
| Public en wizard with stale/missing FX | 200, `fxSnapshot: null` | "USD unavailable"; prepare refuses (existing message) |

New `ValidationIssueCode` members in `app/lib/cms/types.ts:35-50`: `duplicate_key`, `unchanged`,
`legal_review_required`, `effective_in_past`, `expected_clause`, `price_mention`, `base_outdated`,
`large_change`. No new `CmsErrorCode` is required (`invalid_content`, `stale_revision`, `invalid_state`, `not_found`
cover the failures; `legal_review_required` and `fx_refresh_failed` are passed to `actionError` with explicit
status and message).

### 4.14 Accessibility

- Every input has a `<label>`; hints and errors are linked with `aria-describedby`; invalid inputs get
  `aria-invalid`; errors render with `role="alert"` (existing `Field`).
- Radio groups and clause rows use `<fieldset>`/`<legend>`; clause legends "Clause 3"; move buttons named "Move
  clause 3 up".
- Tables have `<caption>`, `<th scope="col">`/`scope="row"`; status is always a word, never colour alone (§5.8).
- Read-only carried values are text, not disabled inputs (no low-contrast disabled controls, nothing posted).
- The legal checkbox is never pre-checked; Publish focuses it when it is missing.
- Language attributes on clause inputs (`zh-Hant` / `en`).
- Live regions only where the primitives already provide them (save state, toasts); the Check table is not live
  (it would announce on every keystroke).
- Native `<dialog>` only for "Discard draft" and replacing dirty editor content; focus returns to the opener.
- Mobile (< 768 px): single column, sticky footer with Save/Publish (the `FormFooter` pattern of
  `service-editor.tsx:104-145`), tables in focusable scroll regions, 44 px targets under coarse pointer.
- `<title>`: "Pricing — KAMEL STUDIO", "Full Song Mixing pricing — KAMEL STUDIO", "Terms — KAMEL STUDIO", "General
  terms · ZH — KAMEL STUDIO".

### 4.15 Brand and pricing rules (checklist for the implementer)

- No number is typed into code, markup, placeholders, defaults or fixtures of this package except in tests that
  assert the carried seed values. The form prefills only from D1; carried fields come only from D1.
- Migration 0009 inserts no rows.
- Studio e2e publishes only scheduled versions at the fixed instant 2099-01-01 00:00 Taipei with the **active
  values unchanged** (section 6.4).
- No public string names a person; terms are not brand-blocked but warn (R15).
- Drafts, previews and history are Studio-only (Access-gated, `no-store`, `noindex`).
- The e2e term fixture is never a "start from" source.

### 4.16 Legacy parity (for the wp5 "every legacy capability reachable" check)

| Legacy capability (`app/routes/admin/services.tsx`, `terms.tsx`) | Studio | Note |
| --- | --- | --- |
| List all price versions (`listPriceVersions`) | Pricing index + per-service history (`listPriceHistory`) | richer: state words, publish time |
| Publish a price version with all six numbers | Price editor | carried fields are copied, not typed (section 4.3) |
| Any `effectiveFrom`, including the past | Immediately or scheduled >= 5 min ahead | **deliberate non-port**: backdating is refused (plan 06:348) |
| Raw bps inputs with hard-coded defaults 3000/5000/5000/500 (`:93-106`) | Percent inputs prefilled from the active rule | **deliberate non-port**: no number in markup (R6) |
| `datetime-local` read as UTC (stored 8 h late, `:45-47`) | Taipei time, labelled | fixed |
| List all term versions (`listTermVersions`) | Terms index + per-document history | |
| Publish a term version from raw `clausesJson` with legal checkbox | Draft → preview → publish with legal checkbox | |
| Any term `effectiveFrom`, past or future | Effective on publish | **deliberate non-port**: a future pointer closes the wizard until then (section 4.5) |

### 4.17 Handoff to wp5 (admin retirement)

wp5's original contract table assumed WP2 builds on `listPriceVersions`/`publishPriceVersion` and
`listTermVersions`/`publishTermVersion`. WP2 actually calls only `publishPriceVersion` (extended, section 4.4); the
integration plan amended wp5's capability gate to match (plan §2.2, now in wp5 §4.1). After the `/admin` flip,
`listPriceVersions`, `listTermVersions` and `publishTermVersion` have no app caller (only
`tests/worker/admin-pricing-terms.test.ts`). WP2 keeps them (the legacy screens need them until the flip, R3); wp5
keeps them unchanged too, and wp7 removes them with their legacy test cases after wp5 (plan §9 C3 b). WP2's PR description states this, and WP2's `studio-terms.test.ts` covers the legal
gate and immutability on the Studio path so nothing is lost when the legacy term test goes. `SERVICE_CATALOG.name`
gets no WP2 reader (section 4.12).

---

## 5. File plan

### Create

| Path | Purpose |
| --- | --- |
| `migrations/0009_pricing_terms_studio.sql` | `price_version_publications`, `term_drafts`, immutability triggers (section 7). The number is fixed by the plan (§2.1): wp3 uses `0010_cms_footer_groups.sql`, nobody renumbers |
| `app/lib/pricing/price-history.ts` | `classifyPriceVersions`, `ruleActiveAt`, `compareForActive`, `PriceVersionState` |
| `app/lib/pricing/percent.ts` | bps ↔ percent |
| `app/lib/time/taipei.ts` | Taipei time conversion and formatting (pricing, terms, public legal date) |
| `app/lib/pricing/sample-quotes.ts` | `includedSongsFor`, `priceRuleFromValues`, `sampleQuotes`, `priceChangeWarnings`, `extractTwdAmounts` |
| `app/lib/commission/availability.server.ts` | `getCommissionReadiness`, `loadCommissionWizard` |
| `app/lib/commission/term-outline.ts` | expected clause keys + English topics |
| `app/lib/cms/schemas/term-draft.ts` | `TermDraftSchema`, `validateTermClausesForPublish`, `diffClauses`, key regex, limits |
| `app/lib/cms/repositories/pricing.server.ts` | pricing loaders, form parsing, actions |
| `app/lib/cms/repositories/terms.server.ts` | terms loaders, draft save/publish/discard, actions |
| `app/routes/studio/services/pricing-edit.tsx` | `/studio/services/pricing/:serviceId` |
| `app/routes/studio/services/terms-edit.tsx` | `/studio/services/terms/:documentId/:locale` |
| `app/routes/studio/preview/terms.tsx` | `/studio/preview/terms/:documentId` |
| `app/components/legal/legal-pages.tsx` | `TermsPage`, `PrivacyPage` (extracted, unchanged markup) |
| `app/components/studio/pricing/pricing-index.tsx` | index screen |
| `app/components/studio/pricing/price-version-editor.tsx` | editor screen |
| `app/components/studio/pricing/price-history.tsx` | `PriceHistoryTable`, `PriceStateBadge` |
| `app/components/studio/pricing/quote-check.tsx` | sample-quote comparison + warnings |
| `app/components/studio/pricing/commission-readiness.tsx` | `CommissionReadinessTable` (also used by Terms) |
| `app/components/studio/pricing/fx-status.tsx` | `FxStatusPanel` |
| `app/components/studio/terms/terms-index.tsx` | index screen |
| `app/components/studio/terms/term-editor.tsx` | editor screen |
| `app/components/studio/terms/clause-fields.tsx` | clause rows for `ListEditor` |
| `app/components/studio/terms/term-history.tsx` | version history |
| `app/components/studio/terms/legal-review.tsx` | checkbox + disclaimer |
| `app/styles/studio/pricing.css`, `app/styles/studio/terms.css` | screen styles |
| `tests/unit/price-history.test.ts`, `tests/unit/pricing-helpers.test.ts`, `tests/unit/taipei-time.test.ts`, `tests/unit/term-draft.test.ts`, `tests/unit/studio-pricing-ui.test.tsx`, `tests/unit/studio-terms-ui.test.tsx`, `tests/unit/commission-rate-labels.test.tsx` | unit tests (section 6.1) |
| `tests/worker/studio-pricing.test.ts`, `tests/worker/studio-terms.test.ts`, `tests/worker/commission-availability.test.ts`, `tests/worker/migration-0009.test.ts` | worker tests (section 6.2) |
| `tests/e2e/commission-rates-terms.spec.ts` | loopback e2e (section 6.3) |
| `tests/e2e-studio/wp2-pricing-terms.spec.ts` | Studio e2e (section 6.4) |

### Modify

| Path | Change |
| --- | --- |
| `app/routes.ts` | 3 routes (section 4.2) |
| `app/routes/studio/services/pricing.tsx` | stub → index (`loadPricingIndex`, `handlePricingIndexAction`, links) |
| `app/routes/studio/services/terms.tsx` | stub → index (`loadTermsIndex`, links) |
| `app/lib/pricing/price-repository.server.ts` | tie-break join (4.3); use `includedSongsFor` |
| `app/lib/admin/service-catalog-service.server.ts` | `publishPriceVersion` writes metadata in one batch (4.4) |
| `app/lib/content/public-content.server.ts` | `listPublishedTerms(db, locale, kind, at = now)` with the `effective_from` filter, in place (4.7); nothing else in the file changes |
| `app/lib/cms/public/preview.server.ts` | `previewTerms` (4.7) |
| `app/routes/public/terms.tsx`, `app/routes/public/privacy.tsx` | thin routes over `legal-pages.tsx`; import paths, `handle` and `meta` exports stay (wp5, wp4 rely on them) |
| `app/components/legal/legal-document.tsx` | `formatLegalDate` prints the Taipei calendar date (4.7) |
| `app/routes/public/commission-service.tsx` | `loadCommissionWizard`, 404 instead of 500 (4.6) |
| `app/routes/public/commission-category.tsx` | readiness filter + empty state (4.6, 4.10) |
| `app/routes/api/commission-prepare.ts`, `app/routes/api/commission-submit.ts` | safe-code alignment; submit keeps the public code `service_unavailable` for the two new codes (4.6) |
| `app/components/commission/common-fields.tsx`, `simple-transition-fields.tsx`, `mix-fields.tsx`, `edit-transition-fields.tsx`, `commission-wizard.tsx` | `priceRule` prop, computed labels (4.8) |
| `app/components/services/price-figure.tsx` | `studentDiscountNote` via `bpsToPercentLabel` |
| `app/components/studio/services/price-fields.tsx`, `service-editor.tsx` | per-service Pricing link (4.9) |
| `app/components/studio/ui/use-editor-form.ts` | `saveIntent: null` (4.11) |
| `app/components/studio/ui/editor-state.ts` | `legalReviewConfirmed` in `IGNORED_FIELDS` (4.9, 4.11) |
| `app/lib/cms/types.ts` | new issue codes (4.13) |
| `tests/e2e/studio-access.spec.ts` | new paths and mutations refused (6.3) |
| `tests/worker/price-repository.test.ts`, `tests/worker/admin-pricing-terms.test.ts` | added cases (6.2) |
| `tests/unit/studio-p4-services.test.tsx`, `tests/unit/studio-shell.test.tsx` | updated/added assertions (6.5) |
| `docs/admin-architecture.md` | §2.1 tree and §2.2 rows for the new routes and intents (`publish-price-version`, `cancel-scheduled`, `refresh-fx`, `save`, `publish-term-version`, `discard-draft`); §2.4 preview list gains `terms/:documentId` |
| `docs/content-schema.md` | §2.6 note (tie-break by publish time) and table definitions for `price_version_publications`, `term_drafts`; §3 migrations table: row for the WP2 migration; §5 repository signatures for `pricing.server.ts` and `terms.server.ts`; §6.2 rows |
| `docs/content-architecture.md` | §3.5 (publish metadata and tie-break); §6.4 (Studio term drafts, effective on publish); §9 I line `:795-796`: `service-catalog-service` is reused with the additive `publishPriceVersion` metadata change (4.4) |
| `docs/information-architecture.md` | `/commission/:category` notes (`:52`, `:424`): lists only open services (active price + effective terms), bilingual empty state when none; the wizard of a closed service is a 404 |

### Delete

None. `app/routes/admin/services.tsx`, `app/routes/admin/terms.tsx` and `StubPanel` stay: the legacy panels must
work until the `/admin` flip (R3), which wp5 performs together with deleting them, `SERVICE_CATALOG.name`
(section 4.12) and `stub-panel.tsx` once no stub imports it. `app/lib/admin/service-catalog-service.server.ts` stays
as the reused service layer (R23); `term-service.server.ts` stays for the legacy `/admin/terms` until the flip, and
afterwards wp7 removes its two legacy-only functions (section 4.17; plan §9 C3 b).

---

## 6. Test plan

Run before handoff: `npm run check` (format, typecheck, unit, worker, apps-script, build), `npm run test:e2e:ci`
(rerun once on an all-ECONNREFUSED run, a known harness flake), `npm run test:e2e:studio`.

Worker-test rule: price and term versions are immutable and a test file shares one database across its tests, so
every test passes an explicit `now`, uses its own service or document, and never assumes another test's rows are
gone.

### 6.1 Unit (`vitest.config.ts`)

| File | Key assertions |
| --- | --- |
| `price-history.test.ts` | states for a fixture set (active, superseded, scheduled, replaced, retired); same `effective_from`: later `publishedAt` wins, published beats unpublished; `ruleActiveAt` before/at/after a boundary; `compareForActive` equals the SQL order on hand-built rows |
| `pricing-helpers.test.ts` | `percentInputToBps`: "30"→3000, "5"→500, "12.5"→1250, "7.25"→725, "0.07"→7 (float trap), "100"→10000, "12.345"/"-1"/"101"/"100.01"/"abc"/""→null; `bpsToPercentLabel`: 3000→"30", 1250→"12.5", 725→"7.25", 7→"0.07"; `sampleQuotes("full_mix", seed rule)` includes the 8,680 total (8000 + 4000 + 400 = 12,400, −3,720) as in `final-acceptance.spec.ts:112-115`; simple 8 songs = 1,000 + 3 × 200; `extractTwdAmounts("NT$8,000 … NT$ 1,000 … NT$200 … 新臺幣 4,000 元 … TWD 800 … US$260.00 … 50%")` = [8000, 1000, 200, 4000, 800]; `priceChangeWarnings` flags > 50 % changes only |
| `taipei-time.test.ts` | `taipeiLocalToIso("2027-01-01T00:00")` = `2026-12-31T16:00:00.000Z`, malformed → null; round trip `isoToTaipeiLocal`; `taipeiDate("2026-10-12T17:30:00.000Z")` = `2026-10-13`; `formatLegalDate("2026-08-10T00:00:00Z")` = `2026.08.10` (fixture unchanged) and `formatLegalDate("2026-10-12T17:30:00.000Z")` = `2026.10.13`; `serializeForm` of a FormData with `legalReviewConfirmed=on` equals the one without (Node has `FormData`) |
| `term-draft.test.ts` | draft schema accepts empty rows and 0 clauses, refuses 101 clauses / 8,001-char text / bad key characters; publish validation: duplicate key, empty fields, unchanged vs live, too large; warnings for missing expected keys (common vs service docs; privacy none) and NT$ amounts not in the active rule (mixing message names no per-song amount); parity: a strict-valid draft passes `parseTermClauses`, each limit + 1 fails both; `diffClauses` added/removed/changed/unchanged |
| `studio-pricing-ui.test.tsx` (render with `createRoutesStub` like `studio-p4-services.test.tsx:15-29`) | index shows NT$8,000 / NT$4,000 / NT$1,000 + "NT$200 per song" / NT$4,000 + "NT$800 per song", rates "Student 30%", readiness words, FX states; full_mix editor: inputs `baseTwd:number` = 8000, student = 30, rush = 50, source prep = 5; **no** input named per-song or consultation; carried text "Consultation 50%"; no `placeholder` containing a digit; Publish button label "Publish now"; hidden `expectedVersionCount`; history badges with words; scheduled row has "Cancel scheduled change" inside its own `<form>` and no `<form>` is nested in another; no "Save and leave" text; simple_transition editor has all six inputs |
| `studio-terms-ui.test.tsx` | index matrix (Not published / v1 live / Draft marker); editor: clause inputs carry `lang="zh-Hant"` (zh) / `lang="en"` (en); legal checkbox present, unchecked, disclaimer text "does not replace professional legal advice"; "Publish ZH version"; "Preview changes" present; hidden `locale` = the editor locale; expected outline lists `payment_methods` for `common`; history renders LIVE marker; start-over options do not contain fixture text (static markup only: the unit environment is Node without a DOM, so dirty tracking, restore and dialogs are covered by the Studio e2e, section 6.4) |
| `commission-rate-labels.test.tsx` | `CommonFields` + `SimpleTransitionFields` with the seed rule render exactly the current zh/en labels (section 4.8); with 2500/6000/750/4000 bps they render 25 % / 60 % / 7.5 % / 40 %; `studentDiscountNote("en", 1250)` contains "12.5%" |

### 6.2 Worker (`vitest.worker.config.ts`, migrated D1)

| File | Key assertions |
| --- | --- |
| `migration-0009.test.ts` | tables exist; seeds unchanged: exactly the four `*-2026-08-10` rows with 8000/0/3000/5000/5000/500, 4000/0/…, 1000/200/…, 4000/800/…; no rows in the new tables; re-running the migration with `applyMigrationQueries(env.DB, env.TEST_MIGRATIONS, ["0009_pricing_terms_studio"])` (the **full file stem**: the helper matches by prefix, `tests/helpers/cms.ts:128-139`, so the stem keeps the test exact whatever other file names appear later) changes nothing; UPDATE/DELETE on `price_version_publications` raise `price_version_immutable`; inserting a NULL `version_id` fails (NOT NULL); `term_drafts` CHECKs (locale, revision, non-array body) |
| `price-repository.test.ts` (added) | two versions at the same future instant: the later `published_at` is active from that instant; a published row beats a metadata-less row at the same instant; seeds unchanged without metadata |
| `admin-pricing-terms.test.ts` (added) | `publishPriceVersion` writes one metadata row (`action = 'publish'`) in the same batch; existing assertions unchanged |
| `studio-pricing.test.ts` | `loadPricingIndex` returns the four services with the exact seed values and names from the services rows; FX state ok/stale/missing from inserted rows; `refresh-fx` with an injected fetcher (success writes `fx_rates`; failure → 503 `fx_refresh_failed`); publish now (vocal_mix, `now` = 2026-11-01) makes the new rule active at that `now`, metadata `publish`, case `locked_price_minor` untouched; unchanged + now → 422 `unchanged`; past schedule → 422 `effective_in_past`; carried fields: posting `perSongAfterFiveTwd:number=999` for full_mix is ignored (stored 0); percent `12.345` → 422; scheduled (edit_transition) → state scheduled, active unchanged; same-time publish → `replace` with `replaces_version_id`, replacement active at that time; `cancel-scheduled` → copy of the baseline at the exact `effective_from`, `action = 'cancel'`, rule at that time equals the prior rule; cancel on an active version → 409; stale `basedOnVersionId` → 409; stale `expectedVersionCount` on publish and on cancel → 409 and no row inserted; scheduled with values identical to the baseline → published with an `unchanged` **warning**; no baseline (`now` = 2026-01-01, scheduled `T` = 2026-02-01, before the 2026-08-10 seeds) → 409 `invalid_state`, nothing inserted; percent posted as "0.07" stores 7 bps; unknown service → 404 Response; unknown intent → 422; property check: for every service and several `now` values, `classifyPriceVersions(...).find(active).id === getActivePriceRule(now).versionId` |
| `studio-terms.test.ts` | index: 6 documents x 2 locales, no live, no drafts on a fresh DB; save creates revision 1 with `base_version_id` = pointer; save with stale revision → 409; identical save → no bump; publish without `legalReviewConfirmed` → 422 and no draft row created/changed; publish with blocking issues → `published: false`, draft saved; publish → version 1 (then 2), pointer moved, `effective_from` = `now`, draft deleted, `listPublishedTerms` returns the new clauses, `term_versions` row immutable; concurrent revision change between save and publish batch → 409 and nothing inserted; a legacy `publishTermVersion` between save and publish → the Studio publish takes the next number (D1 runs batches one at a time, so `MAX + 1` cannot collide); publish with no draft and the form equal to live → `published: false` with `unchanged`, no row anywhere; discard → row gone, stale discard → 409; brand warning is a warning (publish still succeeds with a "Kevin" clause and the checkbox); `price_mention` warning for a service doc mentioning NT$9,000; `previewTerms` with a posted `locale` different from the requested one → `PreviewFormError`; unknown document/locale → 404 |
| `commission-availability.test.ts` | fresh DB: price active for all 4, terms missing → `open` false for both locales with the missing ids; after publishing common + privacy + full-mix in zh only → `open.zh` true for full_mix only; `loadCommissionWizard` → null without terms, data with terms; en with no FX row → `fxSnapshot: null` (no throw); a future pointer (inserted directly) is not ready until its time; `listPublishedTerms` excludes a future pointer (time filter) |
| `public-content.test.ts` | not edited by WP2 (wp5 moves it to `public-terms.test.ts`); the time-filter case lives in `commission-availability.test.ts`, and the existing call without `at` keeps passing because its pointer is in the past |

### 6.3 Loopback e2e (`npm run test:e2e:ci`, production build, fixtures)

- `tests/e2e/studio-access.spec.ts`: add `/studio/services/pricing`, `/studio/services/pricing/full_mix`,
  `/studio/services/terms`, `/studio/services/terms/common/zh`, `/studio/preview/terms/common?locale=zh` to
  `STUDIO_PATHS` (403, `no-store`, `X-Robots-Tag`, body without `csrfToken`); add POSTs to
  `/studio/services/pricing/full_mix` and `/studio/services/terms/common/zh` → 403.
- New `tests/e2e/commission-rates-terms.spec.ts`:
  - `/zh/commission/song-transition/simple` has checkboxes labelled exactly `申請學生優惠（所有計價 -30%）`,
    `詢問急件（服務基價 +50%）`, `需要素材整理（服務基價 +5%）`, `需要協助決定順序或銜接點（服務基價 +50%）`; `/en/...`
    the English equivalents (proves the labels come from the rule and match today's copy);
  - `/zh/terms` shows the fixture documents with "生效日 2026.08.10"; `/en/privacy` shows "Data processing";
  - `/zh/commission/mixing` still lists both mixing services (readiness open with the fixture).
- **Existing assertions that change: none.** All NT$/US$ figures, the 8,680 quote, headings, footer counts and the
  `/admin` 403 stay as they are, because prices and terms come from the same rows and the label strings are
  byte-identical for the seeded rule.

### 6.4 Studio e2e (`npm run test:e2e:studio`, dev owner, persistent local D1)

New `tests/e2e-studio/wp2-pricing-terms.spec.ts` (per-run `token` as in `p1-projects.spec.ts:9`). The harness
uses the developer's **persistent** local D1 (`harness.ts:71-89`, `kamelkyp-com --local`), which the owner may
also use by hand, so this spec asserts consistency, not seed values: the exact figures (8,000 / 4,000 / 1,000 +
200 / 4,000 + 800, 30/50/50/5 %, the 8,680 sample) are asserted on fresh databases by `studio-pricing-ui.test.tsx`,
`studio-pricing.test.ts`, `pricing-helpers.test.ts` and the loopback suite. The spec never clicks "Refresh now"
(the harness `FX_API_URL` is a real upstream, `harness.ts:39`).

1. **Pricing index**: `openStudio(page, "/studio/services/pricing")`; heading "Pricing"; four service rows, each
   with an `NT$` base figure and a version id; the availability table and the FX panel are present (local FX may be
   missing).
2. **Price editor checks, nothing published**: open `/studio/services/pricing/full_mix`; record the prefilled base,
   student, rush and source-prep values and assert the index showed the same base; no per-song/consultation inputs;
   the Check row "rush + source prep + student" equals `calculateQuote` of the recorded values (computed in the test
   with the same pure function); "Publish now" with unchanged values → inline "Nothing changed"; scheduled with a
   past time → inline time error; `ControlOrMeta+s` submits nothing (no toast, no request to the action); the leave
   guard appears after an edit, offers no "Save and leave", and "Stay" keeps the value.
3. **Schedule without changing a price**: choose "At a scheduled time", enter the **fixed** instant
   `2099-01-01T00:00` (Taipei), keep the active values, click "Schedule for 2099-01-01 00:00" → toast starting with
   "Scheduled for 2099-01-01 00:00" (a `replace` appends " (replaces the earlier change)", so assert the prefix);
   the history shows a "Scheduled" row at that time and the active row keeps the version id
   recorded in step 2. Side effect (stated in the e2e file header): one immutable row per run in the local D1, all
   at the same instant, so reruns become `replace` rows of a single scheduled group (never active before 2099,
   values identical to the active rule at run time) instead of an ever-growing list of scheduled changes.
4. **Terms draft lifecycle, nothing published**: record the index cell text of Privacy notice · EN; open
   `/studio/services/terms/privacy/en`; add a clause (key `wp2_e2e_<token>`, title, text); Mod+S → `SAVED hh:mm`;
   reload → values persist (server draft); the index shows a Draft marker for Privacy notice · EN; tick and untick
   the legal checkbox → the save state stays `SAVED` (not form content); click Publish without the checkbox → the
   checkbox is focused, inline error, and the index cell's live part is unchanged from the recorded text; "Preview
   changes" → the preview shows the clause title under the PREVIEW bar; "Discard draft" → dialog → confirm → index
   shows no draft marker.
5. **Term editor guard**: (a) edit a title, click the Terms breadcrumb → "Leave without saving?" → Stay keeps the
   value; (b) without typing, click "Add clause" (or move a clause down) and click the breadcrumb → the guard
   appears too (list changes mark the form dirty, section 4.9); Discard leaves.

### 6.5 Existing unit assertions that change

- `tests/unit/studio-p4-services.test.tsx:114`: the render at `:103-110` passes `commissionServiceId="full_mix"` and
  the assertion becomes `href="/studio/services/pricing/full_mix"` (PriceFields now links to the service's own
  pricing page). "Change in Pricing" stays. The "no active price" case (`:117-…`) keeps its assertions.
- `tests/unit/studio-shell.test.tsx`: add `activeNavItem("/studio/services/pricing/full_mix")?.label === "Pricing"`
  and `activeNavItem("/studio/services/terms/common/zh")?.label === "Terms"` (additions only).
- `tests/unit/studio-route-guards.test.ts` needs no edit: it globs the new modules and requires
  `withOwner`/`withOwnerMutation`.

---

## 7. Migration

One new file, numbered after the latest (`0008_cms_sample_drafts.sql`): **`migrations/0009_pricing_terms_studio.sql`**.
Additive and re-runnable: only `CREATE TABLE IF NOT EXISTS` and `CREATE TRIGGER IF NOT EXISTS`, no `ALTER`, no
data.

**Numbering (fixed by the integration plan §2.1).** WP2 ships `0009_pricing_terms_studio.sql`; wp3 ships
`0010_cms_footer_groups.sql` (`2026-10-13-wp3-footer.md` §7); nobody renumbers, whatever order they merge in. Both
files are independent (no shared table) and idempotent, and `wrangler d1 migrations apply` applies every unapplied
file by name, so either landing order works; WP2 before wp3 is preferred so production applies them in numeric
order. (An earlier draft of this section had "the second to merge renumbers"; it is superseded.)

```sql
-- 0009: Studio → Pricing and Terms (docs/superpowers/specs/2026-10-13-wp2-pricing-terms.md).
-- Additive and re-runnable. Inserts no price or term content.

-- Publish metadata for immutable price versions. Breaks ties between versions
-- with the same effective_from (latest publish wins) and records replacements
-- and cancellations of scheduled changes without touching price_versions.
CREATE TABLE IF NOT EXISTS price_version_publications (
  -- NOT NULL is explicit: a non-INTEGER PRIMARY KEY in SQLite accepts NULL otherwise.
  version_id TEXT NOT NULL PRIMARY KEY REFERENCES price_versions(id),
  published_at TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'publish'
    CHECK (action IN ('publish', 'replace', 'cancel')),
  replaces_version_id TEXT REFERENCES price_versions(id),
  CHECK ((action = 'publish') = (replaces_version_id IS NULL))
);

CREATE TRIGGER IF NOT EXISTS price_version_publications_immutable_update
BEFORE UPDATE ON price_version_publications
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS price_version_publications_immutable_delete
BEFORE DELETE ON price_version_publications
BEGIN
  SELECT RAISE(ABORT, 'price_version_immutable');
END;

-- One mutable working copy per legal document and locale. Never read by a
-- public route; publishing copies it into term_versions and deletes it.
CREATE TABLE IF NOT EXISTS term_drafts (
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  body_json TEXT NOT NULL
    CHECK (json_valid(body_json) AND json_type(body_json) = 'array'),
  base_version_id TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, locale)
);
```

- `base_version_id` has no FK on purpose: the loopback cleanup (`tests/fixtures/terms-e2e-cleanup.sql`) deletes
  fixture versions, and a draft must never block that.
- Deploy order is already right: both deploy workflows run `d1 migrations apply` before the Worker deploy
  (`deploy-preview.yml:84`, `deploy-production.yml:88`); the loopback runner and the Studio harness apply all
  migrations. The new `getActivePriceRule` joins `price_version_publications`, so this code must never run against a
  database without 0009 (the workflows guarantee it). Local development by hand is the exception: a local D1
  without 0009 would make the wizard 500 and silently hide public prices (`activeBaseTwd` swallows errors,
  `services.server.ts:39-49`). The PR description tells the owner to run `npx wrangler d1 migrations apply
  kamelkyp-com --local --config wrangler.base.jsonc` after pulling (the Studio harness already does it).
- Rollback: an older Worker ignores both tables; nothing existing changes shape.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| The tie-break join touches the quote-critical query | No current ties, so no result changes; repository tie tests + the classifier property test; e2e price figures unchanged |
| Production launch with no terms: every wizard URL 404s and the choosers show the empty state | Intended fail-safe (was a 500). The Studio readiness table says exactly which documents are missing; Kevin writes and publishes them after legal review (R14). Not WP2: a Studio home "Needs attention" row "Commission form closed" via `getCommissionReadiness`; wp1 edits `studio-home.server.ts`, so it is assigned to wp7 (plan §9 C3 f), after both land |
| Legacy `/admin/terms` (until the flip) can still set a future pointer | Readers agree on `effective_from <= now`, so `/terms` and the wizard stay consistent; the Studio index flags "Not yet effective" |
| Term texts embed prices and percentages (the fixture does) and can drift after a price change | NT$ / 新臺幣 / TWD mention warnings in both editors; percentages cannot be matched reliably, so the pricing publish note reminds to review the terms |
| Legal effective date shown as the UTC day | `formatLegalDate` prints the Taipei calendar day (section 4.7); fixture dates unchanged |
| Studio e2e leaves one immutable 2099 row per run in the developer's persistent local D1 | One fixed instant, so the rows form a single scheduled group (reruns are `replace`); values identical to the active rule; never active before 2099; documented in the e2e header; worker and loopback databases are fresh |
| `app/routes.ts`, `public-content.server.ts`, `catalog.ts`, `tests/unit/studio-shell.test.tsx` are also touched by wp5 (admin retirement) | WP2 only adds lines inside the Studio block of `routes.ts` (wp5 edits the `/admin` block); `listPublishedTerms` stays in place with the same import path (wp5 §4.7); WP2 never reads `SERVICE_CATALOG.name`, so wp5 removes it; in `studio-shell.test.tsx` WP2 only adds `activeNavItem` cases while wp5 removes the `StubPanel` case. WP2 does not edit `app/styles/commission.css` (the wp6 coordination note on it does not apply). Whichever package lands second rebases |
| `ListEditor` keeps rows in local state, so "Start over"/"Use as starting point"/backup restore must remount, and add/remove/move fire no input event | Keyed remount + `editor.onInput()`; `MutationObserver` for list changes; confirm dialog when dirty; covered by the Studio e2e (the unit environment has no DOM) |
| Migration number collision with wp3 | Resolved up front: WP2 owns `0009`, wp3 `0010` (plan §2.1, section 7); the migration test applies by full file stem |
| wp4-seo edits the same public routes: `meta` of `terms.tsx`/`privacy.tsx`/`commission-category.tsx` (new `pageMeta` signature, `noindex`), a new `meta` on `commission-service.tsx` reading `loaderData.serviceName`, and a test that every public route exports `meta` | WP2 keeps `meta`/`handle` in the route modules and the wizard loader's return shape (sections 4.6, 4.7); conflicts are textual, the second to land rebases |
| wp6-hygiene fixes the fetcher "settled" detection in shared hooks and bans the old pattern statically; it also edits `use-editor-form.ts:160-182` | WP2 components use only the shared hooks or `fetcher.data` identity (section 4.9); WP2's `use-editor-form.ts` hunk is the signature and the Mod+S effect (`:104-117`, `:184-195`), no overlap |
| A visitor with the wizard open during a price or terms publish | Price: locked at the rule active at submit (plan 04/06 design, `clientClaimedTotal` ignored); terms: submit refused with a generic message until reload. The Studio notes say so (section 4.9) and recommend scheduling price changes. A dedicated "terms changed, reload" message with revalidation is assigned to wp7 (plan §9 C3 g), not WP2 |
| wp5 expects WP2 to call `listPriceVersions`, `listTermVersions`, `publishTermVersion` | Section 4.17 states that only `publishPriceVersion` is reused; the plan amends wp5's capability gate accordingly (plan §2.2, wp5 §4.1), wp5 keeps the three legacy-only functions unchanged, and wp7 removes them after wp5 (plan §9 C3 b) |
| Taipei time is assumed for Studio date entry | Fixed +08:00 (no DST), labelled on the field, precedent `commission-success.tsx:71`; stored values are UTC ISO |
| Very long legal texts exceed D1 row size | 1,000,000-byte body cap enforced on save and publish |
| Worker tests share one database per file and rows are immutable | Explicit `now`, distinct services/documents per test, no order dependence |

---

## 9. Owner decisions

1. **Operator identity in the legal texts** (content-architecture.md:584-592, §8 item 6): whether "Kamel" is
   enough or a legal name must appear (for example in the privacy notice). Content only: the code ships either way
   (terms are not brand-blocked; the editor warns). Never affects prices.

Everything else is decided in this spec from the docs: price versions stay immutable, the Studio adds metadata
rather than editing rows; terms take effect on publish; prices have no server draft; Studio times are Taipei;
`catalog.ts` stays structure-only; the legacy non-ports of section 4.16 (no backdated prices, no scheduled terms)
follow plan 06 and the pointer model.

---

## 10. Acceptance criteria

- [ ] `/studio/services/pricing` lists the four commission services with the exact seeded values (8,000 / 4,000 /
      1,000 + 200 / 4,000 + 800; 30 % / 50 % / 50 % / 5 %), names from the `services` rows, next scheduled change,
      commission availability per locale and the FX status with "Refresh now".
- [ ] `/studio/services/pricing/:serviceId` prefills only from the active rule, shows unused fields as carried
      text, checks sample quotes with `calculateQuote` (8,680 sample for full mix), refuses unchanged/backdated/
      malformed versions (422), stale pages (409 on `basedOnVersionId` or `expectedVersionCount`) and a missing
      baseline (409, nothing invented), publishes now or schedules (Taipei time) through `publishPriceVersion`, and
      never updates or deletes a `price_versions` row. Percent input is converted without float error.
- [ ] A scheduled change can be replaced (same time, later publish wins) and cancelled (copy of the baseline at the
      same time); history shows Active / Scheduled / Superseded / Replaced / Retired with words.
- [ ] `getActivePriceRule` breaks ties by latest publish; every public price (service pages, area pages, home,
      `/services`, category chooser, wizard, prepare, submit) still comes from it; existing e2e figures unchanged.
- [ ] `/studio/services/terms` shows 6 documents x 2 locales with live version, draft marker and readiness.
- [ ] The term editor saves a server draft (revision-checked, survives reload), previews the real public page
      (GET saved draft, POST unsaved form), validates (unique keys, required fields, unchanged), warns (expected
      clauses, NT$ mentions, personal names, outdated base) and publishes only with the legal-review checkbox and its
      "does not replace professional legal advice" note; publish creates the next immutable version, moves the
      pointer with `effective_from = now` and deletes the draft atomically; discard needs a confirm.
- [ ] In the term editor, adding, removing or moving a clause marks the form dirty (leave guard, backup); a backup
      restore brings back added clauses; the legal checkbox never makes the form dirty, is never backed up and is
      never restored; "Preview changes" always previews the editor's own locale (other locale → 422).
- [ ] `/terms`, `/privacy` and the wizard use the same "effective now" rule; the public markup of `/terms` and
      `/privacy` is unchanged and both routes keep their `meta` exports; effective dates print the Taipei calendar
      day (fixtures still read 2026.08.10).
- [ ] The wizard 404s (not 500) without an active price or terms; the English wizard loads with "USD unavailable"
      when FX is missing or stale; the category chooser shows only open services and an empty state when none is
      open.
- [ ] Wizard rate labels and the student note come from the active rule and read exactly as today for the seeds.
- [ ] `catalog.ts` holds no prices and WP2 adds no reader of the deprecated `name` (its removal belongs to wp5,
      section 4.12); the PR description records the section 4.17 handoff.
- [ ] The safe-code alignment logs the real cause; the submit route still answers the public code
      `service_unavailable` for a closed service.
- [ ] Migration `0009_pricing_terms_studio.sql` (fixed number, plan §2.1) is additive, inserts nothing,
      has `NOT NULL` on `price_version_publications.version_id`, and re-runs without change (test applies it by its
      full file stem).
- [ ] Every new Studio loader/action is `withOwner`/`withOwnerMutation`; the loopback suite proves 403 on the new
      paths; responses carry `no-store` and `X-Robots-Tag`.
- [ ] Mod+S saves term drafts; on the pricing editor it submits nothing and still suppresses the browser save
      dialog; publishing always needs a click; the pricing leave guard has no "Save and leave".
- [ ] No WP2 Studio module uses the busy-state-only fetcher pattern (wp6 static ban passes once both land).
- [ ] No inline styles, no new dependency, no personal name in public output, no invented number anywhere.
- [ ] `npm run check`, `npm run test:e2e:ci` and `npm run test:e2e:studio` pass; docs updated per the file plan.

---

## 11. Review notes (adversarial review, 2026-10-13)

Every file:line claim was checked against `origin/main` 6bd682a and the five sibling specs. Changes made in place:

1. **Wrong citations fixed.** Price seeds are in `0002_price_terms.sql:1-15` (not `0001_core.sql:256-270`; that
   file has 255 lines); `term_documents` seeds are `0002_price_terms.sql:17-23`; the immutability triggers are
   `0004_admin_revision.sql:21-43` (the file has 56 lines); the PriceFields assertion is
   `studio-p4-services.test.tsx:114`. Sections 2, 3.1, 6.5.
2. **Migration number collision.** wp3 also plans `0009_cms_footer_groups.sql`. Added the "second to merge
   renumbers" rule. The re-run test now applies the migration by its full file stem, because
   `applyMigrationQueries` matches by prefix and `"0009"` would also re-run wp3's file. Sections 5, 6.2, 7.
3. **SQLite NULL primary key.** `version_id TEXT PRIMARY KEY` accepts NULL in SQLite. Changed to `NOT NULL` and
   added a test. Section 7.
4. **Price concurrency gap.** `basedOnVersionId` cannot see another tab scheduling at the same instant, which
   would silently turn this publish into a `replace`, or a new scheduled version moving the baseline. Added the
   insert-only `expectedVersionCount` token to publish and cancel (409). Sections 4.3, 4.4, 4.13, 6.2.
5. **No-baseline case** was undefined (carried fields would have had no source). It now answers 409
   `invalid_state` and inserts nothing, so no price is ever invented. Sections 4.3, 6.2.
6. **Percent float error.** Converting percent to bps through `Number * 100` can be off (`0.07 * 100`). The
   conversion now uses string arithmetic and posts plain fields, with tests. Sections 4.3, 6.1.
7. **Nested forms.** The per-row "Cancel scheduled change" form would have been nested inside the price form.
   HISTORY now sits outside the form and each row has its own small form. Section 4.3.
8. **Mod+S on the pricing editor.** With the original `null` → "skip the handler", Mod+S would have opened the
   browser's save dialog (admin-architecture §4.7). Today's code would post an intent-less form there. Now the
   key is suppressed and nothing is submitted. The pricing leave guard has no "Save and leave". Sections 4.9,
   4.11.
9. **Legal checkbox leaked into dirty tracking and backups.** `serializeForm` would have stored
   `legalReviewConfirmed`, and a restore would have re-ticked it, contradicting "never pre-checked, never
   stored". Added it to `IGNORED_FIELDS` (`editor-state.ts`). Sections 4.9, 4.11, 5, 6.1.
10. **ListEditor changes were invisible.** Adding, removing or moving a clause fires no input event, and
    `applyFields` cannot restore clauses that no longer exist. The term editor now uses a MutationObserver (the
    `use-form-watch.ts` technique) and rebuilds the list on restore. These are tested in the Studio e2e, because
    unit tests run in Node without a DOM. Sections 4.9, 6.1, 6.4.
11. **Unsaved term preview.** "Preview changes" was missing from the editor UI (R19). `PreviewPane`'s own ZH/EN
    toggle could also have posted a ZH draft into the EN page. The editor now posts with its own locale, and
    `previewTerms` refuses a mismatch (422). Sections 4.7, 4.9, 4.13.
12. **Publish with nothing to publish.** If there is no draft and the form equals the live version, the publish
    now returns `published: false` with `unchanged` instead of running an empty batch. The batch error mapping
    is documented (D1 serializes batches; UNIQUE is only a defensive fallback). Section 4.5.
13. **Client-only schema imported a `.server` module.** `term-draft.ts` may only import the `TermClause` type
    from `terms-repository.server.ts`. A parity test was added. Section 4.5.
14. **Inaccurate safe-code claim.** The prepare route returns the safe code to callers. In the submit route,
    adding the codes would have flipped the public code from `service_unavailable` to `validation_failed`
    ("check the details"), which is wrong for a closed service. Submit now keeps `service_unavailable` for these
    codes. Section 4.6.
15. **Untruthful Studio notes.** The wizard is not re-quoted on screen: `clientClaimedTotal` is ignored by design
    (plan 04 test) and the price locks at submit. A visitor whose terms changed gets a generic error and must
    reload. Both notes now describe what the code actually does, and a risk row records the follow-up. Sections
    4.6, 4.9, 8.
16. **Legal date shown as the UTC day.** With publish-time effective dates, a publish between 00:00 and 08:00
    Taipei would print the previous day on `/terms` and `/privacy`. `formatLegalDate` now prints the Taipei day
    (fixtures unchanged), using the new neutral `app/lib/time/taipei.ts`, which replaces
    `app/lib/pricing/effective-time.ts`. Sections 4.4, 4.7, 5.
17. **wp4 conflicts.** wp4 rewrites `meta` on `terms.tsx`, `privacy.tsx` and `commission-category.tsx`, adds a
    `meta` export to `commission-service.tsx` that reads `loaderData.serviceName`, and requires every public
    route to export `meta`. WP2 keeps those exports and the wizard loader's shape. Sections 4.6, 4.7, 8.
18. **wp6 conflicts.** New screens must not use the busy-state-only fetcher pattern that wp6 bans statically.
    The `use-editor-form.ts` hunks do not overlap. Sections 4.9, 8, 10.
19. **wp5 contract mismatch.** wp5 assumes WP2 calls `listPriceVersions`, `listTermVersions` and
    `publishTermVersion`, but WP2 calls only `publishPriceVersion`. Added an explicit handoff (section 4.17) and a
    legacy parity table that lists the deliberate non-ports: backdated prices, hard-coded bps defaults, scheduled
    terms (section 4.16). The additive change to `publishPriceVersion` is now named as a deviation from
    content-architecture's "unchanged" and goes into the doc updates.
20. **Studio e2e brittleness and pollution.** The harness uses the persistent local D1 and a real FX upstream.
    The Studio e2e now asserts consistency instead of seed figures (exact figures stay in the unit, worker and
    loopback suites on fresh databases). It schedules at one fixed 2099 instant, so reruns become `replace`
    rows, compares index text before and after instead of assuming "Not published", and never clicks "Refresh
    now". Section 6.4.
21. **Smaller fixes.**
    - Readiness EN cells show the FX state.
    - FX status uses the public readers' UTC-date basis, and `refresh-fx` maps both thrown codes.
    - The `price_mention` message names only the amounts the service actually uses.
    - `extractTwdAmounts` also reads 新臺幣/新台幣/TWD.
    - Identical scheduled values get a warning.
    - `otherLocaleKeys` has a defined source.
    - `PriceFields` falls back to the generic link when there is no service id.
    - Doc updates now include content-schema §3/§5, content-architecture §3.5/§6.4/§9 and
      information-architecture (the empty state and the closed-service 404).
    - Acceptance criteria were reworded so WP2 no longer claims wp5's removal of `SERVICE_CATALOG.name`.

Not changed:

- The owner decision in section 9 stays. It is a content decision already tracked as content-architecture §8
  item 6, and it does not block the code.
- Two follow-ups are out of scope and recorded in section 8: a "terms changed, reload" message plus revalidation
  in the public wizard, and a Studio home attention row for "commission form closed" (wp1 edits
  `studio-home.server.ts`).

Integration-plan completeness review (2026-10-13, plan §9): item 2's "second to merge renumbers" rule is superseded by
the fixed numbers of plan §2.1 (sections 5, 6.2, 7, 8, 10 updated). The two follow-ups above are assigned to wp7
(plan §9 C3 f, g), and the three legacy-only service functions of section 4.17 are removed by wp7 (C3 b). New
modules import `LocalizedText` from `app/lib/cms/types.ts` (plan §2.9), because wp5 deletes the copy in
`app/lib/services/catalog.ts`.
