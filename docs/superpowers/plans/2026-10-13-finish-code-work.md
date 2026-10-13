# Finish code work: integration plan (WP1–WP7)

Status: integration plan, 2026-10-13. Base: `origin/main` 6bd682a. Plan only: it changes no application code.

Inputs (all reviewed and revised; each spec wins on its own details, this plan wins on branching, ordering,
file ownership and the cross-package corrections in §2):

| WP | Spec |
| --- | --- |
| wp1-commissions | `docs/superpowers/specs/2026-10-13-wp1-commissions.md` |
| wp2-pricing-terms | `docs/superpowers/specs/2026-10-13-wp2-pricing-terms.md` |
| wp3-footer | `docs/superpowers/specs/2026-10-13-wp3-footer.md` |
| wp4-seo | `docs/superpowers/specs/2026-10-13-wp4-seo.md` |
| wp5-admin-retirement | `docs/superpowers/specs/2026-10-13-wp5-admin-retirement.md` |
| wp6-hygiene | `docs/superpowers/specs/2026-10-13-wp6-hygiene.md` |
| wp7-final-sweep | §9 C3 of this plan (its spec; added by the completeness review, §9) |

Each spec header names its own package branch (§1). `claude/finish-code-work` only carries the six specs and this
plan (wave 0, §4.1). Where a spec and §9 (Critic notes) disagree, §9 wins, like §2.

Standing rules for every package (Kevin): the only public identity is Kamel (no personal-name variant in pages, meta,
OG, JSON-LD, footer, a11y labels, seeds; `app/lib/cms/brand-guard.server.ts` enforces it); never invent pricing (strict
`NT$` values and `US$260.00` assertions stay untouched); sample/`TODO_CONTENT` content never becomes public; the Studio is
KAMEL STUDIO under `/studio` behind Cloudflare Access; exact-pinned dependencies; `package-lock.json` changes only through
the "Refresh lockfile" workflow (`.github/workflows/lockfile.yml`).

---

## 1. Overview

| WP | Size | Depends on | Branch | Cut from | Wave | Merge slot | Migration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| wp6-hygiene | M | none | `claude/wp6-hygiene` | `origin/main` 6bd682a | 1 | 1st | none |
| wp1-commissions | M | none | `claude/wp1-commissions` | `origin/main` 6bd682a | 1 | 2nd | none |
| wp2-pricing-terms | L | none | `claude/wp2-pricing-terms` | `origin/main` 6bd682a | 1 | 3rd | `0009_pricing_terms_studio.sql` |
| wp3-footer | L | none | `claude/wp3-footer` | `origin/main` 6bd682a | 1 | 4th | `0010_cms_footer_groups.sql` |
| wp4-seo | L | none (rebases onto wp2 and wp6 before merge, §3) | `claude/wp4-seo` | `origin/main` 6bd682a | 1 | 5th | none |
| wp5-admin-retirement | M | wp1, wp2, wp3 merged **and running in production** (release gate, wp5 §4.1) | `claude/wp5-admin-retirement` | `origin/main` at the moment wp1–wp3 are all merged (a descendant of 6bd682a; record the SHA in the PR) | 2 | 6th | none |
| wp7-final-sweep | M | wp1–wp4 and wp6 merged; its last two commits (C3 items a, b) also need wp5 | `claude/wp7-final-sweep` | `origin/main` after merge 5 (record the SHA); rebased onto wp5 before its lane | 3 | 7th (last) | none |

No package stacks on another package's branch. wp5 and wp7 are the only packages with hard dependencies: wp5's
contract checks run against the merged wp1–wp3 code and its release gate needs them deployed, so it is cut from
`main` once they have merged. wp7 (§9 C3) finishes the leftovers the six specs deferred; it starts from `main` once
every wave-1 package is merged, so it shares no hunk with an open package.

Worktrees (one implementer per worktree; create them as the normal user, never from an elevated shell: worktrees owned
by Administrators make git refuse commits with "dubious ownership"):

```sh
# run from D:/Developing/kamelkyp.com/.claude/worktrees/website-remaining-work-2070c0
git fetch origin
for id in wp6-hygiene wp1-commissions wp2-pricing-terms wp3-footer wp4-seo; do
  git worktree add "../$id" -b "claude/$id" 6bd682a
done
# then, inside EACH new worktree (a worktree without its own node_modules resolves the main checkout's stale copy):
npm ci
```

Implementers read their spec from this worktree (absolute path above) until wave 0 has merged; afterwards it is on
`main` too.

---

## 2. Binding cross-package decisions (corrections found while integrating the specs)

These override the individual specs where they disagree.

1. **Migration numbers are fixed.** wp2 ships `migrations/0009_pricing_terms_studio.sql`, wp3 ships
   `migrations/0010_cms_footer_groups.sql`, whatever order they merge in. Nobody renumbers. wp1, wp4, wp5 and wp6 add no
   migration (wp1's optional `cases` list index stays out of scope; it would be `0011` or later). The specs' earlier
   "second to merge renumbers" wording (wp1 §6, wp2 §5/§7/§8/§10, wp4 §7/K9, wp5 §4.1/§7/§10/§11) was corrected in
   place by the completeness review (§9 C2.1). wp2's
   `migration-0009.test.ts` applies its file by the full stem `0009_pricing_terms_studio`; wp3's
   `footer-migration.test.ts` uses the prefix `0010`. wp5's "no migration added" check therefore expects exactly
   `0001`–`0008` plus those two files. Either landing order is safe (`wrangler d1 migrations apply` applies every
   unapplied file by name); wp2 before wp3 is preferred so production applies them in numeric order.
2. **wp5's capability gate is amended.** wp5 §4.1 assumes wp2 reuses `listPriceVersions`, `listTermVersions` and
   `publishTermVersion`; wp2 §4.17 calls only `publishPriceVersion` and replaces the rest with its own repositories.
   The gate as written would block wp5 forever. Use this gate instead (every name must print at least once; it now
   also stands in wp5 §4.1):

   ```sh
   git grep -nwE "listCases|updateCaseStatus|listPendingStudentPriceReviews|resolveStudentDiscount|confirmVerifiedCleanup|cleanupGoogleLedger|listCleanupDue|publishPriceVersion" \
     -- app ":(exclude)app/routes/admin" ":(exclude)app/lib/admin" \
     ":(exclude)app/lib/cases/retention.server.ts" ":(exclude)app/lib/integrations"
   git grep -nwE "loadPricingIndex|loadPriceEditor|handlePriceEditorAction|loadTermsIndex|loadTermEditor|handleTermEditorAction" \
     -- app/routes/studio/services
   ```

   `listPriceVersions`, `listTermVersions` and `publishTermVersion` stay where they are, unchanged (wp5 acceptance:
   "`app/lib/admin/{case,cleanup,service-catalog,term}-service.server.ts` not changed by WP5"), covered only by
   `tests/worker/admin-pricing-terms.test.ts` after the flip. Their removal joins the dead-export sweep (§8).
3. **wp5 also edits `.github/workflows/config-contract.yml`.** That workflow runs
   `npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts` on every PR, and wp5
   deletes `content-repository.test.ts`. Replace that path with `tests/worker/public-terms.test.ts` (which receives the
   moved term-pointer trigger test, wp5 §6.2), so the contract job keeps checking the live `term_publications` trigger.
   It was missing from wp5's file plan; it is now in wp5 §5 and §11.
4. **wp6 merges first** (§5). wp1 then builds `use-commission-action.ts` on wp6's `useFetcherSettled` while rebasing,
   and wp6's conditional row for that file (wp6 §4.1.3) does not apply. If the order changes and wp1 merges before wp6,
   the conditional row applies as written.
5. **Production deploys are manual.** `deploy-production.yml` is `workflow_dispatch` only and deploys the `main` head it
   is dispatched on. wp5's release gate stays as written ("the WP5 PR is not merged until production runs WP1–3 and the
   Operations screens are confirmed behind Access"), because the next dispatch after a wp5 merge would ship the flip.
6. **Static gates apply from day one, in every package**, whichever package introduces them:
   - wp6 static ban: no `previous.current !== "idle" && x.state === "idle"` (or the `"submitting"` variant) anywhere
     under `app/components/studio/**` or `app/routes/studio/**`. New fetcher handlers use `useFetcherSettled` (once on
     `main`), the shared hooks, or `fetcher.data` identity.
   - wp5 retirement audit: no `app/**` string literal starting with `/admin` (regex ``["'`]\/admin(?:[/?"'`]|$)``,
     comments stripped) outside wp5's allowlist (`app/routes.ts`, `app/routes/admin-legacy-redirect.ts`,
     `app/lib/cms/studio/legacy-admin.ts`, `app/lib/security/headers.server.ts`) and wp3's
     `app/lib/cms/schemas/footer.ts`; no "legacy admin" in Studio UI strings (`app/routes/studio/**`,
     `app/components/studio/**`).
   - wp5 dead-code gate: new code, comments and tests do not name `routes/admin/`, `components/admin/`,
     `lib/admin/{block-form,content-service,media-content-service}`, `lib/db/content-repository`,
     `lib/media/media-repository`, `auth/admin.server`, `stub-panel`, `admin.css` or `requireAdmin`. The only planned
     exception is wp1's `commission-retention-policy.test.ts` allowlist entry, which wp5 removes.
   - Biome: `npx biome ci . --diagnostic-level=warn` reports no warning in any file a package creates or edits (0 in
     total once wp6 is on `main`). From wp6's merge on, CI enforces it: wp6 (g) changes `format:check` to
     `biome ci . --error-on-warnings` (§2.10), so every later rebase fails `npm run check` on a single warning.
   - Brand audit, no inline `style` attributes (CSP), no new dependency, no `package.json`/`package-lock.json` change
     (wp6 excepted).
7. **Do not write the file names of the two older plan drafts (04 and 05)** in any file outside
   `docs/superpowers/specs/`: wp6 (f) verifies with a `git grep` that only its two provenance notes name them.
8. **Docs: each package edits only the sections assigned to it in §3.2.** New content-schema §2 and §3 subsections are
   numbered in merge order (wp2's before wp3's). The later merger re-reads the whole section it touches after rebasing.
9. **`LocalizedText` comes from `app/lib/cms/types.ts`** in every new or changed module. `app/lib/services/catalog.ts`
   also exports a `LocalizedText`; wp5 deletes it with `SERVICE_CATALOG[].name` (wp5 §4.7), so an import from
   `services/catalog` in wp1–wp4 code would break wp5's typecheck.
10. **The Biome gate moves into wp6 (g)** (was wp6 Appendix A.9, a follow-up). `package.json` `"format:check"` becomes
    `"biome ci . --error-on-warnings"` in the same commit that reaches 0 warnings. This is a scripts-only edit: the
    lockfile's root entry records dependencies, not scripts, so `npm ci` stays in sync and no lockfile refresh is
    needed (verify with `npm ci` in the wp6 worktree before pushing). It ships even if (c) falls back (§5).
11. **"Nightly retention cleanup" does not add an automatic case cleanup to the cron** (D7). The owner list names it;
    the commission data rules forbid it (wp1 §2.3: plan 05 says the scheduled handler "does not auto-confirm
    seven-day cleanup", plan 06 and the site spec require the owner to delete the Google/Gmail data by hand and then
    confirm with the three-item checklist and the Apps Script ledger). What exists and stays: the nightly
    `deleteOrphanAttempts` (incomplete submissions after 24 h), `cleanupPendingUploads` (abandoned uploads and orphan
    R2 objects) and `rebuildAllUsages`. wp1 turns the 7-day rule into the Studio's *Cleanup due* queue, the home
    attention row and the owner-confirmed cleanup, and its `commission-retention-policy.test.ts` pins that the cron
    never confirms a cleanup.

---

## 3. File ownership matrix

"Owner" decides the final shape of the file or hunk. Every other package edits only its stated hunk; the package that
merges later rebases and resolves, keeping both sides.

### 3.1 Code, tests, config

| File | Touched by | Owner | How the others coordinate |
| --- | --- | --- | --- |
| `app/routes.ts` | wp2, wp4, wp5 | wp5 (final `/admin` block) | wp2 adds `services/pricing/:serviceId` directly after `services/pricing` and `services/terms/:documentId/:locale` directly after `services/terms` (both before `services/:id`, wp2 §4.2), plus `terms/:documentId` in the preview branch. wp4 adds `robots.txt` and `sitemap.xml` directly after `route("health", …)`. wp5 replaces only the legacy `/admin` block with the explicit routes + splat (wp5 §4.3). Hunks are disjoint; no package reorders other lines. |
| `app/root.tsx` | wp4, wp5, wp7 | wp5 (imports and `links()`) | wp4 touches only `ErrorBoundary` (`<meta name="robots" content="noindex" />` next to `<title>`). wp5 removes the `admin.css` import and its `links()` entry. wp7 (wave 3, after wp5) removes the `legacy.css` import and its `links()` entry (C3 a). |
| `app/routes/public/terms.tsx`, `privacy.tsx`, `commission-service.tsx`, `commission-category.tsx` | wp2, wp4 | wp2 (loaders, page bodies, empty state) | wp2 keeps `export const meta`, `handle` and the wizard loader's `serviceName` field (wp2 §4.6–4.7). wp4 changes only the `meta` exports and puts all four files in **one isolated commit** ("seo: meta for the wp2-shared public routes"); when rebasing onto wp2 it takes wp2's file and re-applies that commit. |
| `app/lib/content/public-content.server.ts` | wp2, wp5 | wp2 (`listPublishedTerms`) | wp2 adds the `at` parameter and the `effective_from <= ?` filter in place. wp5 (wave 2) trims the legacy half **by symbol**, keeping `listPublishedTerms`, `PublishedTerm` and their imports. |
| `app/components/studio/ui/use-editor-form.ts` | wp2, wp6 | wp6 (settle effect) | wp6 replaces the busy-state effect (`:160-182`) with `useFetcherSettled`. wp2 adds `saveIntent?: string \| null` and the Mod+S branch (`:104-117`, `:184-195`). wp6 merges first; wp2 rebases. |
| `app/components/studio/ui/editor-state.ts` | wp2 | wp2 | `legalReviewConfirmed` in `IGNORED_FIELDS`. |
| `app/components/studio/commissions/use-commission-action.ts` | wp1, wp6 | wp1 (creates it) | wp6 merges first, so wp1 builds it on `useFetcherSettled` during its rebase (keeps the `action` path, `sent` guard, "did not answer" fallback and the explicit `revalidate()` on stale-page codes). |
| `app/lib/cms/public/build-views.ts` | wp4, wp6 | wp4 (new predicates, `indexing`) | wp6 edits only the optional-chain lines `:60` and `:100`. wp4 adds `projectLocales`/`writingDetailLocales` as new functions and fills `indexing` without touching those lines. |
| `tests/unit/brand-audit.test.ts` | wp4, wp6 | wp6 (how `sources` is read) | wp6 reads CSS through `node:fs`, adds the liveness check and the "no real-name hook" case. wp4 adds a separate `staticSources` map (`public/**`, `scripts/**/*.mjs`) in **one isolated commit**; on rebase it reuses wp6's file-reading helper. Both packages' cases stay. |
| `tests/e2e/studio-access.spec.ts` | wp1, wp2, wp3, wp4, wp5 | wp5 (final completeness) | Insert at the anchors of §3.3, never in a new block (a duplicated path duplicates a Playwright test title). wp4 changes only the `x-robots-tag` expectation in "the public site does not link to the Studio" (`toBeUndefined()` → `toBe("noindex, nofollow")`). wp5 adds only paths still missing. |
| `tests/unit/studio-shell.test.tsx` | wp2, wp5 | wp5 | wp2 adds `activeNavItem` cases; wp5 removes the `StubPanel` case and its import. |
| `tests/unit/commission-retention-policy.test.ts` | wp1, wp5 | wp1 (creates it) | wp5 removes `app/routes/admin/cleanup-confirm.ts` from the subset allowlist. |
| `app/styles/legacy.css` | wp5, wp6, wp7 | wp6 (`:149-161`) / wp5 (`.content-detail-page*`) / wp7 (the file) | wp6 and wp5: disjoint deletions; neither touches the other's selectors. wp7 (wave 3, after wp5) moves the last live rules (`.service-choice` family) out and deletes the file (C3 a). |
| `app/components/studio/shell/stub-panel.tsx` | wp1, wp2, wp3 (stop importing), wp5 (deletes) | wp5 | wp1–wp3 only remove their `StubPanel` imports; nobody edits the file. wp5 deletes it once the dead-code gate shows no importer. |
| `app/lib/admin/service-catalog-service.server.ts` | wp2, wp7 | wp2 | Additive `publishPriceVersion` metadata (wp2 §4.4). wp5 keeps it as merged. wp7 removes `listPriceVersions` once wp5 has deleted its last app caller (C3 b). |
| `app/lib/admin/{case,cleanup,term}-service.server.ts`, `app/lib/cases/*`, `app/lib/integrations/*` | wp7 (`term-service` only) | — | Reused unchanged by wp1 (and kept by wp5). wp7 removes `listTermVersions` and `publishTermVersion` (and the file if nothing is left) after wp5 (C3 b). |
| `app/components/studio/projects/editor-sections.tsx`, `project-editor.tsx` | wp4, wp6, wp7 | wp6 (settle effect) | wp4 edits only the `listed` hint (`editor-sections.tsx:524`); wp6 only the result effect (`project-editor.tsx:306-399`); wp7 (wave 3) replaces `LegacyBlocks` with the block editor (C3 e). |
| `app/components/studio/media/leave-guard.tsx`, `music/music-editor.tsx`, `media/asset-detail.tsx` | wp6, wp7 | wp6 | wp7 (wave 3) fixes "Save and leave" from an error state on top of wp6's settle hook (C3 c). |
| `app/components/studio/social/social-links.tsx`, `app/lib/cms/repositories/social-links.server.ts` | wp3, wp7 | wp3 | wp3 adds `findMe`; wp7 (wave 3) fixes the failed-reorder restore and adds the stale-list 409 (C3 d). |
| `app/lib/cms/repositories/studio-home.server.ts` | wp1, wp7 | wp1 | wp1 edits `caseRow`; wp7 (wave 3) adds the "Commission form closed" attention row (C3 f). |
| `app/routes/api/commission-submit.ts`, `app/components/commission/commission-wizard.tsx` | wp2, wp7 | wp2 | wp2 aligns safe codes and passes `priceRule`; wp7 (wave 3) adds the public `terms_changed` answer (C3 g). |
| `migrations/0009_pricing_terms_studio.sql` / `0010_cms_footer_groups.sql` | wp2 / wp3 | wp2 / wp3 | Fixed numbers (§2.1). |
| `package.json`, `package-lock.json` | wp6 | wp6 | Nobody else changes them. wp6 edits `dependencies` (c) and the `format:check` script (g, §2.10). wp4's asset generator uses only already-pinned packages. The lockfile changes only through the Refresh lockfile workflow (wp6 §4.3). |
| `app/styles/commission.css` | wp6 | wp6 | Selector contract in wp6 §4.7. wp2 does not edit it. |
| `tests/e2e/final-acceptance.spec.ts` | wp5 | wp5 | wp5 changes only the header comment. Every other package relies on its assertions unchanged (6 footer summaries, `NT$`, `US$260.00`, the 8,680 quote, `/admin` 403). |
| `tests/e2e-studio/harness.ts` | wp1 | wp1 | wp1 appends `runLocalD1File`. Others import from it and never edit it. |
| Studio nav and shell (`app/components/studio/shell/nav.ts`, `studio-shell.tsx`, `app/routes/studio/root.tsx`) | none | — | No package edits them: nested paths resolve by prefix (`activeNavItem`), and the root loader's counts are unchanged (wp1 §4.6). |
| `tests/unit/studio-route-guards.test.ts` | wp5 | wp5 | wp1–wp3 rely on it unchanged (it globs their new modules and requires `withOwner`/`withOwnerMutation`). |
| `workers/app.ts`, `app/lib/security/headers.server.ts` | wp4 | wp4 | wp4's edits must keep wp1's retention-policy test green (`deleteOrphanAttempts` stays; no cleanup import). |
| `app/lib/cms/types.ts` | wp2 | wp2 | wp1 and wp3 reuse existing issue codes. |
| `.github/workflows/config-contract.yml` | wp5 | wp5 | §2.3. |
| `.github/workflows/lockfile.yml` | none | — | wp6 A.11 is an owner decision (§7). |
| `tests/worker/cms-public-read.test.ts` | wp5 (conditional) | — | Only if the merged wp3 tests lack the legacy footer cases (expected not needed, wp5 §5). |

### 3.2 Docs (section owners)

| Doc | Section → package |
| --- | --- |
| `docs/admin-architecture.md` | wp2: §2.1 tree, §2.2 pricing/terms rows (`:109-110`), §2.4 preview list · wp3: §2.2 footer row (`:119`), §4.4 "Section maps per type" Footer row · wp1: §2.2 commissions rows (`:120-123`) · wp5 (last): §2.1 code and prose, §2.2 wording only where a row still names a deleted component, §2.3, §3.2, §3.6, §3.7, §5.1 |
| `docs/content-architecture.md` | wp6: `:22` dependencies · wp4: §3.6, §3.7 · wp2: §3.5, §6.4, §9 I `service-catalog` line · wp3: §5.3 Footer row · wp5 (last): §2 rows 1–2, §8.1, §9 I status line |
| `docs/content-schema.md` | wp4: `listed` (`:61`), `ogImageId`/`defaultSocialImageId` rows (`:399-400`) · wp5: `:300` · wp2: §2.6 note, new table definitions, §3 subsection (numbered first), §5, §6.2 · wp3: new §2 "Footer link groups" subsection, §3 subsection (after wp2's), §5.3, §6.1 `:1646` · wp6: `:1634` |
| `docs/information-architecture.md` | wp6: `:15-17`, `:186`, `:367`, `:671-672`, `:711`, `:828`, `:835` · wp5: `:18-19`, `:58`, `:68` · wp4: §1 Notes bullet after `:69-70`, `:277-279` · wp2: `:52`, `:424` · wp3: §3 intro and §3.1 (including its contact row; never `:359`) |
| `docs/design-system.md` | wp6: §3.5, `:291`, `:874` · wp5: `:29`, §6.25 · wp4: new §7.3 between §7.2 and §8 · wp7 (wave 3): `:531` stale class names (C3 a) |
| wp7 (wave 3, after everyone else, so it re-reads each section first) | `docs/admin-architecture.md` §2.2 social row and §4.12 (C3 d), §4.2 "Needs attention" (C3 f), §4.4 project section map (C3 e); `docs/content-schema.md` project `body` row (C3 e); `docs/information-architecture.md` commission flow note (C3 g) |
| `docs/runbooks/release-checklist.md` | wp1: B `:19` (adds Studio → Commissions, "`/admin/cases` until the flip") · wp4: new section F at the end (zh) · wp5 (last): rewrites B `:19` to the post-flip wording, adds to B, C, D |
| `docs/runbooks/google-setup.md` | wp1: `:62` (with "until the flip") · wp5: removes the "until the flip" clause |
| `docs/runbooks/cloudflare-setup.md`, `README.md` | wp5 only |
| `docs/motion-system.md` | wp6 only |
| `docs/superpowers/plans/*` | wp6 (f) only (this plan was added by the spec phase) |
| `docs/superpowers/specs/2026-10-13-*` | wave 0 adds them; afterwards a package may amend only its own spec, to record a deviation |

### 3.3 `tests/e2e/studio-access.spec.ts` insertion anchors

Separate anchors keep the five packages' hunks apart, so git merges them without conflicts.

| Package | `STUDIO_PATHS` entries | Inserted directly after | Mutations test | Inserted directly after |
| --- | --- | --- | --- | --- |
| wp1 | `/studio/commissions`, `/studio/commissions?status=pending_review&service=full_mix` | `"/studio",` | adds `cache-control` `no-store` to the existing `status` post, then posts `/studio/commissions/student-discount` and `/studio/commissions/cleanup` | the existing `expect(status.status()).toBe(403);` |
| wp2 | `/studio/services/pricing`, `/studio/services/pricing/full_mix`, `/studio/services/terms`, `/studio/services/terms/common/zh` | `"/studio/projects/seed-p-001",` | posts to `/studio/services/pricing/full_mix` and `/studio/services/terms/common/zh` | the `upload` block's `no-store` expectation |
| wp2 | `/studio/preview/terms/common?locale=zh` | `"/studio/preview/projects/seed-p-001?locale=en",` | — | — |
| wp3 | `/studio/settings/footer` | `"/studio/settings/brand",` | post `/studio/settings/footer` (`intent=reorder`, `ids=[]`) | `expect(register.status()).toBe(403);` |
| wp4 | — | — | — | changes only the `x-robots-tag` line of "the public site does not link to the Studio" |
| wp5 | only paths still missing | end of the array | — | — |

---

## 4. Execution waves

### 4.1 Wave 0: specs on record (docs only)

Commit the six specs and this plan on `claude/finish-code-work` (this worktree) and open a docs-only PR. It can merge
at any time (no code, no conflicts with any package); merging it first lets every package PR link its spec on `main`.

### 4.2 Wave 1: parallel implementation (5 worktrees)

`wp6-hygiene`, `wp1-commissions`, `wp2-pricing-terms`, `wp3-footer`, `wp4-seo`, each in its own worktree cut from
6bd682a. They share no hunk except the ones listed in §3.1, and each of those has a fixed owner and an isolated commit.
None needs another package's code to be built or tested.

Rules for wave 1:

- **Local gates run freely** (§6.1): format, Biome warn level, typecheck, unit, worker, apps-script, build. They are
  safe to run in parallel: each worktree has its own `node_modules`, `build/` and `.wrangler/` state. E2E is
  restricted (below).
- Until wp6's worker cap is on `main`, run the worker suite with **`VITEST_MAX_WORKERS=4`** (PowerShell:
  `$env:VITEST_MAX_WORKERS = "4"; npm run test:worker`). Five suites at Vitest's default of 31 workerd processes each
  reproduce the `ECONNRESET` / "Failed to start … worker" failure that wp6 (b) documents.
- **E2E in wave 1 only under the machine-wide locks.** Both suites bind fixed ports: the loopback suite
  `127.0.0.1:8787` (`npm run test:e2e:ci`), the Studio suite `127.0.0.1:5173` with `--strictPort`
  (`npm run test:e2e:studio`). A package may run one of them in its worktree only while holding the matching lock of
  §4.3 steps 3–4 (same commands, same lock directories), so at most one loopback and one Studio run exist on the
  machine, and never next to a lane run. This is required where a spec demands a red-first or before/after run:
  wp6 `css-hygiene.spec.ts` (green on the unmodified CSS before the edits) and `p6-feedback.spec.ts` (red media
  toast before the fix), and every new e2e spec that TDD writes first. A lock held by a lane run has priority: wave-1
  runs wait. The lane run (§4.3) stays the authoritative one. (The earlier "no e2e in wave 1" rule made wp6's
  characterization requirement impossible to meet.)
- Keep the shared hunks in isolated commits, as §3.1 says: wp4's four wp2-shared public-route `meta` edits, wp4's
  brand-audit edit, wp1's hook (switched to `useFetcherSettled` when it rebases onto wp6).
- Do not keep merge conflicts in the main checkout (`D:/Developing/kamelkyp.com`): build-config discovery walks up to its
  `package.json`, and a conflicted copy breaks every worktree's build.
- Commits end with the attribution trailer. Pushing branches, opening PRs, dispatching workflows and deploying happen
  only with Kevin's go-ahead (§7.2).

### 4.3 Integration lane (serialized)

One package at a time, in the merge order of §5. For the package whose turn it is:

1. `git fetch origin && git rebase origin/main` in its worktree; resolve the shared hunks per §3; re-apply isolated
   commits if needed. Run `npm ci` again if `package-lock.json` changed on `main` (after wp6 (c)).
2. `npm run check` (format, typecheck, unit, worker, apps-script, build). Once wp6 is on `main`, no
   `VITEST_MAX_WORKERS` override is needed.
3. Loopback e2e, holding the 8787 lock:

   ```sh
   netstat -ano | grep -E "127.0.0.1:(8787|5173) .*LISTENING" && { echo "port busy"; exit 1; }
   LOCK="$TEMP/kamelkyp-e2e-8787.lock"; mkdir "$LOCK" || { echo "loopback e2e busy"; exit 1; }
   npm run test:e2e:ci; rc=$?; rmdir "$LOCK"; exit $rc
   ```

4. Studio e2e, holding the 5173 lock (same pattern, lock `kamelkyp-e2e-5173.lock`, command `npm run test:e2e:studio`).
   No `react-router dev` may be running on 5173. The Studio harness uses the worktree's persistent local D1; each
   package's Studio spec cleans up after itself (wp1 `afterAll` teardown, wp6 `finally` restores, wp2's single 2099
   scheduled group by design).
5. If a run ends with every remaining test at `ECONNREFUSED`, rerun once (known wrangler proxy flake). `route_404`
   `[ERROR]` lines are expected app logs.
6. Push, open (or un-draft) the PR, wait for the required checks `ci` (jobs `quality` and `worker`), `e2e` and
   `Cloud configuration contract`, merge, and only then start the next package's step 1. The `preview` workflow is
   **not** a merge requirement: on PR #8 (the last PR) it stopped at "Require trusted Preview configuration"
   ("required preview deployment configuration is missing", run 38035004782), because the `preview` environment
   lacks secrets/vars. Until Kevin configures it (A10), record its status in the PR and do not wait for it. Once it is
   configured, it becomes required, and wp3/wp4/wp5's notes on the deployed-preview run apply. `npm run
   test:e2e:studio` runs in no workflow, so the PR body carries the lane's local Studio e2e result (suite counts).

At most one loopback run and one Studio run exist on the machine at any time. The two suites use different ports, but
run them one after the other anyway: both are CPU heavy, and wp6's p6 spec throttles the CPU on purpose.

### 4.4 Wave 2: wp5-admin-retirement

Starts after wp1, wp2 and wp3 are merged (merge slots 2–4):

```sh
# run from this worktree once merge 4 is on origin/main
git fetch origin
git worktree add ../wp5-admin-retirement -b claude/wp5-admin-retirement origin/main
# inside it:
npm ci
```

Record the base SHA in the PR. Then:

1. Contract checks of wp5 §4.1 against the merged code, with the **amended capability gate** (§2.2) and the unchanged
   dead-code gate; record the results in the PR description.
2. Implement per wp5 §4–§6, plus `.github/workflows/config-contract.yml` (§2.3).
3. Integration lane (§4.3). wp4 (slot 5) normally merges first; if wp5 is ready earlier, wp5 may go first and wp4
   rebases (its `seo-routes` test already mirrors wp5's audit regex).
4. **Release gate before merge** (wp5 §4.1, owner actions §7.2): production runs a build containing wp1–wp3 with the
   legacy `/admin` still live; Access paths `/studio`, `/studio/*`, `/studio.data`, `/api/studio/*` are on the
   **existing** Access application; the Studio Operations screens and the sidebar Home link are confirmed in
   production; the wp5 §8.1 read-only queries have run and any rows are handled per §7.1 D4.
5. Merge, dispatch the production deploy, run wp5 §6.5 post-deploy checks; roll back by redeploying the previous Worker
   if they fail.

### 4.5 Timeline

```
wave 0  docs PR (specs + plan) ─ merge any time
wave 1  wp6 ████████ ─lane─▶ merge 1
        wp1 ██████████████ ──rebase(wp6)─lane─▶ merge 2
        wp2 ██████████████████████ ──rebase─lane─▶ merge 3
        wp3 ██████████████████████ ──────rebase─lane─▶ merge 4 ─▶ Kevin: prod deploy, Access paths, confirm
        wp4 ██████████████████████ ──────────rebase(wp2, wp6)─lane─▶ merge 5
wave 2  wp5                            cut from main after merge 4 ██████████ ─lane─▶ release gate ─▶ merge 6 ─▶ prod deploy ─▶ checks
wave 3  wp7                                         cut from main after merge 5 ████████ ──rebase(wp5)─lane─▶ merge 7 ─▶ prod deploy
final   main: npm run check + both e2e suites once more + the §6.3 owner-list checks; remaining follow-ups (§8)
```

### 4.6 Wave 3: wp7-final-sweep

Starts after merge 5 (wp1–wp4 and wp6 on `main`); it does not wait for the wp5 release gate:

```sh
git fetch origin
git worktree add ../wp7-final-sweep -b claude/wp7-final-sweep origin/main
# inside it:
npm ci
```

Record the base SHA in the PR. Implement C3 items c–g first (they need only wave-1 code). Items a and b need wp5
(they delete what only the legacy admin used); do them last, after `git rebase origin/main` once merge 6 is on
`main`. If the wp5 release gate is still open when c–g are done and green, wp7 may merge c–g alone and ship a and b
as `claude/wp7-final-sweep-legacy` after merge 6 (same lane, same checks). Integration lane as §4.3.

---

## 5. Merge order and PR strategy

One PR per package against `main`, not stacked. Order:

1. **wp6-hygiene.** The shared settle primitive, the Biome zero-warning baseline and the worker cap help every later
   rebase and lane run. Its lockfile step (c) is its last commit: push, dispatch `gh workflow run lockfile.yml --ref
   claude/wp6-hygiene`, wait for the `github-actions[bot]` "chore: refresh npm lockfile" commit, use "Approve and run"
   for the bot-pushed commit's checks, then push one more commit (or re-run) so `ci` runs on the refreshed lockfile. The
   dispatched run's parallel `unit` job is expected to fail at `npm ci` (wp6 §4.3); judge it by the `lockfile` job.
   **Fallback:** if the push or dispatch is not approved when the rest of wp6 is ready, drop (c) from the branch, merge
   wp6 without it, and ship (c) after wp5 as `claude/wp6-hygiene-deps`. Nothing depends on (c).
2. **wp1-commissions.** Rebased onto wp6: builds `use-commission-action.ts` on `useFetcherSettled`.
3. **wp2-pricing-terms.** Lands migration 0009; its rewritten public routes are the base for wp4's `meta` commit.
4. **wp3-footer.** Lands migration 0010. With wp1–wp3 on `main`, Kevin can dispatch the production deploy that the wp5
   release gate needs.
5. **wp4-seo.** After wp2 (shared public routes) and wp6 (brand-audit, `build-views.ts`).
6. **wp5-admin-retirement.** Only after the release gate.
7. **wp7-final-sweep.** Last (§4.6; items a–b after wp5, c–g may go first as a split PR).

Allowed swaps: wp1, wp2 and wp3 may merge in any order as they become ready (wp2 before wp3 preferred, §2.1). wp4 never
merges before wp2. wp5 never merges before wp1–wp3 and the release gate. wp7 never merges before wp1–wp4 and wp6, and
its items a–b never before wp5. If wp6 is late, others may merge first and wp6
then performs the reconciliations of §3.1 itself (its conditional row for `use-commission-action.ts`, the brand-audit
and `build-views.ts` merges).

PR conventions:

- Open as **draft** when the branch is first pushed; mark ready after the integration lane passes.
- Body: spec path; the spec's acceptance checklist with each item ticked; test evidence (commands run, suite counts);
  cross-package notes (wp2: the §4.17 handoff, the local `npx wrangler d1 migrations apply kamelkyp-com --local
  --config wrangler.base.jsonc` note, the §4.16 deliberate non-ports; wp5: contract table, both gates' output, release
  gate status; wp6: the lockfile bot commit SHA); the attribution line.
- Merge with a merge commit (repo convention). Never force-push `main`; force-push a package branch only after a rebase
  in the lane.
- After each merge, the next package rebases; nobody merges two packages without a lane run in between.

---

## 6. Definition of done

### 6.1 Every package

Local gates (wave 1, inside the package worktree):

```sh
npm ci                                      # once per worktree
npm run format:check
npx biome ci . --diagnostic-level=warn      # no warning in files this package touches (0 total once wp6 is on main)
npm run typecheck
npm run test:unit
VITEST_MAX_WORKERS=4 npm run test:worker    # drop the override once wp6 (b) is on main
npm run test:apps-script
npm run build
```

Integration gates (lane, §4.3): `npm run check`, `npm run test:e2e:ci`, `npm run test:e2e:studio`, all green on the
branch rebased onto the current `origin/main`.

Always true: tests written first (TDD) as each spec's test plan says; the §2.6 static gates pass; no personal-name
variant in any new or changed file; no invented price (numbers only from D1, or in tests that assert seeds); no sample
content public; every new Studio loader/action wrapped in `withOwner`/`withOwnerMutation`; no inline styles; no new
dependency; the spec's acceptance checklist is fully ticked in the PR.

### 6.2 Per package

| Package | Acceptance checklist | Extra gates |
| --- | --- | --- |
| wp6-hygiene | wp6 §10 | `npx biome ci . --diagnostic-level=warn` reports **0** warnings; `npm run test:worker` with no flags green **three runs in a row** on the 32-thread machine, and `VITEST_MAX_WORKERS=31` still honoured; `tests/e2e/css-hygiene.spec.ts` written first and green before and after the CSS edits in both Playwright projects; `p6-feedback` green with CPU throttling ×6 (and seen red on the media archive toast before the fix); `git grep -n -e <old 04 draft name> -e <old 05 draft name> -- . ':!docs/superpowers/specs/'` lists only the two provenance notes (wp6 §4.6); `format:check` is `biome ci . --error-on-warnings` and a deliberately added warning makes `npm run format:check` exit non-zero (try once locally, do not commit it); `npm ci` succeeds after the scripts edit without a lockfile change; (c) only via the workflow, bot commit present, next `ci` green |
| wp1-commissions | wp1 §11 | `git diff origin/main -- workers/app.ts` is empty; `use-commission-action.ts` built on `useFetcherSettled` (wp6 merged first); the Studio e2e never clicks "Confirm cleanup" and leaves no fixture case behind: `npx wrangler d1 execute kamelkyp-com --local --config wrangler.base.jsonc --command "SELECT COUNT(*) AS n FROM cases WHERE case_id LIKE 'KAM-20261001-E2E%'"` returns 0; `/admin/cases` and its three POST routes untouched |
| wp2-pricing-terms | wp2 §10 | migration file is exactly `0009_pricing_terms_studio.sql` and inserts no row; `git grep -nE "SERVICE_CATALOG\|getService\(" -- app/components/studio app/lib/cms/repositories app/routes/studio` shows no `.name` access; `git diff origin/main -- tests/e2e` only adds lines (no existing `NT$`, `US$260.00` or 8,680 assertion changed); the Studio e2e schedules only at 2099-01-01 00:00 Taipei with unchanged values and never clicks "Refresh now"; PR body carries the §4.17 handoff and the local-migration note |
| wp3-footer | wp3 §10 | migration file is exactly `0010_cms_footer_groups.sql` (INSERT OR IGNORE only); `app/lib/content/footer-repository.server.ts` and its unit test deleted; seeded databases still render 6 footer summaries; the failed-reorder restore is **automated** (wp3 §6.4 step 10: a second page adds a group, so the first page's reorder answers 409 `stale_revision` and its list must return to the server order), no longer a review-only checkpoint |
| wp4-seo | wp4 §10 | `node scripts/generate-brand-assets.mjs` run once by hand, PNGs committed and looked at in the PR; `public/robots.txt` and `public/sitemap.xml` do not exist; the only changed existing e2e assertion is the `x-robots-tag` line in `studio-access.spec.ts`; `tests/unit/service-pages.test.tsx` passes unchanged; the `seo-routes` test mirrors wp5's `/admin` literal regex and passes |
| wp5-admin-retirement | wp5 §11 | amended capability gate (§2.2) prints every name; dead-code gate (wp5 §4.1) prints nothing; `config-contract.yml` points at `tests/worker/public-terms.test.ts`; after `npm run build`, no file under `build/client/assets` has `admin` in its name; `migrations/` holds exactly `0001`–`0010`; the release gate (§4.4 step 4) is met **before** the merge; wp5 §6.5 post-deploy checks pass or the deploy is rolled back |
| wp7-final-sweep | §9 C3 "Acceptance" | each C3 item's check; `migrations/` unchanged; `git grep -n "until the block editor lands" -- app` and `git grep -n "legacy.css" -- app` print nothing; `app/styles/legacy.css` gone; the computed-style characterization of the `.service-choice` pages is green before and after the move; the dead-export list is re-derived after wp5 and every removal is backed by an empty `git grep -nw <symbol> -- app workers tests scripts` |

### 6.3 Final (after merge 7)

On a fresh worktree of `main`: `npm ci`, `npm run check`, `npm run test:e2e:ci`, `npm run test:e2e:studio`; dead-code
gate empty; `npx biome ci . --diagnostic-level=warn` reports 0 warnings;
`git grep -n -i -e "not built yet" -e "not_built" -e "StubPanel" -- app` prints nothing (today it lists exactly the
seven stub files of wp1–wp3 and `stub-panel.tsx`).

Then the owner-list checks (§9 C1), each printing nothing or the stated value, recorded in the last PR or a closing
comment on it:

```sh
git grep -n "wavesurfer" -- package.json package-lock.json app workers           # (c) removed
ls app/styles/admin.css app/styles/legacy.css app/routes/admin 2>&1 | grep -c "No such file"   # 3
git grep -n "real-name" -- app                                                    # (d) no CSS hook
# (e): the wp6 §10 (e) acceptance grep over the four living docs prints nothing (not repeated here, so this plan
#      spells no personal-name variant)
git grep -nE "previous(\.current)?\s*!==\s*\"idle\"\s*&&\s*[\w.]+\.state\s*===\s*\"idle\"" -- app
git grep -n "maxWorkers" -- vitest.worker.config.ts                                # one line
ls docs/superpowers/plans | grep -c "^2026-08-10-0[45]-"                          # 2
git grep -n "until the block editor lands" -- app
git grep -n "\"format:check\"" -- package.json                                     # biome ci . --error-on-warnings
ls public/robots.txt public/sitemap.xml 2>&1 | grep -c "No such file"             # 2 (routes, not files)
npm run test:unit -- tests/unit/service-catalog.test.ts                            # catalog holds no price (wp2 §4.12)
git grep -n "cleanup" -- workers/app.ts                                            # only cleanupPendingUploads (D7)
```

And, after the last production deploy (A8, then once more after merge 7): release-checklist sections B–D (wp5) and F
(wp4) on `https://kamelkyp.com`.

---

## 7. Owner decisions and actions

### 7.1 Decisions (deduplicated; each has a default, so no work waits on it)

| # | Decision | Raised by | Default (work proceeds with it) |
| --- | --- | --- | --- |
| D1 | Unlisted published projects and writing (`listed = 0`): noindex or indexable? | wp4 O1 | `<meta name="robots" content="noindex">` and excluded from the sitemap. Reverting is a two-line change (wp4 §4.12). |
| D2 | Operator identity in the legal texts: is "Kamel" enough, or must a legal name appear (for example in the privacy notice)? | wp2 §9; content-architecture §8 item 6 | Write the Studio terms with "Kamel" only. Add a legal name only where Kevin's legal reviewer says the law requires it; terms are exempt from the blocking brand guard and the editor warns. The code ships either way and no price is affected. |
| D3 | Show the seeded-hidden "Website repository" footer link (its public commit history shows a personal name)? | wp3 §9; content-architecture §8 item 8 | Keep it hidden; Settings → Footer offers the switch. |
| D4 | Legacy works, posts, media or social links edited in `/admin` after the Studio import (only if the wp5 §8.1 queries return rows) | wp5 §10 | Re-enter them in the Studio by hand before the flip. The alternative, an additive import migration, would be numbered `0011` or later. |
| D5 | wp5 release sequencing if production has never been deployed (wp2 §3.1 says so) | this plan | Follow wp5's gate as written: dispatch a production deploy of `main` with wp1–wp3 (and wp4, wp6 if merged) while the legacy `/admin` still exists, add the Access paths, confirm the Studio there, run the §8.1 queries (expected empty), then merge wp5 and deploy again. Skipping the intermediate deploy is not recommended: the `/studio.data` Access check only works behind the real Access application. |
| D6 | Add `needs: lockfile` to the `unit` job of `lockfile.yml` (wp6 A.11)? | wp6 A.11 | Leave the workflow unchanged; judge dispatches by the `lockfile` job. |
| D7 | "Nightly retention cleanup" (owner list): should the cron delete a case's temporary records automatically once its 7-day cleanup is due? | owner list; wp1 §2.3; this plan §2.11 | **No.** The cron keeps its current jobs; the 7-day cleanup stays owner-confirmed in Studio → Commissions (wp1), because the site cannot verify that the Google Form, Sheet and Gmail copies were deleted, and plan 05/06 and the site spec §16 forbid an automatic confirmation. Choosing "yes" is a docs change first (site spec §16.3, plan 06 cleanup rules) and a new spec, not part of this plan. |
| D8 | Public copy of the wizard's "terms changed" answer (wp7 C3 g) | this plan §9 | The bilingual strings proposed in C3 g; Kevin may reword them in the wp7 PR review. |

Already open and not changed by any package: the brand contact address (content-architecture §8 item 5).

### 7.2 Owner actions and approvals (not decisions, but on the critical path)

| # | Action | When |
| --- | --- | --- |
| A1 | Approve pushing the package branches and opening the PRs | before each package's lane step 6 |
| A2 | Approve the push and the Refresh lockfile dispatch for wp6 (c), then "Approve and run" on the bot commit | wp6 lane; otherwise the §5 fallback applies |
| A10 | Configure the GitHub `preview` environment (every secret and var the "Require trusted Preview configuration" step lists) so the `preview` workflow can run; and check that the `production` environment holds every secret and var `deploy-production.yml` reads (and that `npm run verify:production` passes there) **before** A3. Without A10 the `preview` check stays red (not a merge requirement, §4.3 step 6) and A3 cannot run | before A3; preview any time |
| A3 | Dispatch the production deploy after wp1–wp3 are merged (migrations 0009/0010 are applied by the workflow). Preferably after merge 5, so the first production deploy already serves robots, sitemap, canonical tags and preview noindex (wp4); the gate does not need it | after merge 4 (preferably 5) |
| A4 | Add `/studio`, `/studio/*`, `/studio.data`, `/api/studio/*` to the **existing** production Access application (keep `/admin`, `/admin/*`, `/api/admin/*`); a second application would 403 every Studio request | before the Studio is used in production |
| A5 | Confirm in production that `/studio`, `/studio/commissions`, `/studio/services/pricing`, `/studio/services/terms`, `/studio/settings/footer` load behind Access and that the sidebar Home link works from another Studio page | wp5 release gate |
| A6 | Run the wp5 §8.1 read-only queries (and, optionally, wp3's §7 footer verification query) against production | wp5 release gate |
| A7 | Write, have reviewed and publish the terms in Studio → Terms. Until common, privacy and the service document are published for a locale, that locale's commission wizard answers 404 and the category chooser shows the empty state (wp2's intended fail-safe) | after the wp2 deploy |
| A8 | Dispatch the production deploy after the wp5 merge and run wp5 §6.5 post-deploy checks | after merge 6 |
| A9 | After pulling wp2 and wp3, apply local migrations for hand-run dev servers: `npx wrangler d1 migrations apply kamelkyp-com --local --config wrangler.base.jsonc` (the Studio harness does this itself) | after merges 3–4 |

Order on the critical path: A10 → A3 → A4 → A5 → A7 (terms; until then every commission form is closed, so publish
them before announcing the site) → A6 → wp5 merge → A8 → wp7 merge → one more production deploy.

---

## 8. Follow-ups that stay out of scope (with the reason)

The completeness review (§9) moved every other former follow-up into wp7 (C3) or wp6 (g): the dead-export sweep,
the `legacy.css` retirement and the stale `design-system.md:531` class names, the LeaveGuard and social-reorder bugs,
project body blocks, the Biome gate, the wizard "terms changed" answer and the "Commission form closed" attention row.
What remains is not code work that can be finished now:

- Drop the legacy D1 tables: content-architecture §5.1 step 5 keeps them read-only "for at least one release" and
  puts the drop outside this project. wp5's redirect already falls back to `/studio` when the lookup fails.
- `og:image` from the original asset URL instead of a transformation variant (wp4 K4): existing behaviour;
  `format=auto` negotiates on the crawler's `Accept` header, and wp4 never declares a wrong size. Revisit only if a
  share debugger shows a broken card (release-checklist F).
- `Disallow: /language/` (wp4 K13): revisit only if Search Console lists blocked URLs; needs production data.

---

## 9. Critic notes (completeness review, 2026-10-13)

The review read this plan and the six specs against the owner's remaining-code-work list, the Studio brief
(`docs/superpowers/specs/2026-09-24-content-studio-brief.md`) and the code at 6bd682a. It fixed the plan and the
specs in place; this section records what it found, where it changed things, and what it adds (wp7).

### C1. Owner list → package → evidence

| Owner item | Covered by | Where | Evidence at the end |
| --- | --- | --- | --- |
| Studio stubs: Commissions inbox, status, student discount, cleanup | wp1 | wp1 §4–§7 | stubs gone (§6.3 grep); `studio-commissions` unit/worker/e2e; loopback 403s |
| Studio stub: Services → Pricing | wp2 | wp2 §4.3–§4.4, §4.9 | `studio-pricing` tests; the Studio e2e schedules only at 2099 |
| Studio stub: Services → Terms | wp2 | wp2 §4.5, §4.9 | `studio-terms` tests; legal gate 422 |
| Studio stub: Settings → Footer | wp3 | wp3 §4.5–§4.8 | `studio-footer` tests; preview parity test |
| Public commission prices from Studio, not `catalog.ts` | Already true on `main` for the numbers: every public price reads `price_versions` (wp2 §3.3; this review found no price literal in `app/`). wp2 makes Studio → Pricing their editor, keeps `catalog.ts` structure-only and replaces the hard-coded `%` labels and the 500s. wp5 removes `SERVICE_CATALOG[].name` | wp2 §1, §3.3, §4.8, §4.12; wp5 §4.7 | `service-catalog.test.ts` (no price fields), `commission-rate-labels.test.tsx`, unchanged strict `NT$`/`US$260.00` e2e |
| Terms / privacy from CMS | The public pages already read the D1 term tables. wp2 adds Studio drafts and publishing, and one "effective now" rule | wp2 §4.5–§4.7 | `commission-availability.test.ts`, `commission-rates-terms.spec.ts` |
| Footer from CMS | wp3 | wp3 §4.1–§4.4 | `footer-repository.server.ts` deleted; only `composeFooterGroups` builds the footer |
| Remove legacy `/admin` and global `admin.css` | wp5 | wp5 §4 | dead-code gate, `admin-retirement-audit`, no `admin-*.css` in the build |
| Nightly retention cleanup | wp1 + D7. Decided as **no automatic case cleanup**: the 7-day rule becomes the owner-confirmed *Cleanup due* queue. The cron keeps its orphan-attempt, upload and usage jobs | wp1 §2.3; §2.11; D7 | `commission-retention-policy.test.ts`; §6.3 `workers/app.ts` grep |
| SEO: sitemap, robots, hreflang, canonical, manifest, default OG image, noindex placeholders | wp4 | wp4 §4 | `seo` unit/worker/e2e; release-checklist F in production |
| Busy-state pattern in `use-editor-form.ts` / `music-editor.tsx` (and eight more sites) | wp6 (a) | wp6 §4.1 | static ban test; `p6-feedback` |
| Worker-test thread cap | wp6 (b) | wp6 §4.2 | three green runs on the 32-thread machine |
| Unused `wavesurfer.js` | wp6 (c) | wp6 §4.3 | `dependency-contract.test.ts`; bot lockfile commit |
| Dead legacy CSS | wp6 (d) removes the real-name rules; wp5 removes `.content-detail-page*`; **wp7 C3 a removes the rest and the file** (it was a follow-up) | wp6 §4.4; wp5 §4.7; C3 a | `app/styles/legacy.css` gone |
| Real-name line in `design-system.md` | wp6 (e) | wp6 §4.5 | wp6 §10 (e) grep |
| Duplicate 04/05 plan docs | wp6 (f) | wp6 §4.6 | wp6 §10 (f) grep |
| 24 Biome warnings | wp6 (g), **plus the CI gate** (§2.10; it was a follow-up) | wp6 §4.7 | `format:check` = `biome ci . --error-on-warnings` |

Studio brief items that were still unbuilt and in no spec. The rest of the brief was spot-checked as built: the
routes of §3, the quick actions including Preview Site, list filters and search, slug redirects, brand assets and
favicon, the site counts, the media library, homepage control and previews.

| Brief | Gap at 6bd682a | Resolution |
| --- | --- | --- |
| §1 "manage almost all portfolio content without code"; §6/§8 project editor | Imported project body blocks render publicly but can only be kept or removed (`editor-sections.tsx:349`, "until the block editor lands"). The block editor exists | wp7 C3 e |
| §31 unsaved changes ("Save and leave") | "Save and leave" from an ERROR state cancels at once (wp6 A.7) | wp7 C3 c |
| §21/§28 ordering; admin-architecture §4.12 "a failure restores the previous order" | `/studio/social` keeps a failed order (wp3 §8); the other `useKeyboardReorder` lists were never audited | wp7 C3 d |
| §26 "content needing attention" | After wp2, a closed commission form (no effective terms or no price) has no home row, and production starts with no terms | wp7 C3 f |

### C2. What this review changed

1. **Migration numbers** contradicted §2.1. wp1 §6, wp2 §5/§6.2/§7/§8/§10, wp4 §7/K9 and wp5 §4.1/§4.8/§6.2/§7/§10/§11
   still said "whoever lands second renumbers" or named wp3's file `0009`. All now say: wp2 = `0009`, wp3 = `0010`,
   nobody else, and a later import migration is `0011` or later.
2. **wp5 capability gate.** The amended gate (§2.2) existed only in this plan. wp5 §3.3 and §4.1 (contract row, gate
   commands, "Confirmed for WP2") now carry it, so the implementer cannot run the version that blocks forever.
3. **wp5 file plan** gains `.github/workflows/config-contract.yml` (§2.3). Without it the required contract check
   would point at the deleted `tests/worker/content-repository.test.ts`.
4. **Branches.** Every spec header names its package branch. wp6 §4.3 dispatched the lockfile workflow on
   `claude/finish-code-work` (the wrong branch); it now uses `claude/wp6-hygiene`.
5. **Sequencing and verification contradiction.** "No e2e in wave 1" made wp6's red-first and before/after e2e runs
   impossible, and pushed every e2e failure into the serialized lane. Wave-1 e2e now runs under the lane's locks
   (§4.2).
6. **Merge checks.** The lane waited for `deploy-preview`, which stopped at its configuration check on PR #8 because
   the `preview` environment is not configured. The required checks are now named (§4.3 step 6), `preview` is
   informational until A10, and the PR body carries the Studio e2e result (no workflow runs it).
7. **Biome gate** moved from a follow-up into wp6 (g) (§2.10; wp6 §4.7, §4.8, §5, §6.5, §10, A.9). CI then enforces
   the zero-warning rule of §2.6 for every later package.
8. **Rules added.** The `LocalizedText` import source (§2.9), the nightly-retention interpretation (§2.11, D7), the
   copy decision D8, owner action A10 (environments), and the critical-path order of the owner actions (§7.2). A3
   preferably runs after merge 5.
9. **wp3's failed-reorder restore is now tested** (wp3 §6.4 step 10, §8, §10; §6.2). A second page adds a group, so
   the first page's reorder gets a 409 and must show the server order again. Before, this was a review-only
   checkpoint.
10. **Former follow-ups that are code work moved** into wp7 (C3) and wp6 (g). §8 keeps only the three items that
    cannot be finished now, each with its reason. Specs that pointed at follow-ups now point at wp7 (wp2 §8, wp3 §8,
    wp5 §1, wp6 Appendix A.4–A.9).
11. **Smaller corrections.**
    - §3.1's wp2 route order now matches wp2 §4.2.
    - wp3's merge note no longer claims wp6 removes `SOCIAL_ICON_KEYS`.
    - wp4 §4.8 refers to wp5's allowlist (five files, including wp3's `footer.ts`), not to "four".
    - wp6 §3.6 no longer says the wp1 spec names an old draft.
    - §6.3 gains the owner-list checks and the production checks.

### C3. wp7-final-sweep (spec)

**Goal.** Finish the code work the six specs left as follow-ups, so that nothing from the owner list or the Studio
brief stays "until X lands".

**Constraints.**
- No feature beyond those gaps, no migration, no dependency, no `package.json` change.
- Studio chrome stays English. Public copy is bilingual; only item g adds any.
- Every rule of §2.6 and §6.1 applies, with TDD per item.
- The items are independent commit series. An item that stalls may be split into its own PR without blocking the
  others; record that in the PR.
- Base and timing: §4.6 (items c–g after merge 5; items a–b after merge 6).

#### a. Retire `legacy.css` (owner item "dead legacy CSS"; wp6 A.6, A.8)

- **Finding.** After wp5, the file's only class with an app consumer is `.service-choice` (`service-choice.tsx:31`).
  Every page that renders it is a `.service-select-page` (`mixing-index.tsx:23`, `transition-index.tsx:23`,
  `studio/preview/service.tsx:75`), where `pages/services.css:169-173` already resets it to
  `display: block; border-block: 0`, which are a `<section>`'s defaults. The file therefore has no visual effect.
- **Change.**
  - Re-run the class-boundary scan (wp6 §3.4 method) and paste the result in the PR.
  - Delete `app/styles/legacy.css`, its import and `links()` entry in `app/root.tsx`, and the now-pointless reset
    rule in `services.css`.
  - In the "Legacy aliases" block of `tokens.css` (`:198-211`, "remove after every page is migrated"), delete every
    alias that nothing references. Where an alias is still used (today `--color-cool-gray` in
    `app/styles/media.css`), write the token it aliases at the use site (`var(--color-text-secondary)`, the same
    computed value), then delete the alias.
  - Fix the stale class names at `docs/design-system.md:531`: the showreel is `.home-showreel__*` in `hero.tsx`, and
    the player bars are `.media-waveform`.
- **Files.** `app/styles/legacy.css` (deleted), `app/root.tsx`, `app/styles/pages/services.css`,
  `app/styles/tokens.css`, `app/styles/media.css`, `docs/design-system.md`.
- **Tests, written first.** Extend wp6's `tests/e2e/css-hygiene.spec.ts`:
  - On `/en/mixing` and `/zh/song-transition`, at 1440×900 and 390×844: `section.service-choice` has
    `display: block` and border widths of `0px`.
  - The first `.service-select__card` box (x, width) equals the values recorded on the unmodified CSS.
  - One computed colour in `media.css` that used `--color-cool-gray` is unchanged.
  - The spec is green before and after the change, in both Playwright projects.
  - Before removing the `--motion-*` aliases, check `tests/unit/motion-tokens.test.ts` and any other test that reads
    `tokens.css`.
- **Acceptance.**
  - The file is gone, and `git grep -n "legacy.css" -- app tests` prints nothing.
  - No alias of the block is left unless it is still referenced.
  - Biome is clean.

#### b. Dead-export sweep (wp6 A.5; §2.2)

- **Change.**
  - After wp5, re-derive the list: exported symbols in `app/**` with no reference outside their own file in `app`,
    `workers`, `tests` or `scripts`.
  - Remove each symbol, or only its `export` when the module still uses it.
  - This includes `listPriceVersions`, `listTermVersions` and `publishTermVersion` (delete `term-service.server.ts`
    if nothing is left in it) and their cases in `tests/worker/admin-pricing-terms.test.ts`. wp2's
    `studio-terms.test.ts` covers the legal gate and immutability (wp2 §4.17).
  - It also includes `SOCIAL_ICON_KEYS`, and `app/lib/commission/steps.ts` if it is still unreachable.
- **Keep**, with the reason stated in the PR:
  - `confirmCleanup`: wp1's retention-policy test names it.
  - `getCategoryServices` and `categoryPath`: wp2 §4.12.
  - `verifySignedEnvelopeForTest`: a test seam.
  - `calculatePostQuoteFee`: plan 04's post-quote fee rule, pinned by a test.
  - `useReveal`: documented in `motion-system.md`.
- **Files.** As found by the scan.
- **Tests.** None new; the scan output is the evidence.
- **Acceptance.**
  - Every removal is backed by an empty `git grep -nw <symbol> -- app workers tests scripts`.
  - The amended capability gate (§2.2) still prints `publishPriceVersion`.

#### c. "Save and leave" from an error state (wp6 A.7; brief §31)

- **Finding.** `media/leave-guard.tsx` decides from the save-state *kind*. After a click from ERROR, its effect
  still sees `"error"` and resets the blocker at once.
- **Change.**
  - Pass the editor's state object (`editor.state` from `useEditorForm`) instead of its kind.
  - Remember the object present at click time. Act only on a *different* object whose kind is `saved` (proceed) or
    `error` (reset).
  - Update the callers `music-editor.tsx:698` and `asset-detail.tsx:636`.
  - Audit the settings `form-kit.tsx` `LeaveGuard` for the same race (the service and settings editors wait for
    `!editor.dirty`), and fix it the same way if it has it.
- **Files.** `leave-guard.tsx`, `music-editor.tsx`, `asset-detail.tsx`, and `form-kit.tsx` if affected.
- **Tests, written first.**
  - Unit: a pure helper `leaveGuardStep(clickState, current)` that returns `"wait"`, `"proceed"` or `"reset"`,
    including the click-from-ERROR case.
  - Studio e2e, music editor:
    1. Make a save fail on a value that the server refuses and the client does not block (name it in the test).
    2. Fix the value and click a nav link.
    3. "Save and leave" lands on the target page, and the value is saved.
- **Acceptance.**
  - Both cases pass.
  - No busy-state-only pattern is introduced (wp6 ban).

#### d. A failed reorder restores the order everywhere (admin-architecture §4.12; wp3 §8)

- **Finding.** `useKeyboardReorder` resets only when the server id list changes (`ui/list.tsx:281-286`), so a
  failed reorder keeps the failed order. `social-links.tsx:767` keys only the `<ol>`, which does not reset the hook.
- **Change.**
  - Give the hook an optional `resetKey`; when it changes, the hook resets the order.
  - Pass a failure counter from every call site that can fail: `featured-list.tsx:84`, `music-list.tsx:291`,
    `featured-strip.tsx:61`, `projects-list-view.tsx:288`, `service-list.tsx:204`, `taxonomy-manager.tsx:282` and
    `social-links.tsx:679`. `list-kit.tsx` and wp3's footer already remount and may stay as they are.
  - The `/studio/social` `reorder` refuses an id set that differs from the current one with 409 `stale_revision`
    and the message "The order changed elsewhere. Reload and try again."
    (`actionError(…, { status: 409, message })`, as in wp3 §4.7).
- **Files.** `ui/list.tsx`, the call sites above, `social-links.server.ts`.
- **Tests, written first.**
  - Unit: the reducer is pure, so test that it resets on a new `resetKey`.
  - Worker: the social reorder answers 409 on a stale set, and the rows are unchanged.
  - Studio e2e on `/studio/social`, with wp3's two-page technique: an error toast, and the list back in the server
    order.
- **Acceptance.**
  - Every listed site restores its order after a failed reorder.
  - Docs: admin-architecture §2.2 (social row) and §4.12.

#### e. Project body blocks (wp6 A.4; brief §1, §6, §8)

- **Change.** Replace `LegacyBlocks` (`editor-sections.tsx:349-374`, keep or remove only) with `BlockEditor`
  (`blocks/block-editor.tsx:407`), used the way `writing-editor.tsx:262-273` uses it:
  - `name="body"`. It posts `body.zh:json` and `body.en:json`; make the project parser accept them instead of
    `body:json`.
  - Label "Additional content blocks"; hint "Shown after the case study on the public page."
  - `assets` from the editor's summaries: extend `referencedAssetIds` (`projects.server.ts:482-489`) with the body's
    media block ids.
  - `onChange` goes to the editor's dirty notification, and the editor is keyed by its restore epoch.
  - Block schema limits, publish validation for media blocks and the `body.<locale>` usage rows already exist
    (content-schema `body_i18n` row; 0007 usage step 5). Public rendering does not change.
- **Files.** `editor-sections.tsx`, `project-editor.tsx` (props only), `projects.server.ts`, the project form
  parsing.
- **Tests, written first.**
  - Unit render: hidden `body.zh:json` and `body.en:json` fields, the label, and no "Remove the blocks on save".
  - Worker: a paragraph and a media block round-trip; publish refuses a missing asset; `media_usages` has `body.zh`
    rows.
  - Studio e2e (per-run token): add a ZH and an EN paragraph, save, reload; the preview shows them after the case
    study.
- **Acceptance.**
  - `git grep -n "until the block editor lands" -- app` prints nothing.
  - Docs: the content-schema project `body` row and the admin-architecture §4.4 project section map.

#### f. "Commission form closed" attention row (wp2 §8; brief §26)

- **Change.** In `studio-home.server.ts`, add one **high** row, key `commission-closed`, when a commission service
  whose marketing row is published has `open.zh` or `open.en` false in `getCommissionReadiness(db, now)`
  (wp2 §4.6).
  - Title: "Commission form closed: N service(s)".
  - Detail, per locale: "terms missing: General terms (EN)" or "no active price".
  - Link: `/studio/services/terms`, or `/studio/services/pricing` when a price is missing. Action label:
    "Open terms" or "Open pricing".
  - FX staleness is not a row: the Pricing readiness table already states it.
  - `getStudioCounts().attention === home.attention.length` still holds.
- **Files.** `studio-home.server.ts`.
- **Tests, written first.**
  - Worker: on a fresh DB the row is present and names the missing documents.
  - After publishing common, privacy and the service document in both locales, the row is gone.
  - Existing exact attention assertions change only by this added row; list each one in the PR.
- **Acceptance.**
  - The worker cases above pass.
  - Docs: the admin-architecture §4.2 "Needs attention" list names the new row.

#### g. Public wizard "terms changed" answer (wp2 §4.9 note, §8)

- **Finding.** `commission-submit.ts:137-140` maps `term_version_mismatch` to `validation_failed` with the generic
  "check the details" message.
- **Change.**
  - Answer 409 with the public code `terms_changed` and its own `localizedMessage` (D8):
    - zh: 「條款已更新。請重新整理頁面，閱讀並同意新版條款後再送出。」
    - en: "The terms were updated. Reload the page, read and accept the new version, then submit again."
  - The wizard (`commission-wizard.tsx`, which branches only on `retry_required` at `:242`) shows that message with
    a "Reload" button (zh「重新整理」) that calls `useRevalidator().revalidate()`.
  - The new term ids then reset the acceptance through the existing effect (`:141-152`), and the local draft stays.
- **Files.** `commission-submit.ts`, `commission-wizard.tsx`.
- **Tests, written first.**
  - Worker: a submit with stale term version ids answers 409 `terms_changed` with both locale messages, and the log
    line keeps the real code.
  - Unit render of the wizard's `terms_changed` branch.
  - All existing commission e2e stay unchanged.
- **Acceptance.**
  - No price or name appears in the copy, and the strict `NT$`/`US$260.00` e2e are unchanged.
  - Docs: the information-architecture commission flow note.

**Out of wp7 on purpose:** everything in §8.

**Acceptance (wp7).**
- Every item above is met.
- `npm run check`, `npm run test:e2e:ci` and `npm run test:e2e:studio` are green.
- Biome reports 0 warnings (CI gate).
- No migration, dependency or `package.json` change.
- No new file contains a personal-name variant, a price literal or sample content.
- Every new Studio loader and action keeps `withOwner`/`withOwnerMutation`.
- The §6.3 owner-list checks print what they should.

### C4. Still unresolved

- **Owner-dependent, outside the repo: A10** (GitHub `preview` and `production` environment configuration). Until it
  is done:
  - the `preview` check stays red, and there is no deployed-preview e2e evidence;
  - A3 cannot run, so the wp5 release gate and the production checks of §6.3 cannot complete.

  The code work itself is not blocked.
- **Decisions with defaults, D1–D8.** None blocks implementation. D7 departs from the literal owner wording ("nightly
  retention cleanup") on documented privacy grounds, so Kevin should confirm it.
- **Not verified by running code in this review.** Each is a gate in its package:
  - The scripts-only `package.json` edit keeps `npm ci` in sync (wp6, §6.2).
  - How the eight reorder sites behave on failure (wp7 d).
  - Which music save the server refuses while the client allows it (wp7 c picks it).
- **Shared preview database.** Every PR's `preview` run applies its migrations to the one `kamelkyp-preview` D1, so an
  open wp2 or wp3 PR puts `0009`/`0010` there before `main` has them. Both files are additive and old Workers ignore
  them (wp2 §7, wp3 §7), so this is noted, not changed.
- **§8's three items** stay open by design.
