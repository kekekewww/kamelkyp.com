# QA Review — Editorial Redesign

Date: 2026-09-23 · Branch `worktree-editorial-redesign` · Base commit `13e9e69`
Checked against: `docs/design-principles.md`, `docs/design-system.md`, `docs/motion-system.md`,
`docs/information-architecture.md`, the repo adaptation spec, and master brief §25–26.

## Method

- `npm run build`, then the same config/migration/fixture steps as `scripts/run-loopback-e2e.mjs`
  (render preview config, `d1 migrations apply --local`, the three `tests/fixtures/*-e2e.sql` files),
  then `npm run preview:ci` on `http://127.0.0.1:8787`. D1 therefore holds the e2e fixtures
  (media, FX snapshot, terms), not empty collections.
- Playwright (Chromium) script outside the repo: 15 routes × zh/en × {1440×900, Pixel 7 412×915 @2.6},
  plus `/zh/nope`. Each page is scrolled through in steps before a full-page capture so scroll reveals
  have run. Axe (`wcag2a/aa, wcag21a/aa, wcag22aa`) and console/page errors are recorded per capture.
- Extra states: home hero with `prefers-reduced-motion: reduce` (two frames 1.5s apart, compared
  byte-for-byte), mobile menu open, `/works` row hover and keyboard focus, keyboard Tab to the hero
  primary CTA. Viewport-sized tiles were taken of `/en`, `/zh`, `/en/works`, the first project detail
  and `/en/writing` for close reading, and accent pixels were counted on those tiles.

## Scores (after fixes)

| Criterion | Score | Evidence |
| --- | --- | --- |
| Typography hierarchy, zh/en typesetting | 4 | Four levels hold (wordmark, Display h1, Heading·L list titles, mono metadata); zh uses Noto 700/800. zh titles break inside words (混/音, 生成/式, 單/曲). |
| Grid discipline and asymmetry | 4 | Label rail cols 1–3 on every page, feature cover bleeds left, contact heading breaks the rail; no card grids. About h1 (col 4) and lede (col 5) do not share an edge. |
| Whitespace and section rhythm | 4 | S/M/L spacing alternates, two `bg-2` zones on home (pricing, contact). Pages with a contact band end on two stacked closing statements (band + footer lead). |
| Accent budget and dark tonal variation | 4 | Desktop tiles ≤ 0.9% accent pixels; mobile contact-band viewport 5.5%. Three background tones plus field gradient and grain; no `#000`. |
| Component states (hover/focus, 44px) | 4 | Focus ring visible on CTA and rows; hover dims siblings. Preview covered the hovered title and nav/footer targets were < 44px wide (both fixed). |
| Motion | 4 | Reduced-motion hero frames identical; no `infinite` animations; `backdrop-filter` only on the header. Reveal could leave sections invisible (fixed). |
| Mobile as its own design | 4 | Metadata-above-title rows with 4:3 thumbnails, stacked full-width CTAs, footer accordions, no horizontal scroll on any route. Hero canvas renders as a band under the CTAs, not behind the wordmark. |
| Accessibility (axe) | 5 | 0 serious/critical on all 60 route captures + 404 after fixes (404 lacked a `<title>` before). |
| Conversion flow | 5 | Header CTA on every public page; home has exactly 3 in-page `/commission` CTAs (hero, pricing, contact), none adjacent; per-page placements match IA §5.1. |
| Anti-patterns (§25) | 5 | No glass cards, glows, gradient blobs, skill bars, fake code or dashboards; no radius > 4px except the round play button. |
| Placeholder handling | 5 | Dashed PLACEHOLDER badge on every sample project/award/writing entry and on covers; writing shows "Link pending"; prices come from the catalog/FX snapshot. |
| Consistency across pages | 4 | Same procedural covers, row component, header and footer on home, `/works` and detail. Home feature numeral sits at the viewport edge; the detail hero badge was clipped (fixed). |

## Fixed

1. **Scroll reveals could leave content permanently hidden** — `app/lib/motion/use-reveal.ts`.
   IntersectionObserver only samples at rendering updates. After a fast jump (End key, scrollbar
   drag, find-in-page, a starved main thread) an armed element could pass the viewport without an
   `isIntersecting` entry and stay at `opacity: 0`. Reproduced 2 of 4 runs on `/en` (up to 10
   elements stuck, including the Services and Pricing headings). Added `watch()`: it also reveals on
   an entry whose target is already above the viewport, and a passive rAF-throttled scroll sweep
   reveals any pending target above the reveal line. The sweep removes its listener when nothing is
   pending. After the fix: 0 stuck in 4 of 4 runs.
2. **CSP `font-src 'self'` blocked three inlined font subsets on every page** — `vite.config.ts`.
   Vite inlined font files under 4 KB as `data:font/woff2` URIs, which the CSP rejects (3 console
   errors on every route). `build.assetsInlineLimit` now never inlines `woff/woff2/ttf/otf`. After:
   0 console errors on every route (only the expected 404 document response on `/zh/nope`).
3. **404 page had no document title** (axe `document-title`, serious) — `app/root.tsx`. The
   `ErrorBoundary` now renders `<title>{title} — Kamel</title>`, which React 19 hoists (`找不到這個頁面 — Kamel`).
4. **Hover preview covered the hovered row's own title** — `app/lib/motion/use-hover-preview.ts`.
   With the pointer over the title, the preview sat on cols 6–9 and cut the title. The x clamp now has a
   minimum at cols 8–12 (design-system §6.8).
5. **Parallax overscan pushed cover overlays off the frame** — `app/styles/motion.css`. `scale: 1.12`
   on `.parallax__media` moved the PLACEHOLDER badge to x = −73px on the project detail hero ("LDER"
   visible) and the index numeral to x = −68px. It also scaled the badge text by 12%. Inside the same
   motion media query, the overlays are re-placed in unscaled coordinates and their scale is cancelled.
   Badge now at x = 12, numeral at 16.
6. **Short links below the 44px target width** — `app/styles/layout.css`. Desktop nav (作品 28px,
   Work 35px), footer links and service breadcrumbs (服務 27px) get a wider hit area. On nav and
   breadcrumbs this is padding cancelled by a negative margin, so the text does not move, and the nav
   underline is inset to match. Footer links get `min-inline-size`. The mobile panel resets the nav
   padding. Breadcrumbs reach 41–43px (8px each side keeps neighbouring targets from overlapping
   across the "/").

Verification: `npm run typecheck` ✔, `npm run test:unit` 132/132 ✔, `npx biome check` on changed files
(only pre-existing `!important` warnings in the print block), `npm run test:e2e:ci` 128/128 ✔ on the
third run. The first run lost the wrangler dev server mid-run, and the second hit the flake in
Open-blocking 1.

## Open — blocking

1. **E2E flake: `responsive-a11y` `/en` axe on chromium-mobile.** The axe scan can run while the CSS
   hero intro (`hero-rise-in`) is still fading the hero CTA in, which reports `color-contrast` 1.11 on
   `.home-hero__actions > .button--primary`. This is not a product defect (the settled state is 11.1:1),
   but it makes CI intermittently red. Suggested fix in `tests/e2e/responsive-a11y.spec.ts`: wait for
   `document.getAnimations()` to settle, or emulate `reducedMotion: "reduce"` for the axe pass.

## Open — nice-to-have

1. **zh titles break inside words.** Home/works rows `示意：完整歌曲混 / 音——獨立單曲`, detail h1 on
   mobile `示意：生成 / 式影音工具`, next-project `…獨立單 / 曲`. Suggest `word-break: keep-all` with
   `overflow-wrap: anywhere` on zh `.project-row__title` / `.project-hero__title` (design-system §3.4:
   no layout that depends on fixed breaks), or `<wbr>` in content.
2. **Mobile menu shows two START A PROJECT buttons at once** (bar inverse CTA + panel accent CTA,
   `menu-open-*-mobile.png`). design-system §6.1 hides the bar CTA only below 360px. Suggest hiding it
   while `html[data-menu-open]`.
3. **Mobile accent budget slightly over at the contact band** (5.5% of the viewport on `/en` at 412px,
   from the full-width primary CTA plus the pricing CTA fringe). Target is ≤ 5% (§2.4).
4. **Home/works feature cover numeral sits at the viewport edge** (16px from x = 0, because the cover
   bleeds left), while the home badge is offset by `--page-margin`. Suggest the same
   `calc(var(--page-margin) + var(--space-4))` inset on `.home-feature .project-cover__numeral` and
   `.project-feature .project-cover__numeral` at lg+.
5. **Two consecutive closing statements.** On pages with a contact band, the footer lead (Heading·1
   400, "Mixing, song transitions, software and interactive work — tell me what you want to make.")
   follows the band heading directly. Spec-compliant (§6.18, §6.24), but the page ends twice.
   Consider Heading·2 for the footer lead when a band precedes it.
6. **Footer email renders at Body·S.** §6.24 specifies the lead email as a Heading·2 underlined text link.
7. **Capability titles (Heading·1) are the same size as the section h2** "Capabilities", so the
   section has no step between heading and items. Spec-compliant (§6.12); worth revisiting.
8. **Mobile hero canvas placement.** §4.6 places the 18-line band behind the wordmark and upper half.
   It currently renders as a separate band between the CTAs and the showreel.
9. **About header alignment.** The h1 starts at col 4 and the lede at col 5 (§6.17 says lede cols 5–11).
   Confirm the offset is intended or align both to one column.
10. **Row role line colour.** `.project-row__sub > :first-child` is `--color-text` 500; §6.8 specifies
    Body·S secondary for the role.
11. **Focus ring on list rows overlaps the index numeral** at the row's inline start
    (`works-row-focus-*.png`, "03" touched by the inset ring). Consider `padding-inline-start: var(--space-2)`
    on the row, or a −4px ring offset.
12. **Local tooling:** `wrangler dev` (4.114) on Windows exited with an empty `ProxyController` error
    several times under sustained Playwright load, usually when a context closed with requests in flight.
    Not a site defect. The QA script waits for network idle before closing contexts to avoid it.

## Axe results per route (serious/critical, after fixes)

All captures use tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`.

| Route | zh desktop | zh mobile | en desktop | en mobile |
| --- | --- | --- | --- | --- |
| `/` | 0 | 0 | 0 | 0 |
| `/works` | 0 | 0 | 0 | 0 |
| `/works/sample-generative-audio-visual-tool` | 0 | 0 | 0 | 0 |
| `/services` | 0 | 0 | 0 | 0 |
| `/services/software` | 0 | 0 | 0 | 0 |
| `/mixing` | 0 | 0 | 0 | 0 |
| `/mixing/full` | 0 | 0 | 0 | 0 |
| `/song-transition` | 0 | 0 | 0 | 0 |
| `/about` | 0 | 0 | 0 | 0 |
| `/writing` | 0 | 0 | 0 | 0 |
| `/commission` | 0 | 0 | 0 | 0 |
| `/commission/mixing` | 0 | 0 | 0 | 0 |
| `/commission/mixing/full` | 0 | 0 | 0 | 0 |
| `/terms` | 0 | 0 | 0 | 0 |
| `/privacy` | 0 | 0 | 0 | 0 |
| `/zh/nope` (404) | 0 (was 1: `document-title`) | 0 (was 1) | — | — |

Other automated probes (all captures): no horizontal scroll, no element overflowing the viewport, one
`h1` per page, no heading-level skips, no `img` without `alt`, no running `infinite` animation, no
border-radius > 4px except the play button (50%), `backdrop-filter` only on `header.site-header`.
Remaining sub-44px targets: breadcrumb links at 41–43px, and the 20×20 checkbox inputs in the
commission form, whose whole `<label>` row is the target.

## Console errors per route

| Route(s) | Before | After |
| --- | --- | --- |
| Every public route, both locales, both viewports | 3 × `Loading the font 'data:font/woff2;base64,…' violates … font-src 'self'` | none |
| `/zh/nope` | `Failed to load resource: 404` (the document itself, expected) | same (expected) |

No `pageerror`, hydration errors or `style-src` CSP violations were logged on any route.

## Conversion check

In-page `/commission` links outside header/footer (desktop captures): home 3 · works 1 · work detail 1 ·
services 1 · about 1 · writing 1 · terms 1 · privacy 1 · 404 1 · mixing/full 1 (`?service=`).
`/services/software` uses the "Email me" `mailto:` block. Mixing/Song Transition selection and
commission pages have no in-page CTA. All of these match IA §5.1.

## How to view

Screenshots are outside the repo (not committed):

- Full-page captures: `C:\Users\kevin\.claude\jobs\a22b9045\tmp\qa\shots\<route>-<locale>-<desktop|mobile>.png`
  (for example `home-en-desktop.png`, `home-zh-mobile.png`, `works-en-desktop.png`,
  `work-detail-en-desktop.png`, `404-zh-desktop.png`).
- States: `home-<locale>-desktop-reduced-motion.png` (+ `-2` second frame), `menu-open-<locale>-mobile.png`,
  `works-row-hover-<locale>-desktop.png`, `works-row-focus-<locale>-desktop.png`, `cta-focus-<locale>-desktop.png`.
- Viewport tiles for close reading: `C:\Users\kevin\.claude\jobs\a22b9045\tmp\qa\tiles\`.
- Raw per-capture data (axe, console, probes): `C:\Users\kevin\.claude\jobs\a22b9045\tmp\qa\results.json`.

Full-page captures render the sticky header and the fixed skip link at the scroll offset of the
capture. The header can appear part-way down the page in some files. That is an artifact of
full-page capture, not a layout defect. The viewport tiles show the real header.
