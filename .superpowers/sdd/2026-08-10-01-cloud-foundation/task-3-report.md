# Task 3 report

## Status

COMPLETE — the D1 privacy/publication Worker tests, TypeScript check, production build, and generated-SSR deploy dry-run all pass in GitHub Actions. No mocks, fallback database, or local checkout were used.

## Scope and branch

- Repository: `kekekewww/kamelkyp.com`
- Implementation branch: `codex/01-cloud-foundation`
- Required base: `63491ea4528365c2ae65f37c1f6054447d3f933a`
- Final implementation head: `5ae770bade4bf3db87adda151585ef144c5a577b`
- Cloud-only execution: GitHub connector and GitHub Actions; no local checkout, worktree, or project-file read was used.

## RED evidence

The RED tests were committed before implementation:

- `57e64d97164adf2a098f42c1ef816dae8039dfb6` — `test: define D1 privacy and publication boundaries` (content publication test)
- `6da34d32c51850c1551f85f7a22d07390c17132a` — `test: define D1 privacy and publication boundaries` (D1 privacy test)
- `59a96d0e8990f9e13808d18cd23128ad6dccc89b` — `test: run D1 worker boundaries in CI`; minimal read-only workflow update for the required Worker tests.

GitHub Actions run [31405368166](https://github.com/kekekewww/kamelkyp.com/actions/runs/31405368166) was RED at the intended Worker-test step because `vitest.worker.config.ts` did not yet exist:

```
[UNRESOLVED_ENTRY] Cannot resolve entry module vitest.worker.config.ts.
```

The unit-test prerequisite passed in that run.

## Implementation commits

- `0826ee1d5b1ad7819a4bb8f7e4ad28a7ce709728` — `migrations/0001_core.sql`
- `e916a189c45b5c6ea5681e6683a1b364eaad4aff` — `app/lib/db/content-repository.server.ts`
- `0af87bc300c3becd0e6de066c5458a7f85f6fc23` — `app/lib/i18n/locale.ts`
- `55e94b41ac7ecbd14a9cbf6157a31262736c7532` — initial migration helper
- `5744f1a86cb540a5a51a636655d336108267efae` — Worker Vitest configuration
- `dd6aa3056d828f73c0e8429567a3f1d840c73633` — node-only Vitest configuration
- `30df09c448bffe48893497709354cb3f22d0add2` — D1 binding in Wrangler configuration

## Exact-pins compatibility investigation and corrections

The first hosted implementation attempt, [31405678009](https://github.com/kekekewww/kamelkyp.com/actions/runs/31405678009), correctly exposed that the brief's `@cloudflare/vitest-pool-workers/config` import was stale for the repository's exact `@cloudflare/vitest-pool-workers@0.16.19` lockfile pin:

```
Error: Missing "./config" specifier in "@cloudflare/vitest-pool-workers" package
```

Verified current Cloudflare's D1 fixture imports both `cloudflareTest` and `readD1Migrations` from the package root. The minimal no-dependency correction was:

- `5ead113a1d268d887070cbb28bccf80ea063126e` — use the package-root D1 migration import.

Run [31406310762](https://github.com/kekekewww/kamelkyp.com/actions/runs/31406310762) then reached the real Worker runtime and failed only because the test pool's pinned workerd supports compatibility dates through `2026-06-30`, while production's Wrangler configuration deliberately remains at `2026-08-10`. Cloudflare's Worker test configuration documents that `miniflare` settings take precedence over Wrangler settings, so:

- `b368d15858acf22c92e9d2b30974259ec6212a13` — test-only `compatibilityDate: "2026-06-30"`; production config unchanged.

Run [31406437940](https://github.com/kekekewww/kamelkyp.com/actions/runs/31406437940) made both Worker tests pass and then accurately exposed only stale test-environment typing. Cloudflare's current fixture types its test-only migration binding as `Cloudflare.Env` and `import("cloudflare:test").D1Migration[]`, so:

- `13607aa3968dea1c83936484645e20fabb09d2ba` — include the installed pool's test runtime types in TypeScript.
- `e2af79727502a79ee96ba186f8acb2e2332b2192` — add the ambient test-only migration binding declaration.
- `5ae770bade4bf3db87adda151585ef144c5a577b` — make the helper consume that current typed binding.

Run [31406622839](https://github.com/kekekewww/kamelkyp.com/actions/runs/31406622839) confirmed the preceding Worker tests still passed and failed only at the obsolete module augmentation; it is not reported as a GREEN run.

## Final hosted GREEN evidence

GitHub Actions run [31406872525](https://github.com/kekekewww/kamelkyp.com/actions/runs/31406872525), at final head `5ae770bade4bf3db87adda151585ef144c5a577b`, passed every configured step:

```bash
npm ci
npm run test:unit -- tests/unit/config-contract.test.ts
npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
npm run typecheck
npm run build
npx wrangler deploy --dry-run --config build/server/wrangler.json
```

The focused D1 Worker command passed 2 files / 2 tests. The subsequent typecheck, production build, and generated-SSR deploy dry-run also passed.

## Self-review

- `PRAGMA table_info(cases)` was exercised by a real D1 Worker test and passed with exactly the six allowed non-PII columns: `case_id`, `service_id`, `locked_price_minor`, `currency`, `submitted_at`, and `status`.
- The repository appends draft versions; `content_publications` remains the sole live pointer and switches only during `publishVersion()`. The real D1 test verified that the first published version remains live until the second draft is published.
- The test-only migration binding and compatibility-date override live solely in the Worker test setup/configuration. Production modules do not import Cloudflare test packages and production's compatibility date was not reduced.
- Node and Worker Vitest configuration remain separate.

## Fix Round 2 — concurrency and tuple integrity

### Findings addressed

1. Concurrent draft allocation: createDraftVersion() now performs the version-number calculation inside the D1 batch INSERT … SELECT COALESCE(MAX(...), 0) + 1, after the entry upsert. There is no application-side pre-read. Concurrent calls append versions 1 and 2.
2. Concurrent publication: publishVersion() now uses one conditional UPDATE WHERE state = 'draft' and rejects only when meta.changes === 0. The initial migration's content_versions_publish_pointer trigger derives the sole publication pointer from the successful state transition, including the version's own timestamp; a losing caller cannot write the pointer.
3. No placeholder production D1 ID: wrangler.base.jsonc no longer commits database_id. The app keeps its typed Env.DB, and the Worker suite obtains a D1 binding only through Miniflare's test configuration.
4. Publication tuple integrity: the clean initial migration adds composite parent keys/FKs and INSERT/UPDATE validation triggers for both content_publications and term_publications, preventing a pointer from naming a version from a different entry/document or locale.

### Test-first evidence

- 00c2e2405bb37af4b37584476baa0bccd97a4a9e — concurrent-draft, concurrent-publish, and direct malformed content/term pointer Worker tests.
- 85b816d0ef4caa5f23a401e36f3e06411d9f0826 — contract test forbidding a committed database_id.
- 6fc5aaf6f2265721af9b2e84ce52e454e7ac1044 — places the Worker boundary step before the config-contract step so the intended D1 failures are observable in CI.

Hosted RED run [31408069559](https://github.com/kekekewww/kamelkyp.com/actions/runs/31408069559) exercised six Worker tests and failed exactly as intended: duplicate content_versions numbering, two successful concurrent publications, and both malformed direct pointer writes accepted. The preceding config-only RED is [31407952019](https://github.com/kekekewww/kamelkyp.com/actions/runs/31407952019).

### Implementation commits

- 1b33428cb83f93e76ea0feb5c4fd1a22b40bb7b7 — composite immutable publication relationships in the clean initial migration.
- 158d4fdee240852dbc8c113471bab461e3850375 — D1 triggers that reject mismatched content/term publication tuples and derive published content pointers from the state transition.
- 51274f9cf6a57d8c79d1214a0f0b0a2a405ead0e — atomic D1 draft allocation and conditional publication transition.
- 708479051a89ab5254b256d62bc54370958f8bc1 — removes the all-zero D1 identifier from the committed base config.
- c0aabdf84e5fb1629bd0954f44c80f26943aa16b — treats the trigger's successful pointer write as part of the successful conditional publication update.
- bf67c394e5e4ea36228b47a2d710a6f44e2851e3 — broadens cloud verification to the full unit suite.

### Final hosted GREEN

GitHub Actions run [31408461684](https://github.com/kekekewww/kamelkyp.com/actions/runs/31408461684) at head bf67c394e5e4ea36228b47a2d710a6f44e2851e3 passed:

    npm ci
    npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
    npm run test:unit
    npm run typecheck
    npm run build
    npx wrangler deploy --dry-run --config build/server/wrangler.json

The real D1 Worker suite passed 2 files / 6 tests, including the privacy assertion. No mocks, skipped Worker tests, or dependency/lockfile changes were introduced.

### Fix-round self-review

- The migration remains a single clean initial schema; it has not been deployed.
- A publication pointer is now written solely by the successful draft → published state transition, and the pointer timestamp is copied from NEW.published_at.
- The test configuration remains the only source of a test-only database binding; no fake production D1 identifier remains in the committed base config.
