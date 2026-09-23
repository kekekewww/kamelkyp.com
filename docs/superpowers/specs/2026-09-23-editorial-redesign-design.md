# Editorial Redesign — Repo Adaptation Spec

Date: 2026-09-23
Branch: `worktree-editorial-redesign` (experiment; delivered as a draft PR, `main` untouched)
Source brief: [`2026-09-23-redesign-master-brief.md`](2026-09-23-redesign-master-brief.md)

This spec adapts the master brief to the existing kamelkyp.com codebase. Where the
two disagree, **this spec wins**. Where this spec is silent, the master brief applies.

## 1. Decisions taken with Kevin

| Question | Decision |
| --- | --- |
| Public identity | **Kamel** stays the public name. Real name appears exactly once on the landing page: `楊子賢` (zh) / `Kevin Yang` (en). |
| Missing content | Placeholder projects, awards and writing entries are allowed, each flagged `placeholder: true` and rendered with a visible `PLACEHOLDER` badge. No invented prices, metrics or client names presented as real. |
| Existing flows | Commission wizard, D1 pricing, Turnstile, Google submission gateway and the admin CMS are **kept and reskinned**, not replaced. |
| Delivery | Feature branch in a worktree, pushed, draft PR opened. |

## 2. Non-negotiable constraints inherited from the repo

- Stack stays: React Router 8 SSR on Cloudflare Workers, D1, Zod, custom CSS
  (no Tailwind, no Bootstrap, no raw HTML pages, no iframes), Fontsource fonts
  bundled with the app (no third-party font requests), Playwright + axe e2e.
- zh and en are separate URLs and separate content. No auto-translation.
  All new copy is authored in both locales.
- WCAG 2.2 AA, keyboard navigation, 44 × 44 px interactive targets,
  `prefers-reduced-motion` honored, CSP nonce handling unchanged.
- Any selection page shows at most one service category at a time
  (Mixing shows Full Mix + Vocal Mix; Song Transition shows Simple + Edit).
- Mixing / transition prices come from `SERVICE_CATALOG` + the price
  repository. Software / interactive services show **Contact for quote**.
- `npm run check` (format, typecheck, unit, worker, apps-script, build) must
  pass, and the e2e suite must pass after being updated to the new IA.

## 3. Information architecture (all under `/:lang`)

| Path | Status | Content |
| --- | --- | --- |
| `/` | redesigned | Hero → Selected Work (mixed categories) → Capabilities → Recognition → Services → Pricing preview → About teaser → Writing → Contact CTA → Footer |
| `/works` | redesigned | Work index. Merges admin-published works (D1) with file-based projects. Filter via `?category=` (all, software, ai, interactive, music, mixing, research). |
| `/works/:slug` | redesigned | Project detail. File-based projects render the structured case-study sections; D1 works render the existing block renderer inside the new layout. |
| `/services` | new | Overview of three groups: Mixing, Song Transition, Software & Interactive. Links to detail pages. |
| `/mixing`, `/mixing/full`, `/mixing/vocal` | reskinned | Existing service detail pages with real pricing and the commission entry. |
| `/song-transition`, `/song-transition/simple`, `/song-transition/edit` | reskinned | Same as above. |
| `/services/software` | new | Software / AI / interactive offering, engagement models (PROJECT BASED, CUSTOM QUOTE), designed contact block. No prices. |
| `/about` | new | Multidisciplinary creator page; not an autobiography. |
| `/writing` | renamed from `/other` | Editorial cards merging admin posts (D1) with file-based external links (Threads, Instagram, articles). `/other` and `/other/:slug` issue a 301 to the new paths. |
| `/writing/:slug` | renamed | Existing post detail in the new layout. |
| `/commission`, `/commission/:category`, `/commission/:category/:service`, `/commission/success` | reskinned | "START A PROJECT" lands here. Category page adds a third choice "Software & Interactive" that links to `/services/software#contact`, not into the wizard. |
| `/terms`, `/privacy` | reskinned | Legal pages in the new document style. |
| `/admin/**` | tokens only | Shares `tokens.css`; layout and behaviour unchanged. |

Primary navigation: Work, Services, About, Writing, plus the START A PROJECT
CTA and the language switcher. Mixing and Song Transition remain reachable
from Services and the footer; the header no longer carries the nested service
menus.

Software / AI inquiries do **not** enter the commission wizard in this
experiment. Adding a new service type touches the Zod schema, D1 cases, the
Apps Script gateway and the pricing model, and is recorded as a follow-up.

## 4. Content architecture

New folder `app/content/` with typed, zh/en-localized entries:

- `projects.ts` — schema per the brief (id, slug, title, year, categories,
  role, description, featured, services, technologies, cover, media, links,
  credits, sections, placeholder). 5–6 placeholder projects spanning AI /
  creative technology, mixing, interactive, software, research.
- `recognition.ts` — year, event, result, category, placeholder.
- `writing.ts` — kind (article / thread / post), date, title, source, url,
  placeholder.
- `capabilities.ts` — the four capability groups with short descriptions.
- `software-services.ts` — offering list and engagement models, no prices.
- `about.ts` — the about page copy blocks.

Each file exports a Zod schema and typed data; a unit test validates every
entry. Placeholder entries are visibly badged in the UI.

## 5. Visual system

Starting palette from the brief, adjusted by the visual agent only for
contrast or coherence and recorded in `docs/design-system.md`. Fonts are
chosen from the Fontsource catalog and installed as dependencies: one
geometric / industrial grotesk for display and headings, Noto Sans TC Variable
kept for body and Chinese, IBM Plex Mono kept for metadata. Barlow Condensed
is removed. 12-column editorial grid, max width 1500px, asymmetric
compositions, minimal rounded corners, accent color under ~5% of any view.

## 6. Motion system

Hierarchy: CSS transitions/animations → Web Animations API + IntersectionObserver
→ GSAP only if `docs/motion-system.md` justifies a specific primitive that the
first two cannot deliver. No Three.js, no smooth-scroll library, no custom
cursor replacement. Hero visual is a 2D `<canvas>` procedural waveform / line
field reacting to cursor, scroll and time, and to amplitude from the existing
wavesurfer-based showreel player when audio plays. All motion primitives
degrade to static under reduced motion. Existing `motion.css` durations are
superseded by the motion doc.

## 7. Agent plan

All agents run on Opus with `frontend-design` as the implementation skill.

1. **Phase 1 (parallel)** — Research agent: `docs/design-reference.md`,
   `docs/design-principles.md`. IA agent: `docs/information-architecture.md`.
2. **Phase 2 (parallel)** — Visual agent: `docs/design-system.md`. Motion
   agent: `docs/motion-system.md`. Both read phase 1 output.
3. **Phase 3a** — Foundation agent: tokens, global, grid, shell, header,
   footer, motion primitives (hooks + CSS), content schemas + placeholder data,
   route changes and redirects, updated i18n copy.
4. **Phase 3b (parallel)** — Page agents: Home; Work index + detail; Services
   + About + Writing; Commission + legal + admin token pass. Each updates the
   e2e tests it affects.
5. **Phase 4** — QA agent reviews against the docs and runs the suites; the
   lead fixes findings, runs `npm run check` and `npm run test:e2e:ci`,
   commits, pushes, opens the draft PR.

## 8. Testing

- Unit: content schema validation, category filter helper, redirect helper.
- E2E: update `public-navigation`, `responsive-a11y`, `final-acceptance`,
  `smoke` to the new headings, nav labels, footer group count and routes;
  keep commission, media and security specs green. Axe checks stay.
- Manual: desktop 1440 and Pixel 7 screenshots of every public route,
  reduced-motion pass.

## 9. Follow-ups (out of scope here)

- Software / interactive inquiries inside the commission wizard.
- Real project, recognition and writing content replacing placeholders.
- OpenGraph image generation per project.
