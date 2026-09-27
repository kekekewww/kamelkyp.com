# Information Architecture — Editorial Redesign

Date: 2026-09-23 · Owner: UX / IA agent · Branch: `worktree-editorial-redesign`

Sources, in order of precedence:

1. `docs/superpowers/specs/2026-09-23-editorial-redesign-design.md` (the "spec").
2. `docs/superpowers/specs/2026-09-23-redesign-master-brief.md` (the "brief").
3. The current app (`app/routes.ts`, `app/routes/public/*`, layout components,
   `footer-repository.server.ts`, `catalog.ts`, `steps.ts`, `copy.ts`,
   `block-schema.ts`) and the e2e suite.

Fixed decisions this document builds on (spec section 1):

- Public name is **Kamel**. The real name appears **exactly once, on the
  landing page only**: `楊子賢` on `/zh`, `Kevin Yang` on `/en`. It never
  appears in the header, footer, About page, meta tags or any other route.
- The commission wizard (details → terms → review → verify), D1 pricing,
  Turnstile, the Google submission gateway and the admin CMS are kept and
  reskinned.
- Software / AI / interactive inquiries **do not enter the wizard**. They go
  to the contact block at `/services/software#contact` (email).
- Placeholder projects, recognition and writing entries are allowed, flagged
  `placeholder: true`, and always carry a visible `PLACEHOLDER` badge.
- No invented prices, metrics, client names or event names presented as real.

---

## 1. Site map

All public routes live under `/:lang` (`zh` | `en`). zh and en are separate
URLs with separately authored copy.

| Route | Status | Purpose | Primary user goal | Leads to (CTA) |
| --- | --- | --- | --- | --- |
| `/` (index → `/zh` or `/en`) | unchanged | Locale negotiation via cookie / `Accept-Language` | Land in the right language | `/:lang` |
| `/:lang` | redesigned | Home. Establish who Kamel is, prove range, route to work or a project | Understand the value proposition in 10–15 s | START A PROJECT → `/:lang/commission`; VIEW WORK → `/:lang/works` |
| `/:lang/works` | redesigned | Work index, D1 works + file projects, `?category=` filter | Find evidence relevant to *their* project type | Project detail; START A PROJECT |
| `/:lang/works/:slug` | redesigned | Case study (file project) or block-rendered work (D1) | Judge quality and process | Next project; START A PROJECT |
| `/:lang/services` | **new** | Overview of the three service groups | Decide which kind of help they need | `/mixing`, `/song-transition`, `/services/software`; START A PROJECT |
| `/:lang/mixing` | reskinned | Mixing selection page (Full Mix + Vocal Mix only) | Compare the two mixing services and prices | Service detail pages |
| `/:lang/mixing/full`, `/:lang/mixing/vocal` | reskinned | Service detail: price, timeline, deliverables | Confirm scope and price | "Start a commission" → `/:lang/commission?service=<id>` (existing target) |
| `/:lang/song-transition` | reskinned | Transition selection page (Simple + Edit only) | Compare the two transition services | Service detail pages |
| `/:lang/song-transition/simple`, `/:lang/song-transition/edit` | reskinned | Service detail | Confirm scope and price | "Start a commission" → `/:lang/commission?service=<id>` |
| `/:lang/services/software` | **new** | Software / AI / interactive offering, engagement models, contact block. No prices | Understand what can be built and how to start | `#contact` email block (`mailto:`) |
| `/:lang/about` | **new** | How Kamel thinks and works across software and sound. Not an autobiography | Build trust in the person | START A PROJECT; Work |
| `/:lang/writing` | renamed from `/other` | Editorial cards: D1 posts + file-based external links | Read or follow Kamel elsewhere | Post detail or external site (new tab) |
| `/:lang/writing/:slug` | renamed from `/other/:slug` | D1 post detail in the new document layout | Read a post | Back to Writing; START A PROJECT |
| `/:lang/other` | **301** | Legacy | — | `301 → /:lang/writing` (query string preserved) |
| `/:lang/other/:slug` | **301** | Legacy | — | `301 → /:lang/writing/:slug` (query string preserved) |
| `/:lang/commission` | reskinned | START A PROJECT landing: choose project type | Pick the right path | `/commission/mixing`, `/commission/song-transition`, `/services/software#contact` |
| `/:lang/commission/:category` | reskinned | Choose one of the two services of a category (with price) | Pick a service | `/commission/:category/:service` |
| `/:lang/commission/:category/:service` | reskinned | Commission wizard, steps unchanged: `details → terms → review → verify` | Submit a commission | `/commission/success` |
| `/:lang/commission/success` | reskinned | Confirmation (case ID, service, date) | Know what happens next | Home |
| `/:lang/terms`, `/:lang/privacy` | reskinned | Legal documents in the new document style | Read the terms | Back to commission / home |
| `/language/:locale` | unchanged | Sets `kamel_locale` cookie, redirects to `returnTo` | Switch language | — |
| `/health`, `/api/commission/*` | unchanged | Infrastructure | — | — |
| `/admin/**` (index, content, services, terms, works, links, posts, cases …) | **unchanged, tokens only** | Admin CMS. Imports the shared `tokens.css`; layout, routes and behaviour untouched | — | — |
| any unmatched path | redesigned | Error page (404 vs generic) | Recover | Home; Work; START A PROJECT |

Notes:

- Redirects are implemented as route modules whose loader returns
  `redirect(target, 301)`; they must not render UI. A unit test covers the
  redirect helper (`/zh/other?x=1 → /zh/writing?x=1`, `/en/other/abc →
  /en/writing/abc`).
- Production D1 `links` rows that still point to `/other` keep working via the
  301; the admin should update them, but it is not a blocker.
- `?category=` with an unknown value renders the "All" view (no 404) and the
  canonical link points to `/:lang/works`.

---

## 2. Global navigation

### 2.1 Items (in DOM order)

| # | Item | zh label | en label | Target | Active (`aria-current="page"`) when path starts with |
| --- | --- | --- | --- | --- | --- |
| 0 | Brand | `Kamel` | `Kamel` | `/:lang` | exact `/:lang` |
| 1 | Work | 作品 | Work | `/:lang/works` | `/works` |
| 2 | Services | 服務 | Services | `/:lang/services` | `/services`, `/mixing`, `/song-transition` |
| 3 | About | 關於 | About | `/:lang/about` | `/about` |
| 4 | Writing | 文章 | Writing | `/:lang/writing` | `/writing` |
| 5 | CTA | 開始合作 | Start a project | `/:lang/commission` | `/commission` (index only) |
| 6 | Language switcher | `中文 / EN` | `中文 / EN` | `/language/<other>?returnTo=…` | — |

- The old "Home" text item is dropped; the brand link is the home link.
- The en CTA is authored as "Start a project" and rendered uppercase with CSS
  (`text-transform`), so the accessible name stays "Start a project" and
  visible text matches it (WCAG 2.5.3). zh keeps "開始合作" (no uppercase).
- **Nested Mixing / Song Transition menus are removed** from the header
  (`NavigationGroup`, its disclosure buttons, `expand*/collapse*` copy keys and
  the Arrow-key menu handling). Those four service pages are reached from:
  `/services` (group cards), the footer "Services" group, the home Services
  section and the pricing preview.

### 2.2 Accessible names

| Control | zh | en |
| --- | --- | --- |
| Skip link | 跳至主要內容 | Skip to main content |
| Brand link | Kamel（主頁） — `aria-label="Kamel 主頁"` | `aria-label="Kamel home"` |
| Menu button (closed) | 開啟選單 | Open menu |
| Menu button (open) | 關閉選單 | Close menu |
| Primary navigation landmark (`<nav aria-label>`) | 主要導覽 | Primary navigation |
| CTA link | 開始合作 | Start a project |
| Language switcher | `Switch to English` (unchanged; names the target language) | `切換至繁體中文` (unchanged) |
| Footer navigation landmark | 頁尾連結 | Footer links |

The brand link must not be a heading. No other heading on the home page may
contain the substring "Kamel" (the e2e test `getByRole("heading", { name:
"Kamel" })` is a substring match and is strict).

### 2.3 Desktop (≥ 1024 px)

- One row: brand left; Work / Services / About / Writing centred or right in the
  12-col grid; CTA as a solid button; language switcher last.
- Header is sticky, compacts on scroll down (height only, no hide), and
  never covers the focused element (`scroll-padding-top` = header height).
- All items are plain links; Tab order equals DOM order above. No menus, no
  Arrow-key handling.

### 2.4 Tablet and mobile (< 1024 px)

- Bar: brand, CTA (compact, ≥ 44 × 44 px), menu button (≥ 44 × 44 px).
  Below 360 px the CTA moves into the panel only.
- Menu button toggles a full-width panel (`<nav id>` referenced by
  `aria-controls`, `aria-expanded` reflects state, label swaps
  開啟選單 ⇄ 關閉選單). Panel content: Work, Services, About, Writing (large
  type, 56 px rows), then CTA full width, then language switcher.
- Disclosure pattern, not a modal: no focus trap; `Escape` closes and returns
  focus to the menu button; navigating closes the panel; body scroll is locked
  while open; reduced motion = instant open/close.

---

## 3. Footer

The footer stays data-driven: `listFooterGroups()` reads D1 `link_groups` /
`links` and falls back to `getDefaultFooterGroups()` when D1 has no rows (the
e2e database has no footer rows, so **tests see the defaults**). Desktop renders
`<section>` columns inside `<nav aria-label="頁尾連結 | Footer links">`;
mobile renders one `<details><summary>` accordion per group (summary ≥ 44 px).

### 3.1 New default groups — **5 groups** (count unchanged)

| # | `stable_key` | zh label | en label | Links (zh / en → target) |
| --- | --- | --- | --- | --- |
| 1 | `navigate` | 導覽 | Navigate | 作品 / Work → `/works`; 服務 / Services → `/services`; 關於 / About → `/about`; 文章 / Writing → `/writing` |
| 2 | `services` | 服務 | Services | 混音 / Mixing → `/mixing`; 歌曲銜接 / Song Transition → `/song-transition`; 軟體與互動 / Software & Interactive → `/services/software`; 開始合作 / Start a project → `/commission` |
| 3 | `work_resources` | 作品與資源 | Work & Resources | GitHub → `https://github.com/kekekewww`; 網站專案 / Website repository → `https://github.com/kekekewww/kamelkyp.com` |
| 4 | `contact` | 聯絡 | Contact | `kevinyaungputra@gmail.com` → `mailto:` |
| 5 | `legal` | 條款與網站 | Legal | 服務條款 / Terms → `/terms`; 隱私說明 / Privacy → `/privacy` |

- Changes vs today: `navigate` loses Home and "Other Work", gains Services,
  About, Writing; `services` gains Software & Interactive and relabels the
  commission link to 開始合作 / Start a project.
- `find_me` label stays in `GROUP_LABELS` for D1-driven setups but is not in the
  defaults (no social handles are known; none are invented).
- Link count: 13 `<a>` in footer groups (test requires > 3).

### 3.2 Footer lead and base

- Eyebrow: `KAMEL / CONTACT`.
- Lead (zh): 混音、歌曲銜接、軟體與互動專案——先說說你想做的東西。
- Lead (en): Mixing, song transitions, software and interactive work — tell me
  what you want to make.
- Email text link (unchanged address).
- Base row: `© <year> Kamel` · 臺灣 · 遠端合作 / Taiwan · Remote.
- The footer never shows prices (the en `/mixing` test asserts zero `NT$`).

---

## 4. Page-by-page content hierarchy

Share-of-height figures are for a 1440 px desktop viewport at typical content
volume and are guidance for the visual agent, not hard limits.

### 4.1 Home `/:lang`

Section order is fixed by the spec. Headings are `h2` unless noted.

| # | Section | Eyebrow (both locales) | Heading zh / en | Data | CTA | Share |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hero | `SOUND × SOFTWARE × INTERACTION` | `h1` **Kamel** (both). Above it the real-name line: `楊子賢` / `Kevin Yang` (a `<p>`, not a heading). Roles line: 音樂製作人 · 軟體開發者 · 創意科技 / Music Producer · Software Developer · Creative Technologist. Statement: 打造系統、聲音與互動體驗。/ Building systems, sound, and interactive experiences. | D1 `page/home` media → first item is the showreel (existing `listMediaForVersion`); canvas hero visual reads its amplitude | **CTA #1**: 開始合作 / Start a project (primary) + 查看作品 / View work (secondary, → `/works`) | 15 % (≈ 100 vh) |
| 2 | Selected Work | `SELECTED WORK / 2024—2026` | 精選作品 / Selected Work | Merged list (see 4.2), first 4 items where file `featured: true`, plus the most recent D1 work first if one exists; must span ≥ 3 categories | Text link 所有作品 → / All work → (`/works`) | 25 % |
| 3 | Capabilities | `CAPABILITIES / 04` | 能力範圍 / Capabilities | `capabilities.ts` (4 groups) | none | 10 % |
| 4 | Recognition | `RECOGNITION` | 獲獎與肯定 / Recognition | `recognition.ts`, newest 3, metadata rows `YEAR / EVENT / RESULT` | none | 6 % |
| 5 | Services | `SERVICES / 03` | 服務 / Services | Static: three groups (Mixing, Song Transition, Software & Interactive) with one-line descriptions | Text links to each group page; 查看全部服務 / All services → `/services` | 10 % |
| 6 | Pricing preview | `PRICING` | 價格參考 / Pricing | `SERVICE_CATALOG` + price repository via `getPublicPriceContext` (FX snapshot on en). Three rows: Mixing — 起價 / Starting at *min(full, vocal)*; Song Transition — 起價 *min(simple, edit)*; Software & Interactive — 依專案報價 / Contact for quote | **CTA #2**: 開始合作 / Start a project | 8 % |
| 7 | About teaser | `ABOUT` | 關於 / About (**must not contain "Kamel"**) | `about.ts` → `teaser` block | Text link 更多關於我 → / More about me → (`/about`) | 7 % |
| 8 | Writing | `WRITING / NOTES` | 文章與貼文 / Writing | Merged writing list (see 4.9), newest 3 | Text link 所有文章 → / All writing → | 9 % |
| 9 | Contact CTA | `START A PROJECT` | 有想做的作品嗎？/ Have a project in mind? | Static copy + email | **CTA #3**: 開始合作 / Start a project; secondary email link | 7 % |
| 10 | Footer | — | — | footer groups | — | 3 % |

Rules:

- Exactly three in-page START A PROJECT CTAs (hero, pricing, contact). Pricing
  (6) and Contact (9) are separated by About teaser and Writing, so no two are
  adjacent. The header CTA is global chrome and not counted.
- The home Pricing preview shows category-level "starting at" prices only; it is
  not a selection page, and never lists all four services side by side.
- Showreel empty state strings are kept (尚無可播放的 Showreel / No showreel is
  available yet; 作品待發布 / Showreel pending). Media never autoplays.
- The hero section `aria-label`: 自我介紹 / Introduction (no "Kamel" needed).
- Recommended class hooks for tests: `.home-hero__identity` (name block) and
  `.home-hero__stage` (showreel + visual). See section 8.

### 4.2 Work index `/:lang/works`

Hierarchy:

1. Header: eyebrow `WORK / INDEX`, `h1` 作品 / Work, intro 軟體、AI、互動、
   音樂與混音——同一套方法，不同的媒材。/ Software, AI, interaction, music and
   mixing — one way of working, different materials.
2. Filter bar: `<nav aria-label="作品分類 | Work categories">` containing
   links (not buttons, works without JS): `?category=` values `all` (default,
   no param), `software`, `ai`, `interactive`, `music`, `mixing`, `research`.
   The current filter has `aria-current="page"`. Each link shows a count, e.g.
   `AI 02`. Targets ≥ 44 px; horizontal scroll strip on mobile.
3. Result line (`role="status"`): 共 N 件作品 / N projects.
4. List: editorial rows, metadata row pattern
   `01 / TITLE / CATEGORY · CATEGORY / YEAR`, role under the title, one-line
   description, cover preview on hover/focus (desktop only), `PLACEHOLDER`
   badge when applicable. Whole row is one link to `/works/:slug`.
5. Closing band: 沒看到類似的案子？直接聊聊。/ Don't see something similar?
   Let's talk. + **CTA** 開始合作 / Start a project.

Mixed source list:

- D1 works (`listPublishedContent(db, "work", locale)`) map to the same row
  model: `title`, `summary` → description, `year` from `publishedAt`,
  `categories: ["music"]` (D1 works have no category column; `music` is the
  umbrella for audio work), `placeholder: false`, `source: "d1"`.
- File projects from `app/content/projects.ts`, `source: "file"`.
- Sort order: (1) non-placeholder before placeholder; (2) `year` descending;
  (3) D1 `sort_order` / `published_at` order preserved within D1 items, file
  order preserved within file items; (4) slug ascending as tie-break.
- Slug collisions: file slugs must be prefixed `sample-` while placeholder, and
  a unit test asserts no file slug equals a reserved/known pattern. At runtime
  the detail loader tries D1 first, then the file source.

Empty state (only when a filter has zero matches, e.g. a category whose only
entries were removed): `h2` 此分類尚無作品 / Nothing in this category yet;
text 可以先看看其他分類，或直接聊聊你的案子。/ Try another category, or tell me
about your project.; link 查看全部作品 / View all work.

### 4.3 Project detail `/:lang/works/:slug`

Common frame:

1. Back link: ← 返回作品 / Back to work.
2. Header: eyebrow `WORK / <CATEGORY> / <YEAR>`, `h1` title, `PLACEHOLDER`
   badge + notice when placeholder, one-line description.
3. Metadata grid (`<dl>`): 年份 / Year, 類別 / Category, 角色 / Role,
   技術與工具 / Technology & tools, 服務 / Services (if any).
4. Body (see below).
5. Links (external, `↗`, new tab, `rel="noreferrer noopener"`) and Credits.
6. Next project (next item in the Work index sort order, wraps).
7. **CTA band**: 想做類似的東西？/ Want something like this? + 開始合作 / Start a
   project.

File projects render structured sections in this fixed order, skipping any that
are absent (`sections` array keyed by `kind`):

`context` 背景 / Context → `problem` 問題 / Problem → `approach` 方法 / Approach
→ `process` 過程 / Process → `system` 系統與架構 / System & architecture →
`design` 設計 / Design → `result` 成果 / Result → `media` 媒體 / Media →
`reflection` 心得 / Lessons & reflection.

- A section has `heading?` override and `body: LocalizedText[]` (paragraphs);
  `system` may add `items` (list); `media` uses the project `media` array.
- Media for file projects: images only (local asset path or `https://` on the
  R2 host) with required alt text. **No iframes, no third-party embeds** (the
  security e2e asserts zero iframes before consent on works pages).
- Placeholder projects have `cover: null`; the UI draws a category-coded
  procedural cover. Placeholder detail pages add `<meta name="robots"
  content="noindex">`.

D1 works (`getPublicContent(db, "work", slug, locale)`):

- Same frame; metadata grid shows 年份 (from `publishedAt`) and 類別 = 音樂 / Music
  only. Body is the existing `BlockRenderer` inside the case-study text column
  (media blocks keep `MediaPreview`, consent-gated embeds, playback buttons
  "Play <title>", "Load preview", "Open external media" — unchanged).
- The eyebrow changes from `WORK / <slug>` to `WORK / MUSIC / <YEAR>`; no
  test asserts it.

### 4.4 Services overview `/:lang/services`

1. Header: eyebrow `SERVICES`, `h1` 服務 / Services, intro 三種合作方式：混音、
   歌曲銜接，以及軟體與互動開發。/ Three ways to work together: mixing, song
   transitions, and software & interactive development.
2. Three group blocks (`h2` each), not a selection page, so **no individual
   service names or select buttons**:
   - 混音 / Mixing — 完整歌曲或 Vocal 混音，含母帶。/ Full-song or vocal
     mixing, mastering included. Starting-at price from the price repository.
     Link 查看混音服務 → / View mixing → `/mixing`.
   - 歌曲銜接 / Song Transition — 舞蹈、活動與表演用的歌曲銜接與剪輯。/
     Transitions and edits for dance, events and performance. Starting-at price.
     Link → `/song-transition`.
   - 軟體與互動 / Software & Interactive — 網站、原型、AI 整合、互動裝置。/
     Websites, prototypes, AI integrations, interactive installations.
     依專案報價 / Contact for quote. Link → `/services/software`.
3. How it works (`h2` 合作流程 / How it works): 01 需求 / Brief → 02 報價與確認
   / Quote & confirm → 03 製作 / Production → 04 交付與修改 / Delivery &
   revisions. (Descriptive only; revision specifics live in Terms.)
4. **CTA band**: 開始合作 / Start a project.

### 4.5 Mixing and Song Transition pages (reskin only)

`/mixing`, `/mixing/full`, `/mixing/vocal`, `/song-transition`,
`/song-transition/simple`, `/song-transition/edit` keep **all existing copy,
structure, prices and targets**:

- Selection pages keep `h1` 選擇混音服務 / Choose mixing service and 選擇歌曲銜接
  服務 / Choose song-transition service, `ServiceChoice` with two `h2` service
  names and `ServicePrice`.
- Detail pages keep `ServiceOverview`: `h1` service name, 基礎價格 / Base price,
  標準工期 / Standard timeline, 交付內容 / Deliverables, and the CTA 開始委託 /
  Start a commission → `/:lang/commission?service=<id>`, restyled as the page's
  primary CTA (it is the page's START A PROJECT instance).
- Add only a breadcrumb above the header: 服務 / Services → current group
  (e.g. `服務 / 混音`).
- Must not add: a "starting at" summary (e2e uses strict `getByText("NT$4,000")`
  so a second matching string would fail), any name of the other category
  inside `<main>` (tests assert 單純歌曲銜接 absent on `/zh/mixing`, 完整歌曲混音
  absent on `/zh/song-transition`), or any `NT$` on en pages.
- Reskin: document-style header on the 12-col grid, mono metadata, price set as
  a large tabular figure, deliverables as a ruled list.

### 4.6 Software & Interactive `/:lang/services/software`

1. Header: eyebrow `SERVICES / SOFTWARE & INTERACTIVE`, `h1` 軟體與互動開發 /
   Software & Interactive, intro 從想法到可運作的系統：網站、原型、AI 整合與
   互動體驗。/ From idea to working system: websites, prototypes, AI
   integrations and interactive experiences.
2. `h2` 可以合作的內容 / What I build — offering list from
   `software-services.ts` (7 items, see 6.5).
3. `h2` 合作方式 / Engagement models — two cards, **no prices**:
   - `PROJECT BASED` 專案制 / Project based — 範圍明確的案子，依需求與時程
     一次報價。/ Defined scope, quoted once against requirements and timeline.
   - `CUSTOM QUOTE` 客製報價 / Custom quote — 範圍仍在探索的案子，先討論再
     估價。/ Scope still forming; we talk first, then estimate.
   - Price line on both: 依專案報價 / Contact for quote.
4. `h2` 流程 / Process: 01 對話 / Conversation → 02 範圍與報價 / Scope & quote
   → 03 原型 / Prototype → 04 開發 / Build → 05 交付 / Handover.
5. Related work: up to 3 projects from the merged list with category
   `software`, `ai` or `interactive` (text list, links to detail).
6. **Contact block** `id="contact"` (`h2` 聊聊你的專案 / Tell me about your
   project):
   - Text: 軟體與互動專案目前以 Email 洽談，不經過線上委託表單。/ Software and
     interactive projects are handled by email, not through the commission form.
   - "請附上" / "Please include": 專案類型 / Project type; 想解決的問題 /
     The problem to solve; 期望時程 / Timeline; 參考資料或連結 / References or
     links; 預算範圍（可選）/ Budget range (optional).
   - Primary button (this page's START A PROJECT instance): 寄信聯絡 / Email me
     → `mailto:kevinyaungputra@gmail.com?subject=<encoded>` with subject
     `[軟體與互動] 專案洽詢` / `[Software & Interactive] Project inquiry`.
   - Plain-text address visible and selectable next to the button.
   - The header CTA on this page still goes to `/commission`; the anchor must
     scroll below the sticky header.

### 4.7 About `/:lang/about`

Not an autobiography; no real name (it appears only on the landing page).

1. Header: eyebrow `ABOUT`, `h1` 關於 / About, lede from `about.ts`
   (`lede`): e.g. zh 我做系統，也做聲音。兩者對我來說是同一件事：把複雜的東西
   整理成可以被感受的結構。/ en I build systems and I make sound. To me they are
   the same job: turning complexity into structure you can feel.
2. `h2` 我做的東西 / What I make — the four capability groups (links to Work
   filtered by category).
3. `h2` 我怎麼思考 / How I think — 2–3 short paragraphs (systems, precision,
   iteration).
4. `h2` 軟體與聲音 / Software and sound — how the two practices connect.
5. `h2` 工作方式 / How I work — 4 principles as a numbered list.
6. **CTA band**: 開始合作 / Start a project + text link 查看作品 / View work.

### 4.8 Writing index `/:lang/writing`

1. Header: eyebrow `WRITING / NOTES / LINKS`, `h1` 文章 / Writing, intro
   文章、技術筆記與社群上的短文。/ Articles, technical notes and short posts from
   social platforms.
2. Editorial card list (no feed, no embeds), newest first by date. Card:
   `KIND / YYYY.MM.DD` mono line, `h2` title, source line, action:
   - D1 post → 閱讀全文 → / Read → `/:lang/writing/:slug` (same tab).
   - File entry with `url` → 在 Threads 閱讀 ↗ / Read on Threads ↗ (new tab;
     `Instagram`, the article host name, etc. substitute).
   - Placeholder file entry (`url: null`) → no link; shows `PLACEHOLDER` badge
     and 連結待補 / Link pending.
3. Kind labels (both locales in mono caps): `ARTICLE`, `THREAD`, `POST`.
4. **CTA band** (small): 開始合作 / Start a project.
5. Empty state (only if both sources are empty): `h2` 目前沒有已發布內容 /
   Nothing published yet (existing strings kept).

D1 posts map: `kind: "article"`, `source: "kamelkyp.com"`, `date` =
`publishedAt`, `placeholder: false`.

### 4.9 Writing detail `/:lang/writing/:slug`

Existing `other-detail` behaviour under the new path: back link ← 返回文章 /
Back to writing; eyebrow `ARTICLE / YYYY.MM.DD`; `h1` title; summary;
`BlockRenderer` body in a 65-ch column; closing CTA band 開始合作 / Start a
project. Unknown slug → 404.

### 4.10 Commission

- `/commission` (START A PROJECT landing; "category page" in spec terms, since
  it is where the category is chosen):
  - eyebrow `START A PROJECT`, `h1` 開始合作 / Start a project, intro 先選擇合作
    類型。混音與歌曲銜接可直接線上委託；軟體與互動專案以 Email 洽談。/ Choose a
    project type. Mixing and song transitions are commissioned online; software
    and interactive projects are handled by email.
  - Three choices; **link text is exactly the label** (descriptions are sibling
    text, referenced by `aria-describedby`, never inside the link):
    1. 混音 / Mixing → `/commission/mixing` — 線上委託 / Online commission
    2. 歌曲銜接 / Song transition → `/commission/song-transition` — 線上委託
    3. 軟體與互動 / Software & Interactive → `/services/software#contact` —
       以 Email 洽談 / By email
  - Descriptions must not contain the four service names (e2e asserts
    完整歌曲混音 absent on `/zh/commission`).
- `/commission/:category`: unchanged copy (選擇混音服務 …), only two services,
  prices from repository. Breadcrumb `開始合作 / 混音`.
- `/commission/:category/:service`: wizard unchanged, steps `details`,
  `terms`, `review`, `verify`; step list label 委託步驟 / Commission steps; all
  field labels and buttons unchanged (tests depend on 下一步, Next, Review,
  Submit commission, Retry notification, …). The header CTA is kept but the
  page adds no extra START A PROJECT.
- `/commission/success`: unchanged copy, reskinned; link 返回主頁 / Back home.

### 4.11 Terms / Privacy

`h1` 服務條款 / Terms of service and 隱私說明 / Privacy unchanged. New document
style: sticky table of contents from clause `h2`s on desktop, effective date in
mono, 65-ch measure. Small closing link 開始合作 / Start a project (text link,
not a band).

### 4.12 Error page (root `ErrorBoundary`)

Rendered outside the public shell (no header/footer), so it carries its own
recovery links.

| Case | Eyebrow | `h1` zh / en | Body zh / en | Links |
| --- | --- | --- | --- | --- |
| 404 | `404 / NOT FOUND` | 找不到這個頁面 / Page not found | 這個網址可能已經移動或不存在。/ This address may have moved or never existed. | 返回主頁 / Back to home; 查看作品 / View work; 開始合作 / Start a project |
| other | `<status> / ERROR` | 目前無法顯示這個頁面 / Something went wrong | 請稍後再試，或返回主頁。/ Please try again later or return to the home page. | 返回主頁 / Back to home |

No stack traces or error object names are ever rendered.

---

## 5. Conversion flow

### 5.1 START A PROJECT placement

The header CTA is on every public page. In-page placements:

| Page | In-page CTA(s) | Target |
| --- | --- | --- |
| Home | 3: hero, pricing preview, contact section (never adjacent) | `/commission` |
| Work index | closing band | `/commission` |
| Project detail | closing band after Next project | `/commission` |
| Services overview | closing band | `/commission` |
| Mixing / Transition selection | none extra; each service card links to its detail | — |
| Service detail (×4) | 開始委託 / Start a commission (existing) | `/commission?service=<id>` |
| Software & Interactive | contact block button 寄信聯絡 / Email me | `mailto:` |
| About | closing band | `/commission` |
| Writing index / detail | small closing band | `/commission` |
| Commission pages | none (header CTA only) | — |
| Terms / Privacy | text link | `/commission` |
| 404 | link | `/commission` |

Every page therefore offers at least one path to start a project (header +
in-page), home has three in-page, and no page places two START A PROJECT
blocks next to each other.

### 5.2 Journeys (brief section 27) mapped to routes

Primary:
`/:lang` hero (who, roles, statement) → Selected Work (impressive work, mixed
categories) → Capabilities → Recognition (trust) → Services → Pricing preview
(engagement model) → CTA → `/:lang/commission` → mixing/transition wizard *or*
`/services/software#contact`.

Secondary:

| Journey | Routes |
| --- | --- |
| Landing → Work → Case study → Contact | `/:lang` → `/works` → `/works/:slug` → closing CTA → `/commission` |
| Landing → Mixing → Audio work → Pricing → Contact | `/:lang` (Services section or showreel) → `/works?category=mixing` via Work nav or the Selected Work mixing item → `/works/:slug` (audio via `MediaPreview`) → `/mixing` → `/mixing/full` (price) → 開始委託 → `/commission?service=full_mix` → wizard. The `/mixing` page gets no extra cross-links, to stay focused |
| Landing → Software → Case study → Contact | `/:lang` → `/services/software` → related project → `/works/:slug` → CTA → `/commission` → 軟體與互動 → `/services/software#contact` → `mailto:` |
| Landing → Article → Threads / Instagram | `/:lang` Writing section → `/writing` → external card → Threads / Instagram (new tab) |

---

## 6. Content model (`app/content/`)

Shared primitives (reuse `LocalizedText` from `app/lib/services/catalog.ts`,
or move it to `app/content/types.ts` and re-export):

```
LocalizedText   = { zh: string; en: string }          // both required, non-empty
ProjectCategory = "software" | "ai" | "interactive" | "music" | "mixing" | "research"
HttpsUrl        = string (https: only)
IsoDate         = "YYYY-MM-DD"
```

Category labels:

| Value | zh | en |
| --- | --- | --- |
| `all` (filter only) | 全部 | All |
| `software` | 軟體 | Software |
| `ai` | AI | AI |
| `interactive` | 互動 | Interactive |
| `music` | 音樂 | Music |
| `mixing` | 混音 | Mixing |
| `research` | 研究 | Research |

**Placeholder semantics** (all content files):

- `placeholder: boolean`, required, no default.
- `true` means: sample content standing in for real work. The UI must render the
  `PLACEHOLDER` badge on every card, row and detail header showing it; detail
  pages add the notice 此為示意內容，將由實際作品取代。/ Sample content — to be
  replaced with real work., and `noindex`.
- Schema refinement when `placeholder: true`: `title.en` starts with
  `Sample:` and `title.zh` starts with `示意：`; `links`, `credits` and
  `metrics`-like text are empty; `url` may be `null` (writing).
- Unit test: every entry parses; slugs unique; placeholder titles follow the
  prefix rule; no placeholder text contains `NT$`, `US$`, `%` or digits
  followed by "users/clients/streams" (guards against invented metrics).

### 6.1 `projects.ts`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | stable, e.g. `p-001` |
| `slug` | `string` kebab | placeholders prefixed `sample-` |
| `title` | `LocalizedText` | |
| `year` | `number` (2000–2100) | |
| `categories` | `ProjectCategory[]` (min 1, unique) | first = primary, drives cover and eyebrow |
| `role` | `LocalizedText` | |
| `description` | `LocalizedText` | one line, ≤ 140 chars en |
| `featured` | `boolean` | eligible for home Selected Work |
| `services` | `LocalizedText[]` | e.g. Mixing, Development |
| `technologies` | `string[]` | tool names, not localized |
| `cover` | `{ src: string; alt: LocalizedText } \| null` | `null` → procedural cover |
| `media` | `{ type: "image"; src: string; alt: LocalizedText; caption?: LocalizedText }[]` | no embeds |
| `links` | `{ label: LocalizedText; url: HttpsUrl }[]` | |
| `credits` | `{ role: LocalizedText; name: string }[]` | |
| `sections` | `{ kind: "context" \| "problem" \| "approach" \| "process" \| "system" \| "design" \| "result" \| "reflection"; heading?: LocalizedText; body: LocalizedText[]; items?: LocalizedText[] }[]` | unique `kind`; rendered in fixed order |
| `placeholder` | `boolean` | |

Placeholder projects (6; all `placeholder: true`, `cover: null`, `links: []`,
`credits: []`):

| # | slug | title en / zh | categories | year | role en / zh | description en / zh | featured |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | `sample-generative-audio-visual-tool` | Sample: Generative Audio-Visual Tool / 示意：生成式影音工具 | ai, software | 2026 | Design & development / 設計與開發 | Placeholder for a tool that turns audio features into generative visuals. / 示意內容：將音訊特徵轉為生成式畫面的工具。 | yes |
| 02 | `sample-full-song-mix` | Sample: Full Song Mix — Indie Single / 示意：完整歌曲混音——獨立單曲 | mixing, music | 2025 | Mixing & mastering / 混音與母帶 | Placeholder for a full mix and master of an independent single. / 示意內容：一首獨立單曲的完整混音與母帶。 | yes |
| 03 | `sample-interactive-projection-study` | Sample: Interactive Projection Study / 示意：互動投影研究 | interactive | 2025 | Creative development / 創意開發 | Placeholder for a projection piece where movement shapes a line field. / 示意內容：以肢體動作改變線條場的投影作品。 | yes |
| 04 | `sample-booking-management-system` | Sample: Booking Management System / 示意：預約管理系統 | software | 2024 | Full-stack development / 全端開發 | Placeholder for an internal system that replaces spreadsheets with a web app. / 示意內容：以網頁系統取代試算表的內部工具。 | no |
| 05 | `sample-vocal-production-session` | Sample: Vocal Production Session / 示意：Vocal 製作紀錄 | music | 2024 | Vocal production / 人聲製作 | Placeholder for a vocal recording, editing and tuning session. / 示意內容：一次人聲錄製、編輯與修音的製作紀錄。 | no |
| 06 | `sample-realtime-audio-analysis-notes` | Sample: Real-Time Audio Analysis Notes / 示意：即時音訊分析筆記 | research, ai | 2025 | Research / 研究 | Placeholder for research notes on real-time spectral analysis in the browser. / 示意內容：關於瀏覽器即時頻譜分析的研究筆記。 | yes |

Every category is covered at least once; featured items (01, 02, 03, 06) span
AI, mixing, interactive and research for the home Selected Work. Each
placeholder carries 2–4 `sections` (e.g. `context`, `approach`, `result`) whose
body is plainly sample text such as "示意段落：這裡將說明專案背景。/ Sample
paragraph: this will describe the project context." — no numbers, clients or
outcomes.

### 6.2 `recognition.ts`

| Field | Type |
| --- | --- |
| `id` | `string` |
| `year` | `number` |
| `event` | `LocalizedText` |
| `result` | `LocalizedText` |
| `category` | `ProjectCategory` |
| `url` | `HttpsUrl \| null` |
| `placeholder` | `boolean` |

Rendered as `YEAR / EVENT / RESULT` metadata rows, newest first. Placeholder
entries (3; `url: null`):

| year | event en / zh | result en / zh | category |
| --- | --- | --- | --- |
| 2026 | Sample: Hackathon Entry / 示意：黑客松參賽 | Placeholder result — developer tools track / 示意結果——開發工具組 | software |
| 2025 | Sample: Music Production Competition / 示意：音樂製作比賽 | Placeholder result / 示意結果 | music |
| 2024 | Sample: Creative Technology Showcase / 示意：創意科技展演 | Placeholder result — exhibited work / 示意結果——展出作品 | interactive |

### 6.3 `writing.ts`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `kind` | `"article" \| "thread" \| "post"` | |
| `date` | `IsoDate` | displayed `YYYY.MM.DD` |
| `title` | `LocalizedText` | |
| `source` | `string` | `Threads`, `Instagram`, host name |
| `url` | `HttpsUrl \| null` | `null` allowed only when `placeholder: true` |
| `placeholder` | `boolean` | |

File entries are always external. Placeholder entries (4; `url: null`):

| kind | date | title en / zh | source |
| --- | --- | --- | --- |
| article | 2026-09-01 | Sample: Why I Build Tools Instead of Just Using Them / 示意：為什麼我自己做工具 | kamelkyp.com |
| thread | 2026-08-18 | Sample: Notes on Mixing Vocals for Dance Performances / 示意：為舞蹈演出混人聲的筆記 | Threads |
| post | 2026-07-30 | Sample: Studio Session Snapshot / 示意：工作室片段 | Instagram |
| article | 2026-06-12 | Sample: Building a Bilingual Site on the Edge / 示意：在邊緣網路上做雙語網站 | kamelkyp.com |

### 6.4 `capabilities.ts`

| Field | Type |
| --- | --- |
| `id` | `"software" \| "ai-creative" \| "interactive" \| "sound"` |
| `index` | `"01"`–`"04"` |
| `title` | `LocalizedText` |
| `description` | `LocalizedText` (one sentence) |
| `items` | `LocalizedText[]` (3–5) |
| `categories` | `ProjectCategory[]` (for the About page links into Work) |

Four groups (no placeholder flag needed; this is Kamel's own description of
practice):

1. 軟體系統 / Software Systems — 網站、內部工具與可維護的系統。/ Websites,
   internal tools and maintainable systems. Items: 網頁開發 / Web development;
   內部系統 / Internal systems; 客製軟體 / Custom software. → `software`
2. AI 與創意科技 / AI & Creative Technology — 把模型與演算法變成可以使用的工具。
   / Turning models and algorithms into usable tools. Items: AI 整合 / AI
   integrations; 生成式系統 / Generative systems; 研究原型 / Research
   prototypes. → `ai`, `research`
3. 互動體驗 / Interactive Experiences — 回應人、聲音與空間的作品。/ Work that
   responds to people, sound and space. Items: 互動裝置 / Interactive
   installations; 原型 / Prototypes; 創意開發 / Creative development. →
   `interactive`
4. 聲音 / Sound — 混音、製作與歌曲銜接。/ Mixing, production and song
   transitions. Items: 混音與母帶 / Mixing & mastering; 人聲製作 / Vocal
   production; 歌曲銜接 / Song transitions. → `music`, `mixing`

### 6.5 `software-services.ts`

```
offerings: { id: string; title: LocalizedText; description: LocalizedText }[]
engagementModels: { id: "project-based" | "custom-quote"; label: string /* PROJECT BASED */;
                    title: LocalizedText; description: LocalizedText; price: LocalizedText /* Contact for quote */ }[]
process: { index: string; title: LocalizedText }[]
contact: { email: string; subject: LocalizedText; include: LocalizedText[] }
```

Offerings (7): 網頁開發 / Web development; 原型開發 / Prototypes; AI 整合 / AI
integrations; 內部系統 / Internal systems; 創意科技 / Creative technology; 互動
裝置 / Interactive installations; 客製軟體 / Custom software — each with a
one-sentence description. Schema forbids any `NT$`/`US$`/digit-price pattern.

### 6.6 `about.ts`

```
lede: LocalizedText
teaser: { heading: LocalizedText /* 關於 / About */; body: LocalizedText }
sections: { id: "what" | "think" | "connect" | "work"; heading: LocalizedText;
            body: LocalizedText[]; items?: LocalizedText[] }[]
```

Schema refinement: no string may contain `楊子賢` or `Kevin Yang`, and no
heading may contain `Kamel` (protects the landing-page identity tests).

---

## 7. Copy inventory (new or changed strings)

Existing strings that stay unchanged are not repeated (service names, wizard
labels, legal headings, showreel empty states, language switcher labels).

### 7.1 Navigation and chrome

| Key | zh | en |
| --- | --- | --- |
| `nav.work` | 作品 | Work |
| `nav.services` | 服務 | Services |
| `nav.about` | 關於 | About |
| `nav.writing` | 文章 | Writing |
| `nav.cta` | 開始合作 | Start a project |
| `nav.brandLabel` | Kamel 主頁 | Kamel home |
| `nav.openMenu` | 開啟選單 (unchanged) | Open menu (unchanged) |
| `nav.closeMenu` | 關閉選單 (unchanged) | Close menu (unchanged) |
| `nav.primary` | 主要導覽 (unchanged) | Primary navigation (unchanged) |
| `footer.lead` | 混音、歌曲銜接、軟體與互動專案——先說說你想做的東西。 | Mixing, song transitions, software and interactive work — tell me what you want to make. |
| `footer.software` | 軟體與互動 | Software & Interactive |
| `footer.cta` | 開始合作 | Start a project |
| `breadcrumb.services` | 服務 | Services |
| `badge.placeholder` | PLACEHOLDER | PLACEHOLDER |
| `notice.placeholder` | 此為示意內容，將由實際作品取代。 | Sample content — to be replaced with real work. |
| `cta.band.default` | 有想做的作品嗎？ | Have a project in mind? |
| `cta.band.project` | 想做類似的東西？ | Want something like this? |
| `cta.band.work` | 沒看到類似的案子？直接聊聊。 | Don't see something similar? Let's talk. |
| `meta.title.home` | Kamel — 聲音、軟體與互動創作 | Kamel — Sound, Software & Interactive Work |
| `meta.description` | Kamel 的作品與服務：混音、歌曲銜接、軟體開發與互動體驗。 | Kamel's work and services: mixing, song transitions, software development and interactive experiences. |

### 7.2 Home

| Key | zh | en |
| --- | --- | --- |
| `home.hero.eyebrow` | SOUND × SOFTWARE × INTERACTION | SOUND × SOFTWARE × INTERACTION |
| `home.hero.realName` | 楊子賢 | Kevin Yang |
| `home.hero.roles` | 音樂製作人 · 軟體開發者 · 創意科技 | Music Producer · Software Developer · Creative Technologist |
| `home.hero.statement` | 打造系統、聲音與互動體驗。 | Building systems, sound, and interactive experiences. |
| `home.hero.viewWork` | 查看作品 | View work |
| `home.hero.label` | 自我介紹 | Introduction |
| `home.work.heading` | 精選作品 | Selected Work |
| `home.work.all` | 所有作品 | All work |
| `home.capabilities.heading` | 能力範圍 | Capabilities |
| `home.recognition.heading` | 獲獎與肯定 | Recognition |
| `home.services.heading` | 服務 | Services |
| `home.services.all` | 查看全部服務 | All services |
| `home.pricing.heading` | 價格參考 | Pricing |
| `home.pricing.startingAt` | 起價 | Starting at |
| `home.pricing.quote` | 依專案報價 | Contact for quote |
| `home.pricing.note` | 實際價格依素材與需求確認後報價。 | Final price is confirmed after reviewing the material and scope. |
| `home.about.heading` | 關於 | About |
| `home.about.more` | 更多關於我 | More about me |
| `home.writing.heading` | 文章與貼文 | Writing |
| `home.writing.all` | 所有文章 | All writing |
| `home.contact.heading` | 有想做的作品嗎？ | Have a project in mind? |
| `home.contact.body` | 混音與歌曲銜接可線上委託；軟體與互動專案以 Email 洽談。 | Mixing and song transitions can be commissioned online; software and interactive projects are handled by email. |

### 7.3 Work

| Key | zh | en |
| --- | --- | --- |
| `works.h1` | 作品 (unchanged) | Work |
| `works.intro` | 軟體、AI、互動、音樂與混音——同一套方法，不同的媒材。 | Software, AI, interaction, music and mixing — one way of working, different materials. |
| `works.filterLabel` | 作品分類 | Work categories |
| `works.count` | 共 {n} 件作品 | {n} projects |
| `works.empty.title` | 此分類尚無作品 | Nothing in this category yet |
| `works.empty.body` | 可以先看看其他分類，或直接聊聊你的案子。 | Try another category, or tell me about your project. |
| `works.empty.link` | 查看全部作品 | View all work |
| `work.back` | 返回作品 | Back to work |
| `work.meta.year` | 年份 | Year |
| `work.meta.category` | 類別 | Category |
| `work.meta.role` | 角色 | Role |
| `work.meta.tech` | 技術與工具 | Technology & tools |
| `work.meta.services` | 服務 | Services |
| `work.section.context` | 背景 | Context |
| `work.section.problem` | 問題 | Problem |
| `work.section.approach` | 方法 | Approach |
| `work.section.process` | 過程 | Process |
| `work.section.system` | 系統與架構 | System & architecture |
| `work.section.design` | 設計 | Design |
| `work.section.result` | 成果 | Result |
| `work.section.media` | 媒體 | Media |
| `work.section.reflection` | 心得 | Lessons & reflection |
| `work.links` | 連結 | Links |
| `work.credits` | 參與人員 | Credits |
| `work.next` | 下一個作品 | Next project |
| category labels | 全部 · 軟體 · AI · 互動 · 音樂 · 混音 · 研究 | All · Software · AI · Interactive · Music · Mixing · Research |

### 7.4 Services and Software

| Key | zh | en |
| --- | --- | --- |
| `services.h1` | 服務 | Services |
| `services.intro` | 三種合作方式：混音、歌曲銜接，以及軟體與互動開發。 | Three ways to work together: mixing, song transitions, and software & interactive development. |
| `services.mixing.body` | 完整歌曲或 Vocal 混音，含母帶。 | Full-song or vocal mixing, mastering included. |
| `services.mixing.link` | 查看混音服務 | View mixing |
| `services.transition.body` | 舞蹈、活動與表演用的歌曲銜接與剪輯。 | Transitions and edits for dance, events and performance. |
| `services.transition.link` | 查看歌曲銜接服務 | View song transition |
| `services.software.title` | 軟體與互動 | Software & Interactive |
| `services.software.body` | 網站、原型、AI 整合、互動裝置。 | Websites, prototypes, AI integrations, interactive installations. |
| `services.software.link` | 查看軟體與互動服務 | View software & interactive |
| `services.process.heading` | 合作流程 | How it works |
| `services.process.steps` | 需求 · 報價與確認 · 製作 · 交付與修改 | Brief · Quote & confirm · Production · Delivery & revisions |
| `software.h1` | 軟體與互動開發 | Software & Interactive |
| `software.intro` | 從想法到可運作的系統：網站、原型、AI 整合與互動體驗。 | From idea to working system: websites, prototypes, AI integrations and interactive experiences. |
| `software.offer.heading` | 可以合作的內容 | What I build |
| `software.models.heading` | 合作方式 | Engagement models |
| `software.model.project` | 專案制 — 範圍明確的案子，依需求與時程一次報價。 | Project based — defined scope, quoted once against requirements and timeline. |
| `software.model.custom` | 客製報價 — 範圍仍在探索的案子，先討論再估價。 | Custom quote — scope still forming; we talk first, then estimate. |
| `software.price` | 依專案報價 | Contact for quote |
| `software.process.heading` | 流程 | Process |
| `software.process.steps` | 對話 · 範圍與報價 · 原型 · 開發 · 交付 | Conversation · Scope & quote · Prototype · Build · Handover |
| `software.related.heading` | 相關作品 | Related work |
| `software.contact.heading` | 聊聊你的專案 | Tell me about your project |
| `software.contact.body` | 軟體與互動專案目前以 Email 洽談，不經過線上委託表單。 | Software and interactive projects are handled by email, not through the commission form. |
| `software.contact.include` | 請附上：專案類型、想解決的問題、期望時程、參考資料或連結、預算範圍（可選）。 | Please include: project type, the problem to solve, timeline, references or links, budget range (optional). |
| `software.contact.button` | 寄信聯絡 | Email me |
| `software.contact.subject` | [軟體與互動] 專案洽詢 | [Software & Interactive] Project inquiry |

### 7.5 About, Writing, Commission, Error

| Key | zh | en |
| --- | --- | --- |
| `about.h1` | 關於 | About |
| `about.what` | 我做的東西 | What I make |
| `about.think` | 我怎麼思考 | How I think |
| `about.connect` | 軟體與聲音 | Software and sound |
| `about.work` | 工作方式 | How I work |
| `writing.h1` | 文章 | Writing |
| `writing.intro` | 文章、技術筆記與社群上的短文。 | Articles, technical notes and short posts from social platforms. |
| `writing.read` | 閱讀全文 | Read |
| `writing.readOn` | 在 {source} 閱讀 | Read on {source} |
| `writing.pending` | 連結待補 | Link pending |
| `writing.back` | 返回文章 | Back to writing |
| `writing.empty.title` | 目前沒有已發布內容 (unchanged) | Nothing published yet (unchanged) |
| `commission.h1` | 開始合作 | Start a project |
| `commission.intro` | 先選擇合作類型。混音與歌曲銜接可直接線上委託；軟體與互動專案以 Email 洽談。 | Choose a project type. Mixing and song transitions are commissioned online; software and interactive projects are handled by email. |
| `commission.choice.software` | 軟體與互動 | Software & Interactive |
| `commission.choice.online` | 線上委託 | Online commission |
| `commission.choice.email` | 以 Email 洽談 | By email |
| `error.404.title` | 找不到這個頁面 | Page not found |
| `error.404.body` | 這個網址可能已經移動或不存在。 | This address may have moved or never existed. |
| `error.generic.title` | 目前無法顯示這個頁面 (unchanged) | Something went wrong (unchanged) |
| `error.links` | 返回主頁 · 查看作品 · 開始合作 | Back to home · View work · Start a project |

---

## 8. Test impact

| Spec / test | Current assertion | Breaks? | Replacement |
| --- | --- | --- | --- |
| `public-navigation` › landing identity | primary nav link `混音` → `/zh/mixing` | **yes** | nav link `服務` → expect `/zh/services`; then `main` link `混音` (exact) → `/zh/mixing`; keep the heading checks (完整歌曲混音, Vocal 混音) and 單純歌曲銜接 count 0 |
| same | heading `Kamel`; `楊子賢` count 1 | no | keep; add `/en`: `Kevin Yang` count 1 |
| `public-navigation` › mobile menu/footer | `footer details` count 5 | no | keep 5 |
| `public-navigation` › empty collections | `/zh/works` heading `作品` | no | keep |
| same | `/zh/works` heading `作品準備中` | **yes** (placeholders fill the list) | assert `getByText("PLACEHOLDER").first()` visible and `navigation` "作品分類" present; `/zh/works?category=research` shows 示意：即時音訊分析筆記 and not 示意：完整歌曲混音——獨立單曲; empty state covered by a unit test of the filter helper |
| same | `/en/other` heading `Other Work` + `Nothing published yet` | **yes** | `request.get("/en/other", { maxRedirects: 0 })` → 301, `location` `/en/writing`; `/en/writing` heading `Writing` and a `PLACEHOLDER` badge |
| same | terms / privacy headings | no | keep |
| `final-acceptance` › identity | `.landing-console__identity` / `.landing-console__content` boxes | **yes** (classes renamed) | `.home-hero__identity` / `.home-hero__stage`, same geometry assertions (≥ 340 px at 1440; stacked and left-aligned at 390) |
| same | heading `Kamel` count 1, `楊子賢` count 1 | no, **if** no other home heading contains "Kamel" | keep |
| `final-acceptance` › service entry pages | mixing/transition headings, NT$ strict matches, US$260.00 | no | keep (reskin must not add "starting at" figures or cross-category names in `<main>`) |
| `final-acceptance` › commission form | wizard labels and totals | no | keep |
| `final-acceptance` › safety | `footer summary` count 5 | no | keep |
| same | `/en/does-not-exist` heading `Something went wrong` | **yes** | heading `Page not found`; keep "no stack / ErrorResponseImpl" check; add `/zh/does-not-exist` → `找不到這個頁面` |
| `responsive-a11y` › landing widths | heading `Kamel`, no overflow | no | keep |
| `responsive-a11y` › desktop submenu keyboard | Mixing link → Full Song Mixing submenu, ArrowDown, Escape | **yes** (submenu removed) | "primary navigation is a flat keyboard list": at 1440, Tab from the brand reaches Work, Services, About, Writing, Start a project in order; Enter on Services → `/en/services`; `getByRole("link", { name: "Full Song Mixing" })` count 0 in the header |
| `responsive-a11y` › mobile touch targets | menu button `開啟選單` ≥ 44; 5 summaries ≥ 44 | no | keep; add header CTA `開始合作` box ≥ 44 × 44 |
| `responsive-a11y` › axe on `/en` | no serious violations | no | keep; add axe on `/en/works`, `/en/services/software`, `/en/about` |
| `commission-navigation` | `/zh/commission` main links `混音`, `歌曲銜接` (exact), 完整歌曲混音 absent | no, **if** link text stays exact and descriptions avoid service names | keep; add third link `軟體與互動` → `/zh/services/software#contact` |
| `commission-*`, `service-currency` | wizard and price strings | no | keep |
| `media-*`, `security-headers` | D1 `/en/works/<fixture>` block rendering, zero iframes before consent | no, **if** D1 lookup precedes file lookup and file projects never embed iframes | keep |
| `smoke` | health, root → `/zh` | no | keep |

New unit tests (spec section 8): content schemas (every entry, placeholder
rules, About name guard), category filter helper (all / each category /
unknown value → all / empty result), merged sort order, redirect helper.
