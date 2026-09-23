# Design System: Cold Industrial Editorial

Date: 2026-09-23 · Owner: Visual Design Agent · Branch: `worktree-editorial-redesign`

Inputs, in precedence order: repo adaptation spec (§5 Visual system), master brief (§5, 6, 7, 11, 14, 17, 18, 22, 25, 26), `docs/design-principles.md` (binding), `docs/design-reference.md`, `docs/information-architecture.md`, and the current `app/styles/*.css`.

This document sets **exact values**. `docs/design-principles.md` says what counts as right, and this file says how it is built. Motion durations and easings are named here as tokens. `docs/motion-system.md` owns their final values and choreography, and it may retune a value but must keep the token names.

---

## 1. Direction statement

**The measured line.** Kamel's identity is one horizontal line. It reads as a ruled system line on the left and as a waveform on the right. The hero canvas draws it as a line field that stays straight behind the text and turns into sound across the right half of the page. The same line then returns quietly as list rules, the showreel baseline and the flat trace in empty states. That repetition is how "one creator across software, sound, interaction" shows up. The page is cold near-black with tonal depth, expanded grotesk type at editorial scale, and mono metadata that looks engineered. It leaves behind the bordered navy console, the coral accent, the condensed signage type and the rules around every panel. Space separates things now. Frames do not.

Where the boldness goes: **the KAMEL wordmark and the hero line field**. Everything else stays quiet and disciplined.

---

## 2. Color

### 2.1 Palette and roles

Starting from the brief (§5). Changes from the brief are marked **Δ**.

| Token | Hex | Role |
| --- | --- | --- |
| `--color-bg` | `#090D12` | Page background. Never `#000`. |
| `--color-bg-2` | `#0F151D` | Secondary background: alternate zones (contact band, footer base, mobile menu panel), form field fill. |
| `--color-surface` | `#161E28` | Elevated surface: audio player, hover preview frame, choice cards, sticky TOC, admin sidebar. |
| `--color-surface-hover` **Δ new** | `#1C2632` | Hover/pressed tone on `--color-surface` elements only. |
| `--color-text` | `#E8EDF2` | Primary text, display, headings, the neutral inverse button fill. |
| `--color-text-bright` **Δ new** | `#F5F7F9` | Hover fill of the inverse neutral button only. |
| `--color-text-secondary` **Δ** | `#9AA5B2` | Secondary text: ledes, descriptions, idle nav, body on long-form pages. Brief value `#8995A3` raised so the three text tiers stay distinct once metadata is lightened. |
| `--color-text-meta` **Δ** | `#808D9B` | Metadata text (mono labels, years, counts, categories, placeholders in inputs). Replaces the brief's `#596674` for any readable text. |
| `--color-trace` | `#596674` | The brief's muted value, **decorative only**: the hero line field, unplayed waveform bars, the empty-state flat line, 404 numerals. Never used for text, ever. |
| `--color-rule` **Δ new** | `#1F2934` | Hairline rules between list rows, table rows and footer groups. Decorative. |
| `--color-rule-strong` **Δ new** | `#2A3643` | Hairlines that must read a little more: chip idle border, header bottom edge after scroll, section-internal dividers. Decorative. |
| `--color-control-border` **Δ new** | `#6A7684` | Boundaries of form controls and ghost buttons. Must meet the WCAG 1.4.11 non-text 3:1. |
| `--color-accent` | `#A7C7E7` | Primary accent (pale steel blue). See the budget in 2.4. |
| `--color-accent-hover` **Δ new** | `#C4DAF0` | Hover fill for the accent button. |
| `--color-accent-pressed` **Δ new** | `#8FB3D9` | Pressed fill for the accent button. |
| `--color-on-accent` | `#090D12` | Text and icons on accent fills (= `--color-bg`). |
| `--color-accent-2` | `#788BFF` | Secondary accent. **Live audio state only**: the played portion of the waveform, and the hero carrier line while audio plays. |
| `--color-danger` **Δ new** | `#EBA3A3` | Form errors and error summary. A desaturated rose, not coral. |
| `--color-success` **Δ new** | `#9CCDB3` | Submission success and verified states. |
| `--color-warning` **Δ new** | `#D8C28E` | Commission notices that need attention (e.g. a Turnstile retry). |

Coral (`#FF5C4D`) is removed. The legacy alias `--color-coral` now points at `--color-accent` (see §8).

`<meta name="theme-color" content="#090D12">` (replaces `#071724` in `app/root.tsx`).

### 2.2 Contrast table (WCAG 2.x relative luminance, computed)

Text pairs. AA needs 4.5:1 for text ≤ 18px regular / 14px bold and 3:1 for larger text.

| Foreground \\ Background | `--color-bg` `#090D12` | `--color-bg-2` `#0F151D` | `--color-surface` `#161E28` | `--color-surface-hover` `#1C2632` |
| --- | --- | --- | --- | --- |
| `--color-text` `#E8EDF2` | **16.54** | **15.57** | **14.26** | **12.99** |
| `--color-text-secondary` `#9AA5B2` | **7.79** | **7.33** | **6.72** | **6.12** |
| `--color-text-meta` `#808D9B` | **5.75** | **5.41** | **4.96** | **4.52** |
| `--color-accent` `#A7C7E7` (text, focus ring) | **11.10** | **10.45** | **9.57** | **8.72** |
| `--color-accent-2` `#788BFF` | **6.43** | **6.06** | **5.55** | **5.05** |
| `--color-danger` `#EBA3A3` | **9.56** | **8.99** | **8.24** | **7.50** |
| `--color-success` `#9CCDB3` | **10.94** | **10.30** | **9.43** | **8.59** |
| `--color-warning` `#D8C28E` | **11.16** | **10.50** | **9.62** | **8.76** |

Button pairs:

| Pair | Ratio |
| --- | --- |
| `--color-on-accent` on `--color-accent` (primary CTA idle) | **11.10** |
| `--color-on-accent` on `--color-accent-hover` | **13.58** |
| `--color-on-accent` on `--color-accent-pressed` | **8.92** |
| `--color-bg` on `--color-text` (inverse neutral button) | **16.54** |

Non-text (WCAG 1.4.11, needs 3:1):

| Pair | Ratio |
| --- | --- |
| `--color-control-border` `#6A7684` on bg / bg-2 / surface / surface-hover | **4.21 / 3.96 / 3.63 / 3.31** |
| Focus ring `--color-accent` on any background | ≥ **8.72** |
| `--color-accent-2` played waveform on surface | **5.55** |

Decorative only (exempt, listed so nobody promotes them to text):

| Token | on `--color-bg` | on `--color-surface` |
| --- | --- | --- |
| `--color-trace` `#596674` | 3.32 | 2.86 (**fails 4.5, fails 3:1 on surface**) |
| `--color-rule-strong` `#2A3643` | 1.58 | 1.37 |
| `--color-rule` `#1F2934` | 1.32 | 1.14 |

**Rule:** the brief's `#596674` stays in the system as `--color-trace` for decorative lines only. Every readable label uses `--color-text-meta` `#808D9B`, which passes 4.5:1 on all four surfaces, including `--color-surface-hover`.

### 2.3 Tonal variation on dark backgrounds

The background is never one flat value (principle 6). It is also never a blob, so the variation stays at the edge of perception.

- **Page field** (`body`):
  ```css
  background-color: var(--color-bg);
  background-image:
    radial-gradient(110% 70% at 88% -12%, rgb(22 30 40 / 0.55) 0%, transparent 62%),
    radial-gradient(80% 55% at -8% 108%, rgb(15 21 29 / 0.7) 0%, transparent 70%);
  background-attachment: fixed;
  ```
  The brightest point of the gradient never exceeds `--color-surface` luminance, so every contrast figure in 2.2 still holds. The maximum luminance shift is about 1.2 percentage points.
- **Grain:** one fixed `body::before` layer with an SVG `feTurbulence` noise (`baseFrequency 0.85`, `numOctaves 2`) as a `data:` URI (CSP `img-src` allows `data:`), `opacity: 0.035`, `pointer-events: none`, `z-index: -1`. It dithers gradient banding. Do not raise it above 0.05.
- **Zone shifts:** alternate sections change only between `--color-bg` and `--color-bg-2`. That is a ΔL of about 0.6 percentage points, enough to read as a new zone without a border. At most two `bg-2` zones on the home page: the Pricing preview and the Contact CTA band.
- **Vignette:** allowed only in the hero, as `radial-gradient(120% 90% at 50% 40%, transparent 55%, rgb(5 8 11 / 0.55) 100%)` on the hero section. `rgb(5 8 11)` is the darkest value in the system and is never used as a fill.
- Disallowed: colored gradients, accent tints in backgrounds, `backdrop-filter` anywhere except the sticky header, glass cards.

### 2.4 Accent budget

Target: accent pixels ≤ **5%** of any viewport. Measure it on a screenshot and do not estimate.

**Allowed, and only here:**

1. **Primary CTA fill** (the in-page START A PROJECT instance, the service-detail "Start a commission", the software "Email me", and the mobile menu CTA). At most one filled accent button per viewport. The header CTA is **not** accent (it uses the inverse neutral style, §6.3).
2. **Focus ring** (`:focus-visible`, every interactive element).
3. **Active state of a set**: active work filter chip (fill), active primary-nav item (2px bar), current commission step (2px bar), checked radio or choice dot.
4. **One hero element**: the hero *carrier line* in the canvas (the one line on the wordmark baseline) at 60% opacity.
5. **Live audio state**: `--color-accent-2` for the played waveform and the hero carrier line while audio is playing. Nowhere else.
6. `::selection` background.

**Forbidden:** headings or words inside headings, body links, card or section borders, icons in bulk, section backgrounds, gradients, glows, `box-shadow` in accent, price figures, the PLACEHOLDER badge, category coding, hover states (hover works by contrast and position, never by turning things blue).

---

## 3. Typography

### 3.1 Families

| Role | Package (install) | Import in `app/root.tsx` | `font-family` name |
| --- | --- | --- | --- |
| Display + headings | `@fontsource-variable/archivo` **5.3.0** (axes `wdth` 62–125, `wght` 100–900) | `import "@fontsource-variable/archivo/wdth.css";` (one import carries both `wdth` and `wght`) | `"Archivo Variable"` |
| Body + all Chinese | `@fontsource-variable/noto-sans-tc` 5.3.0 (kept) | `import "@fontsource-variable/noto-sans-tc/wght.css";` (unchanged) | `"Noto Sans TC Variable"` |
| Metadata / labels | `@fontsource/ibm-plex-mono` 5.3.0 (kept) | `import "@fontsource/ibm-plex-mono/500.css";` (unchanged; 500 is the only weight used) | `"IBM Plex Mono"` |

Remove `@fontsource/barlow-condensed` from `package.json` and delete its import.

**Why Archivo.** (1) It is a grotesk built from geometric construction for technical and editorial use, and it has flat terminals, even stroke and precise, industrial numerals with tabular figures, so prices and indexes line up. (2) Its **width axis up to 125** gives an expanded display voice. Expanded caps read as cold, engineered and spec-sheet-like, and they are the opposite of the condensed Barlow being removed, without the quirk of Space Grotesk or the ubiquity of Inter or Geist. (3) One variable file covers wordmark, display, headings, list titles, buttons and prices through `wdth` and `wght` alone.

### 3.2 Stacks

```css
--font-display: "Archivo Variable", "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
--font-body:    "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
--font-mono:    "IBM Plex Mono", "Noto Sans TC Variable", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

Archivo has no CJK glyphs, so Han characters in any display heading fall through to Noto Sans TC. The zh rules in 3.4 adjust size and weight for that case.

### 3.3 Type scale

Four levels (principle 2), each with named sub-levels. Fluid sizes assume `1rem = 16px`. Width is set with `font-stretch` (Fontsource declares the `wdth` range, so `font-stretch: 125%` maps to the axis).

| Level | Token | Size | Line-height | Tracking | Weight / width | Family | Case | Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Display · Wordmark | `--text-wordmark` | `clamp(4rem, 0.5rem + 17vw, 15rem)` | `0.86` | `-0.035em` | 780 / 125% | display | UPPERCASE (CSS) | KAMEL only |
| Display | `--text-display` | `clamp(2.75rem, 1.5rem + 5vw, 6.5rem)` | `0.95` | `-0.025em` | 650 / 112% | display | Sentence | Page `h1`, contact band heading, 404 |
| Heading · L (list title) | `--text-title-list` | `clamp(1.625rem, 0.9rem + 2.8vw, 3.5rem)` | `1.0` | `-0.018em` | 500 / 106% | display | Sentence | Project titles in editorial lists, feature title |
| Heading · 1 | `--text-h1` | `clamp(1.75rem, 1.2rem + 2.2vw, 3.25rem)` | `1.06` | `-0.015em` | 600 / 100% | display | Sentence | Section `h2` |
| Heading · 2 | `--text-h2` | `clamp(1.375rem, 1.1rem + 1vw, 2rem)` | `1.12` | `-0.01em` | 600 / 100% | display | Sentence | `h3`, service names, writing titles |
| Heading · 3 | `--text-h3` | `clamp(1.125rem, 1.05rem + 0.3vw, 1.25rem)` | `1.25` | `0` | 600 / 100% | display | Sentence | Small headings in forms and review summary |
| Price figure | `--text-price` | `clamp(2.5rem, 1.6rem + 3vw, 4.5rem)` | `1.0` | `-0.02em` | 500 / 100%, `tabular-nums` | display | — | Prices |
| Body · Lede | `--text-lede` | `clamp(1.125rem, 1rem + 0.45vw, 1.375rem)` | `1.55` (zh `1.75`) | `0` | 400 | body | Sentence | Intros, hero statement on mobile |
| Body | `--text-body` | `clamp(1rem, 0.96rem + 0.18vw, 1.0625rem)` | `1.65` (zh `1.85`) | `0` | 400 | body | Sentence | Paragraphs, 65ch measure |
| Body · S | `--text-body-s` | `0.875rem` | `1.6` (zh `1.75`) | `0.005em` | 400 / 500 for labels | body | Sentence | Nav links, form labels, notes |
| Metadata | `--text-meta` | `clamp(0.75rem, 0.72rem + 0.12vw, 0.8125rem)` | `1.4` | `0.08em` | 500 | mono | UPPERCASE | Metadata rows, eyebrows, counts, dates, badges |
| Metadata · XS | `--text-meta-xs` | `0.6875rem` | `1.3` | `0.1em` | 500 | mono | UPPERCASE | PLACEHOLDER badge only |

Rules:

- Display ≥ 3× body at 1440 (96px vs 17px) and ≥ 2.5× on a 412px Pixel 7 (44.6px vs 16px). ✔
- Only one Display-level element per viewport. The wordmark counts as that element in the hero.
- Headings use `text-wrap: balance`. Body uses `text-wrap: pretty`. Measure is `max-inline-size: 65ch` for body and `22ch` for Display.
- Numerals in prices, indexes, years and times use `font-variant-numeric: tabular-nums lining-nums`.
- Buttons use the display family at `0.9375rem` / 600 / 100% width with `0.06em` tracking, UPPERCASE in en via `text-transform` so the accessible name keeps its authored case (WCAG 2.5.3).

### 3.4 Chinese and mixed zh/en typesetting

The document language is `zh-Hant`, so target these with `:lang(zh)`.

- **Chinese is never uppercased** (`text-transform` has no effect on Han, but never rely on it for meaning) and **never tracked beyond `0.02em`**. Every tracked style resets under `:lang(zh)`: metadata `0.08em → 0.02em` for elements marked `[data-localized]` (localized category labels, filter chips, footer group summaries). Latin-code metadata such as `SELECTED WORK / 2024—2026` keeps `0.08em` in both locales.
- **Chinese display headings** use Noto Sans TC at a heavier weight and a smaller maximum, because Han glyphs fill the em box and look about 15% larger than Latin caps at the same size:

  | Level | zh size | zh weight | zh line-height | zh tracking |
  | --- | --- | --- | --- | --- |
  | Display | `clamp(2.5rem, 1.5rem + 3.6vw, 4.75rem)` | 800 | `1.12` | `0.01em` |
  | Heading · L | `clamp(1.5rem, 0.95rem + 2.1vw, 2.75rem)` | 700 | `1.2` | `0.01em` |
  | Heading · 1 | `clamp(1.625rem, 1.2rem + 1.6vw, 2.625rem)` | 700 | `1.22` | `0.01em` |
  | Heading · 2 | `clamp(1.25rem, 1.05rem + 0.8vw, 1.75rem)` | 700 | `1.3` | `0.01em` |

  `font-stretch` is ignored by Noto, so Latin words inside a zh heading ("AI 與創意科技") still render in Archivo at the zh size, which balances them against the Han glyphs.
- zh body line-height is `1.85` (vs `1.65` en), with `line-break: strict` and, as progressive enhancement, `text-autospace: ideograph-alpha ideograph-numeric` (inserts the ¼-em gap between Han and Latin/digits). Never insert manual spaces for that purpose.
- Display layouts must not depend on a Latin word breaking at a fixed place. zh headings wrap freely, and `overflow-wrap: anywhere` stays on `body` for the 320px floor.

### 3.5 Hero wordmark and the real-name line

```
SOUND × SOFTWARE × INTERACTION          ← Metadata, --color-text-meta
Kevin Yang / 楊子賢                      ← real-name line
KAMEL                                   ← h1, wordmark
```

- **Wordmark** `h1.home-hero__wordmark`: the DOM text is `Kamel` (e2e asserts the heading name "Kamel"), rendered `text-transform: uppercase`. Archivo `font-stretch: 125%`, `font-weight: 780`, `--text-wordmark`, `line-height: 0.86`, `letter-spacing: -0.035em`, `--color-text`. It starts on column 1, aligned to the grid line with `margin-inline-start: -0.04em` to cancel the K sidebearing, and at 1440 it runs to about column 9. The hero canvas carrier line sits exactly on its baseline. The wordmark keeps the Latin face in zh too, because the name is Latin.
- **Real-name line** `p.home-hero__real-name`: `Kevin Yang` (en) is set in Archivo 400 at `font-stretch: 100%`, `--text-h2` size, `letter-spacing: 0.01em`, sentence case (a person's name is never uppercased). `楊子賢` (zh) is set in Noto Sans TC 500 at `--text-h2` zh size with `letter-spacing: 0.02em`. Color `--color-text-secondary`. It sits directly above the wordmark, left-aligned to the wordmark's stem, with a gap of `var(--space-3)`. It appears only here (IA §0).
- **Roles line**: Body · Lede in `--color-text-secondary`. Split the authored string on ` · ` and render a `<ul>` whose items are separated by a 1px × 0.8em vertical `--color-rule-strong` bar (a CSS pseudo-element), not by middle dots.
- **Statement**: Heading · 1 in `--color-text`, max `18ch` en / `14em` zh.

---

## 4. Layout and grid

### 4.1 Grid

| Token | Value | Notes |
| --- | --- | --- |
| `--content-max` | `93.75rem` (1500px) | Max content width; margins sit outside it. |
| `--page-margin` | `clamp(1rem, 0.25rem + 3.2vw, 3.5rem)` | 16px at 320–412 (IA and artifact floor), ≈50px at 1440, 56px max. |
| `--grid-cols` | `4` / `8` / `12` | Set per breakpoint on `:root`. |
| `--grid-gutter` | `clamp(1rem, 0.6rem + 1.1vw, 1.5rem)` | 16px on phones, 24px on desktop. |

```css
.grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), minmax(0, 1fr));
  column-gap: var(--grid-gutter);
  inline-size: min(100% - 2 * var(--page-margin), var(--content-max));
  margin-inline: auto;
}
```

### 4.2 Breakpoints

Custom properties cannot be used in `@media`, so these literals are canonical:

| Name | Min width | Columns | Notes |
| --- | --- | --- | --- |
| `xs` | 0 | 4 | Phones; designed at 360 and 412 (Pixel 7), floor 320. |
| `sm` | 480px | 4 | Large phones: two-column button rows allowed. |
| `md` | 768px | 8 | Tablet: label rail becomes an inline eyebrow. |
| `lg` | 1024px | 12 | Desktop grid, desktop header (IA §2.3). |
| `xl` | 1280px | 12 | Hover preview, sticky legal TOC. |
| `2xl` | 1500px | 12 | Content stops growing; margins grow. |

Use `min-width` queries (mobile-first). Hover-only behaviour is additionally gated by `(hover: hover) and (pointer: fine)`.

### 4.3 How asymmetry is built

The **label rail** is the recurring structural device. The section label (metadata eyebrow) sits in **cols 1–3**. Content starts at **col 4** (lists, tables) or **col 5** (text-led sections) and runs to 12 or stops early (to 10 or 11) to leave air on the right. On `lg+` the eyebrow sits on the rail, top-aligned with the heading's cap height (`margin-block-start: 0.35em`), **not** stacked above the heading. That makes the label information about where you are, not decoration.

Placement per home section at `lg+`:

| Section | Rail (1–3) | Content |
| --- | --- | --- |
| Hero | — (full composition) | Eyebrow + name + wordmark 1–10; roles/statement/CTAs 1–6; stage (showreel) 8–12, bottom-aligned |
| Selected Work | eyebrow | h2 4–9, "All work" link 10–12 end-aligned. Feature block: cover bleeds to the left viewport edge through col 8, text 9–12. List rows 1–12 (index in col 1, not the rail). |
| Capabilities | eyebrow | Rows: index 4, title 5–8, description + items 9–12 |
| Recognition | eyebrow | Rows 4–12 |
| Services | eyebrow | Three rows 4–12 (index 4, name 5–8, body 9–11, link 12) |
| Pricing preview (`bg-2` zone) | eyebrow | Rows 4–12; CTA under the rows at 4–7 |
| About teaser | eyebrow | Pull text 5–11 (Heading · 1, weight 400), link 5–8 |
| Writing | eyebrow | Rows 4–12 |
| Contact CTA band (`bg-2`) | eyebrow | Heading 1–10 (breaks the rail on purpose), actions 7–12 |

**Grid breaks:** at most one per section (principle 3). Sanctioned ones: the hero wordmark, the feature cover's left bleed, and the contact heading starting at col 1.

### 4.4 Full-bleed rules

- A full-bleed zone (background change or media) is a **section-level element outside `.grid`**, with an inner `.grid`. Never widen a child with `100vw`.
- One-side bleed (feature cover): `margin-inline-start: calc(-1 * max(var(--page-margin), (100vw - var(--content-max)) / 2));` Guard with `main { overflow-x: clip; }`.
- Full-bleed media: at most one per page. Allowed on project detail (hero media) and the home feature block.

### 4.5 Vertical rhythm

| Token | Value | Use |
| --- | --- | --- |
| `--section-s` | `clamp(3.5rem, 2.5rem + 4vw, 6rem)` | Dense follow-ups: Recognition, Pricing, Writing |
| `--section-m` | `clamp(5rem, 3rem + 7vw, 10rem)` | Default section spacing |
| `--section-l` | `clamp(6.5rem, 3.5rem + 10vw, 14rem)` | Before and after the Selected Work feature and the Contact band |

Spacing alternates (principle 4). Home order: hero → **L** → Selected Work → **M** → Capabilities → **S** → Recognition → **M** → Services → **S** → Pricing → **M** → About → **S** → Writing → **L** → Contact → footer. Apply spacing as `padding-block` on `section`, never with a top border.

### 4.6 Mobile (4 columns, < 768px)

The label rail becomes an inline eyebrow above the heading (`margin-block-end: var(--space-3)`). Everything spans cols 1–4 unless noted.

| Home section | Mobile composition |
| --- | --- |
| Hero | Eyebrow → real name → KAMEL (≈78px at 412) → roles as a vertical list → statement (Heading · 1) → CTAs in a row at `sm+`, stacked full-width below 480 → stage (showreel) full-width. The canvas is a band behind the wordmark and upper half only, at 18 lines. `min-block-size: auto`: no forced 100svh. |
| Selected Work | Feature: cover full-bleed 4:5, then metadata row, title, description. Rows: metadata line (index / categories / year) above the title, inline 4:3 thumbnail (5.5rem wide) at the row end, no hover preview. |
| Capabilities | Each group: index + title on one line, description, items as a plain list. Rules between groups. |
| Recognition | Year on its own metadata line, event below, result below in secondary. |
| Services | Stacked rows; the link becomes a full-row tap target (≥ 56px). |
| Pricing | Rows stack: category name, then label + figure on one line (figure right-aligned). CTA full-width. |
| About | Pull text at Heading · 2 size, link below. |
| Writing | Metadata line, title, action link. No thumbnails. |
| Contact | Heading at Display size (zh 2.5rem floor), body, primary CTA full-width, email as a text link below. |
| Footer | Lead, email, 5 `<details>` accordions, base row. |

Tablet (8 columns, 768–1023): rail eyebrows stay inline; content spans 1–8; two-column splits use 1–4 / 5–8 (capability rows, pricing rows, feature block text beside a 5-column cover).

---

## 5. Spacing, radius, borders, elevation

### 5.1 Spacing scale (4px base)

`--space-1` 0.25rem · `--space-2` 0.5rem · `--space-3` 0.75rem · `--space-4` 1rem · `--space-5` 1.5rem · `--space-6` 2rem · `--space-7` 3rem · `--space-8` 4rem · `--space-9` 6rem · `--space-10` 8rem.

Component internals use 1–7. Section-level spacing uses the rhythm tokens in 4.5.

### 5.2 Radius

| Token | Value | Where |
| --- | --- | --- |
| `--radius-0` | `0` | Default: sections, media, covers, rows, surfaces, menu panel, hover preview. |
| `--radius-xs` | `2px` | Buttons, chips, inputs, choice cards, PLACEHOLDER badge, focus-ring outline. |
| `--radius-round` | `50%` | **Only** the audio play button (a circle is the universal play affordance). |

Nothing else is rounded. The Turnstile iframe keeps its own vendor radius and is not styled.

### 5.3 Hairlines

- Always `1px solid`, and only **inside** lists and tables (between rows) or as the header's bottom edge after scroll. Never around a section, never as `border-inline` on the page.
- Between rows: `--color-rule`. Stronger dividers (chip idle border, stepper track, header edge): `--color-rule-strong`. Form and ghost-button boundaries: `--color-control-border` (3:1 compliant).
- Translucent variants use `color-mix(in srgb, var(--color-text) 8%, transparent)` for rules over the canvas or media, and stay ≤ 12%.

### 5.4 Elevation, without glow

Elevation comes from tone, a light edge and, for floating layers only, a dark shadow.

| Level | Fill | Edge | Shadow | Examples |
| --- | --- | --- | --- | --- |
| 0 page | `--color-bg` + field | — | — | Page |
| 1 zone | `--color-bg-2` | — | — | Contact band, pricing zone, footer base, form field fill |
| 2 surface | `--color-surface` | `box-shadow: inset 0 1px 0 rgb(232 237 242 / 0.06)` (top light edge) | — | Audio player, choice cards, sticky TOC |
| 3 floating | `--color-surface` | same light edge | `0 24px 48px -24px rgb(5 8 11 / 0.7)` | Hover preview, mobile menu panel |

Shadows are always near-black (`rgb(5 8 11)`). They are never colored or blurred into a glow, and never accent.

### 5.5 Focus ring

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
```

- It is ≥ 8.7:1 against every background. On accent-filled buttons the 2px offset puts the ring on the page background, so it stays visible.
- Rows that are whole links (list rows, writing rows) use `outline-offset: -2px` so the ring stays inside the row and is not clipped by `overflow: clip`.
- Inputs: ring plus the border switching to `--color-accent`.
- Never `outline: none` without a replacement. `:focus` without `-visible` shows no ring.

---

## 6. Component specs

States: **idle / hover / pressed / focus / disabled**. "Focus" is always the ring in 5.5 unless stated otherwise. Hover styles are gated by `@media (hover: hover)`. Transitions use `--duration-fast` / `--ease-standard` unless stated otherwise. All targets are ≥ 44 × 44px.

### 6.1 Header and mobile menu

**Anatomy:** `header.site-header` (sticky, `z-index: var(--z-header)`) → `.grid` → brand · nav list · CTA · language switcher. Mobile: brand · CTA (compact) · menu button → panel.

| Part | Spec |
| --- | --- |
| Bar | Height `--header-h` 72px (lg+), 60px (< lg). It compacts to 56px after 24px of scroll (height only, never hidden). Fill `color-mix(in srgb, var(--color-bg) 82%, transparent)` with `backdrop-filter: blur(12px)` (the one sanctioned blur). Bottom edge `1px --color-rule-strong` appears only once scrolled. `scroll-padding-top: calc(var(--header-h) + var(--space-4))` on `html`. |
| Brand | Text "Kamel", Archivo 700 at `font-stretch: 125%`, 1.125rem, uppercase, `letter-spacing: 0.02em`, `--color-text`. Hover: no color change; underline 1px offset 6px. Not a heading. |
| Nav link | Body · S 500, `--color-text-secondary`. Hover: `--color-text`. Pressed: `opacity: 0.8`. Active (`aria-current`): `--color-text` plus a 2px `--color-accent` bar 24px wide at the bar's bottom edge, aligned to the link's left. Gap between items `var(--space-6)`. |
| CTA (header) | Inverse neutral button, compact (§6.3). |
| Menu button | 44 × 44, two 1px `--color-text` lines 20px wide that turn into an × when open (rotate, `--duration-base`). The label swaps 開啟選單 ⇄ 關閉選單. |
| Mobile panel | Full width under the bar, `--color-bg-2`, level-3 shadow, `min-block-size: calc(100svh - var(--header-h))`. Links are Heading · 1 size in `--color-text`, 56px rows separated by `--color-rule`, and the active one is prefixed by a 2px accent bar. Below: accent primary CTA full width, then the language switcher. Open: opacity 0→1 plus `translateY(-8px → 0)` over `--duration-base`, and instant under reduced motion. Body scroll locked. Below 360px the bar CTA is hidden and only the panel CTA shows. |

### 6.2 Language switcher

Mono Metadata, `中文 / EN`. The current language is `--color-text` and the other is `--color-text-meta`. The slash is `--color-text-meta`. The whole control is one link (to the other locale), 44px tall, padding-inline `var(--space-2)`. Hover: the other-language label goes to `--color-text`. Pressed: `opacity: 0.8`. Focus: ring. `lang` attributes stay on each label. No disabled state.

### 6.3 Buttons

Shared: `display: inline-flex; align-items: center; gap: var(--space-3); min-block-size: 3rem (48px); padding-inline: var(--space-5); border-radius: var(--radius-xs);` label per 3.3 (display 600, 0.9375rem, en uppercase + `0.06em`, zh `0.02em`). Compact size: `min-block-size: 2.75rem; padding-inline: var(--space-4); font-size: 0.8125rem`. Large (contact band): `min-block-size: 3.5rem; padding-inline: var(--space-6)`.

| Variant | Idle | Hover | Pressed | Focus | Disabled |
| --- | --- | --- | --- | --- | --- |
| **Primary (accent)** `.button--primary` | bg `--color-accent`, text `--color-on-accent`, no border | bg `--color-accent-hover`; the arrow glyph (if any) moves `translateX(4px)` | bg `--color-accent-pressed`, `scale(0.98)` | ring (offset 2px) | bg `--color-rule-strong`, text `--color-text-meta`, `cursor: not-allowed` |
| **Inverse neutral** `.button--inverse` (header CTA) | bg `--color-text`, text `--color-bg` | bg `--color-text-bright` `#F5F7F9` (brighter neutral, never accent-tinted) | `scale(0.98)`, `opacity: 0.9` | ring | as primary |
| **Secondary / ghost** `.button--ghost` | transparent, 1px `--color-control-border`, text `--color-text` | border `--color-text`, bg `color-mix(in srgb, var(--color-text) 6%, transparent)` | bg 10% mix, `scale(0.98)` | ring | border `--color-rule-strong`, text `--color-text-meta` |

Magnetic pull (motion doc) applies only to primary and inverse buttons on fine pointers.

### 6.4 Text link with arrow

`a.text-link`: Body · S 500 (or Body in running text), `--color-text`, `text-decoration: underline 1px`, `text-underline-offset: 0.3em`, decoration color `--color-control-border`. The arrow is a separate `<span aria-hidden="true">` (→ internal, ↗ external, ← back), in `--font-mono`.

- Hover: decoration color `--color-text`, and the arrow moves `translateX(4px)` (↗: `translate(2px,-2px)`; ←: `-4px`).
- Pressed: `opacity: 0.8`.
- Focus: ring.
- Disabled: not applicable. Use plain text such as "Link pending" (`--color-text-meta`).

Running-text links in long-form (legal, writing detail) use the same underline without an arrow.

### 6.5 Section label (eyebrow) and heading pair

- **Eyebrow** `p.eyebrow`: Metadata, `--color-text-meta`. On `lg+` it goes in grid cols 1–3 of the section grid, `align-self: start`, `margin-block-start: 0.35em` (optically on the heading's cap line). Below `lg` it sits inline above the heading with `margin-block-end: var(--space-3)`.
- **Heading** `h2`: Heading · 1, `--color-text`, cols 4 (or 5) → ≤ 10.
- The eyebrow uses the IA's Latin codes (`SELECTED WORK / 2024—2026`). Slashes are `--color-text-meta` text, spaced ` / `. Only sections listed in IA §4 get an eyebrow. Do not invent more.

### 6.6 Project metadata row

`01 / ECHO CANVAS / AI / SOFTWARE / INTERACTION / 2026`. A `<p class="meta-row">` holding `<span>`s, Metadata style, `--color-text-meta`. The title segment, when present in the row, is `--color-text`. The separator is ` / ` in `--color-text-meta`. Numbers are zero-padded to 2 digits. Categories show only localized labels in zh (`[data-localized]` tracking rule). Recognition uses the same component: `2026 / EVENT / RESULT`. Writing uses it too: `ARTICLE / 2026.09.20`. Wrapping: `flex-wrap: wrap; column-gap: 0` so separators travel with the next segment. No interactive states (it is text inside interactive parents).

### 6.7 Feature project block

Anatomy: cover figure · metadata row · title (Heading · L, `h3`) · description (Body · Lede, secondary) · text link "View project →" · PLACEHOLDER badge (if placeholder).

- **lg+:** cover cols 1–8 with a left bleed (4.4), aspect **3:2**. Text column 9–12, bottom-aligned to the cover (`align-self: end`). A second feature on the same page mirrors it (cover 5–12, right bleed).
- **< md:** cover full-bleed at **4:5**, text below with `var(--space-5)` gap.
- **Idle:** cover desaturated (`filter: grayscale(0.35) brightness(0.92)`), title `--color-text`.
- **Hover** (on the whole link): cover `grayscale(0) brightness(1)` and `scale(1.02)` inside `overflow: clip` (`--duration-slow`, `--ease-out`); title shifts `translateX(0.25rem)`; link arrow moves 4px.
- **Pressed:** `opacity: 0.85` on the text column.
- **Focus:** ring inside the cover (`outline-offset: -2px` on the figure) plus the link's own ring.
- The whole block is one `<a>` wrapping cover and text, with the description referenced by `aria-describedby`.

### 6.8 Editorial project list row (with hover-preview slot)

Anatomy (`li > a.project-row`): index (Metadata) · title (Heading · L) · categories (Metadata, localized) · year (Metadata, tabular) · second line: role (Body · S, secondary) and, on `/works` only, the one-line description · PLACEHOLDER badge · `figure.project-row__preview` (hover slot).

- **lg+ grid:** index col 1, title 2–7, categories 8–10, year 12 (end-aligned). Second line 2–7. Row `padding-block: var(--space-5)`, `min-block-size: 6rem`, `border-block-end: 1px solid var(--color-rule)`, first row also `border-block-start`.
- **Idle:** title `--color-text`, metadata `--color-text-meta`.
- **Hover** (fine pointer): title `translateX(0.5rem)` (`--duration-base`, `--ease-out`); sibling rows' titles go to `--color-text-secondary` (`ul:has(a:hover) a:not(:hover) .title`); the preview appears (opacity 0→1, `scale(0.96→1)`) and follows the pointer with lag (motion doc). It never covers the row's own title: it is offset to the right of the pointer and clamped to cols 8–12.
- **Pressed:** title `opacity: 0.8`.
- **Focus-visible:** ring inset (`outline-offset: -2px`); the title shifts as on hover; the preview shows **statically** anchored at cols 9–11, vertically centered on the row (no pointer following).
- **Disabled:** not applicable.
- **Preview slot:** `position: absolute`, `inline-size: clamp(15rem, 22vw, 22.5rem)`, aspect **4:3**, level-3 elevation, radius 0, `pointer-events: none`, `aria-hidden="true"` (it duplicates the cover). Position comes from `--preview-x/--preview-y` set with `element.style.setProperty` (CSSOM is allowed under `style-src 'self'`; **no `style=""` attributes in SSR markup**).
- **Touch (`hover: none`) and < md:** no floating preview. A static 4:3 thumbnail 5.5rem wide sits at the row's inline-end, the metadata line moves above the title, and the categories and year join the metadata line.

### 6.9 Work filter chips

`nav[aria-label] > ul > li > a.chip` with label + count (`AI 02`).

- **Size:** `min-block-size: 2.75rem`, `padding-inline: var(--space-4)`, `gap: var(--space-2)`, radius `--radius-xs`. Label Metadata (`[data-localized]` for zh labels); count Metadata tabular.
- **Idle:** transparent, `1px --color-rule-strong`, label `--color-text-secondary`, count `--color-text-meta`.
- **Hover:** border `--color-control-border`, label `--color-text`.
- **Pressed:** `scale(0.98)`.
- **Active (`aria-current="page"`):** bg `--color-accent`, border `--color-accent`, label and count `--color-on-accent`. This is the one accent in the filter bar.
- **Focus:** ring.
- **Disabled:** none. A category with 0 items still links, shows `00` and leads to the empty state.
- **Layout:** lg+ a wrapping row at cols 4–12. < md a single-line horizontal scroll strip (`overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none`) that bleeds to the page margins, with an 8% `--color-bg` fade mask on the trailing edge.

### 6.10 PLACEHOLDER badge

`span.badge-placeholder`: text `PLACEHOLDER`, Metadata · XS, `--color-text-secondary` (7.79:1), transparent fill, **`1px dashed --color-control-border`** (dashed reads as provisional), radius `--radius-xs`, `block-size: 1.375rem`, `padding-inline: var(--space-2)`, `display: inline-flex; align-items: center`. Never accent, never warning-colored. Placement: after the title in rows, top-left over covers (`inset: var(--space-3)` with an `--color-bg` 80% backing), next to the `h1` on detail pages. The detail notice (此為示意內容…) is Body · S secondary with the same dashed rule on its inline-start (`border-inline-start: 1px dashed`, `padding-inline-start: var(--space-4)`).

### 6.11 Recognition row

`li.recognition-row` on the section grid: year (Metadata, tabular) col 4 · event (Body, 500, `--color-text`) cols 5–8 · result (Body, `--color-text-secondary`) cols 9–11 · badge col 12. Rows are separated by `--color-rule`, `padding-block: var(--space-4)`. If `url` exists, the event is a text link with ↗. No trophy icons. No interactive states on the row itself.

### 6.12 Capability block

Four rows (not cards). Each: index Metadata (`01`) col 4 · title Heading · 1 cols 5–8 · description Body · Lede secondary + items (Body · S, `--color-text`, one per line, `list-style: none`) cols 9–12. `padding-block: var(--space-6)`, `--color-rule` between rows. Static. On `/about` the title becomes a text link to `/works?category=…` with arrow states per 6.4.

### 6.13 Service group block (Mixing / Song Transition / Software)

Used on the home Services section and `/services`. It is an open row, not a card.

- Anatomy: index Metadata · name (Heading · 1 on `/services`, Heading · 2 on home) · one-line body (Body, secondary) · price display (6.14) on `/services` · text link.
- Grid lg+: index 4, name 5–8, body 9–11, link 12 (home). `/services`: name 4–8, body + price 9–12, link below the body.
- Row hover (`:has(a:hover)`): the row gets `--color-bg-2` across the full content width (`--duration-base`), and the link arrow moves. Pressed: link `opacity: 0.8`. Focus: the link's ring. The row itself has no role.
- The software row shows "Contact for quote" in the price slot.

**Service choice (selection pages `/mixing`, `/song-transition`, `/commission/:category`):** two side-by-side choice blocks at lg+ (cols 4–8, 9–12). Each is level-2 surface, radius 0, padding `var(--space-6)`: h2 service name, price display, schedule line (Metadata), action button (ghost). Hover: surface → `--color-surface-hover`. Keep all existing copy and `strict` price strings (IA §4.5).

### 6.14 Price display

- **Figure:** `--text-price`, Archivo 500 tabular, `--color-text`. The currency prefix `NT$` / `US$` stays inside the same element (tests match `NT$4,000` as one string). Wrap it in `<span class="price__currency">` **inside** the figure element, with no whitespace between the currency and the number, at `0.45em`, `--color-text-secondary`, `vertical-align: 0.9em` and `margin-inline-end: 0.08em`. `getByText` still matches because the text content is contiguous.
- **Label above:** Metadata `STARTING AT` / `起價`, or `BASE PRICE` / `基礎價格` (existing copy), `--color-text-meta`.
- **Note line** (e.g. the student-discount note, "Final price is confirmed after…"): Body · S, `--color-text-secondary`, max `40ch`, `margin-block-start: var(--space-3)`, preceded by a 16px × 1px `--color-rule-strong` rule (inline pseudo-element). Render a discount note only if the catalog/price repository actually provides one. Nothing is invented.
- **"Contact for quote":** replaces the figure in the same slot, Heading · 2 (display 500), `--color-text`, baseline-aligned with neighbouring figures. There is no currency.
- en pages never show `NT$` (existing FX snapshot logic).

### 6.15 Pricing preview strip (home)

A `bg-2` zone. The rail eyebrow `PRICING` is followed by `h2`. Three rows at cols 4–12, each: category name (Heading · 2) cols 4–7 · label (Metadata) cols 8–9 · figure (price display at `clamp(2rem, 1.4rem + 2vw, 3.25rem)`) cols 10–12, end-aligned · `--color-rule` between rows. Below: the note (6.14 note style) at 4–8 and the primary CTA at 4–7. Rows are not links: the service links live in the Services section, which keeps the pricing strip a reading surface.

### 6.16 Writing entry

Rows, not a card grid (principle 3): `li > article`. Metadata row `KIND / YYYY.MM.DD` cols 4–6 · `h2`/`h3` title (Heading · 2) cols 7–11 · source line (Body · S secondary) under the title · action link col 12 or under the source line (< lg). `--color-rule` between rows.

- The action is the only link, with its states per 6.4 (↗ for external, new tab).
- Row hover (`:has(a:hover)`): title `translateX(0.25rem)`.
- Placeholder: badge after the title; the action is replaced by the text "Link pending" / 連結待補 in `--color-text-meta`.
- Writing detail: header per 6.19 document layout, body at 65ch.

### 6.17 About section

- **Home teaser:** rail eyebrow `ABOUT`, `h2` visually small (Heading · 2, secondary). The body is the pull text at Heading · 1, **weight 400**, `--color-text`, cols 5–11, max 28ch en / 20em zh, then a text link. No portrait, no stats.
- **`/about`:** header `h1` Display + lede (Lede, secondary, cols 5–11). Each section: `h2` Heading · 1 at cols 1–4, `position: sticky; top: calc(var(--header-h) + var(--space-6))` on xl+; body at cols 6–11, 65ch. "How I work" is an `<ol>` with Metadata indexes `01–04` (a real sequence), items in Body · Lede.

### 6.18 Contact CTA band

- **Large (home, page ends):** `--color-bg-2` full-bleed zone with `padding-block: var(--section-m)`. A static, straight `--color-trace` line 1px, full bleed, at the band's top inner edge: the "measured line" at rest, the closing callback to the hero. Rail eyebrow `START A PROJECT`. Heading at Display, cols 1–10, `--color-text`. Body (Lede, secondary) cols 7–11. Actions cols 7–12: primary accent button (large) + email as a text link. Left-aligned. This is the page's quietest composition with the loudest type.
- **Small (writing, legal link variant):** no zone change. Heading · 1 cols 4–9 + primary button cols 10–12 on one line (lg+), stacked below.
- States follow the buttons and links.

### 6.19 Legal and document layout

Used by `/terms`, `/privacy` and writing detail.

- Header: eyebrow, `h1` Display, effective date Metadata (`EFFECTIVE 2026.09.01`), with a gap of `var(--space-7)` below.
- **xl+:** TOC `nav` at cols 1–3, `position: sticky; top: calc(var(--header-h) + var(--space-6))`, entries Body · S in `--color-text-secondary`, active entry `--color-text` with a 2px accent bar at inline-start (the active-state accent; one per view). Document at cols 4–10, `max-inline-size: 65ch`.
- **< xl:** TOC collapses into a `<details>` "Contents / 目錄" above the document.
- Clause `h2` is Heading · 2 with `scroll-margin-top` = header height + `var(--space-4)`. Paragraph spacing is `1em`. Lists get `padding-inline-start: 1.25em`. Nothing is boxed.
- Closing: a text link to Start a project (legal) or the small CTA band (writing).

### 6.20 Empty state

Rail eyebrow (if any) · a **flat line**: 120px × 1px `--color-trace`, the waveform with no signal, `margin-block-end: var(--space-5)` · `h2` Heading · 2 · Body secondary (max 48ch) · a text link. Left-aligned at cols 4–9. No illustration, no icon. Used for the works filter empty state, the writing empty state and the showreel empty state (there the flat line replaces the waveform in the player).

### 6.21 404 and error page

It is rendered outside the shell, so it includes a minimal brand link at top-left.

- The **numeral** `404` in Archivo 200, `font-stretch: 125%`, `clamp(8rem, 4rem + 20vw, 22rem)`, `--color-trace`, `aria-hidden="true"`. This is the page's single grid break. It sits cols 1–12 at the top and is cut by the flat line running through its vertical middle. It is decorative (the real status is in the eyebrow text).
- Eyebrow `404 / NOT FOUND` (Metadata), `h1` Heading · 1 (not Display, since the numeral already carries scale), body secondary, then the three recovery links as text links in a row (Back to home, View work) + a primary button (Start a project).
- Generic errors: the same layout with the numeral replaced by the status code and a single "Back to home" link.

### 6.22 Minimal audio player (showreel)

Current implementation: `.showreel` with a CSS span-bar waveform (`.showreel__waveform span.wave-height-*`) and `.direct-audio` in `media.css`. No `wavesurfer` dependency is present in `package.json`. The spec below is renderer-agnostic, and the motion doc covers amplitude hand-off to the hero canvas.

- **Container:** level-2 surface, radius 0, padding `var(--space-5)`, grid `3.5rem minmax(0,1fr)`, gap `var(--space-4)`. In the hero it is `.home-hero__stage` (≥ 340px wide at 1440, full-width stacked at 390).
- **Play button:** 56 × 56 (44 × 44 < md), `--radius-round`.

  | State | Spec |
  | --- | --- |
  | Idle | Transparent, 1px `--color-control-border`, triangle icon `--color-text`. |
  | Hover | Border `--color-text`, fill `color-mix(in srgb, var(--color-text) 8%, transparent)`. |
  | Pressed | `scale(0.96)`. |
  | Playing | Fill `--color-accent-2`, pause icon `--color-bg` (6.43:1). This is the live-audio state. |
  | Focus | Ring (offset 2px; it follows `border-radius: 50%`). |
  | Disabled (no source) | Border `--color-rule-strong`, icon `--color-text-meta`, `cursor: not-allowed`. |

- **Waveform:** height 4.5rem (3.5rem < md), bars 2px wide with a 2px gap, radius 0, flat baseline at the vertical center drawn as 1px `--color-rule-strong`. Unplayed bars are `--color-trace`. Played bars are `--color-accent-2`. When idle and not started, all bars are `--color-trace` at `opacity: 0.8`. No looping pulse animation: the bars show real progress, not a fake bounce (this removes the existing `waveform-pulse`).
- **Metadata:** track title Heading · 3 `--color-text`, then a meta row `ROLE / YEAR` (plus `MIXING / PRODUCTION / MASTERING` where known), then time `00:42 / 03:15` Metadata tabular on the inline-end. The time is the non-color indicator of progress.
- **Empty:** the flat line (6.20) plus the existing strings (尚無可播放的 Showreel / No showreel is available yet).
- The `.direct-audio > button` icon color must change to `--color-on-accent`/`--color-bg` during migration. With the alias `--color-coral → --color-accent`, today's `--color-chalk` icon on that fill would be about 1.5:1.

### 6.23 Commission wizard surfaces

The layout is a single document column: cols 4–10 (lg+), full width < md. Existing class names and all copy are kept.

- **Stepper** (`ol`, label 委託步驟 / Commission steps): 4 items in a row, each `01 DETAILS`-style: index Metadata + label Body · S 500. The track is 1px `--color-rule-strong` under the row. Current step (`aria-current="step"`): label `--color-text` + a 2px `--color-accent` bar over the track segment. Completed: label `--color-text-secondary`, index `--color-text` with a ✓ suffix in Metadata. Upcoming: `--color-text-meta`. < md: show "02 / 04" + the current label only, with the full list visually hidden but kept for screen readers.
- **Fields:** label Body · S 500 `--color-text` with `margin-block-end: var(--space-2)`; help text Body · S `--color-text-secondary`. Control: `min-block-size: 3rem`, padding `var(--space-3) var(--space-4)`, bg `--color-bg-2`, 1px `--color-control-border`, radius `--radius-xs`, text `--color-text`, placeholder `--color-text-meta`.

  | State | Spec |
  | --- | --- |
  | Idle | As above. |
  | Hover | Border `--color-text-secondary`. |
  | Focus | Border `--color-accent` + ring. |
  | Invalid (`aria-invalid`) | Border `--color-danger`; message Body · S `--color-danger` prefixed by "!" in Metadata; the error summary at the top is a level-2 surface with a 2px `--color-danger` inline-start rule, and its links jump to fields. |
  | Disabled / read-only | bg `--color-bg`, border `--color-rule-strong`, text `--color-text-secondary`. |

  Textarea `min-block-size: 8rem`. Select uses a custom chevron (two 1px lines, `--color-text-secondary`) with native semantics.
- **Radio / choice cards** (`label` wrapping `input`): level-2 surface, 1px `--color-rule-strong`, radius `--radius-xs`, padding `var(--space-4)`, a 20px circle indicator (1px `--color-control-border`). Hover: `--color-surface-hover`. Checked: border `--color-text`, indicator filled with an 8px `--color-accent` dot. Focus: ring on the card (`:has(input:focus-visible)`). Disabled: text `--color-text-meta`, border `--color-rule`. Checkbox: 20px square, radius 2px, checked fill `--color-text` with a `--color-bg` check.
- **Review summary** (`.review-card`): `<dl>` with dt Metadata `--color-text-meta` (cols 1–2 of the column), dd Body `--color-text`, rows separated by `--color-rule`. Each group heading is Heading · 3 with an "Edit" text link at the inline-end. Total (`.quote-summary__total`): label Metadata + figure in price display at `clamp(2rem, 1.4rem + 2vw, 3rem)`.
- **Turnstile slot** (`.turnstile-widget`): reserve `min-block-size: 65px; min-inline-size: 300px` (the widget's size) so the layout does not shift. While loading it shows a level-1 box with Metadata `VERIFICATION` in `--color-text-meta`. Render the widget with `theme: "dark"`. Failure uses the warning style: Body · S `--color-warning` + the retry button (ghost).
- **Actions:** Back is ghost. Intermediate steps (Next, Review) use the inverse neutral button. Only the final "Submit commission" (and "Retry notification") uses the accent primary, so the accent marks the one irreversible action. Buttons are end-aligned, and on mobile they stack with the forward action on top.
- **Success page:** eyebrow, `h1` Display, case ID in Metadata tabular inside a `<dl>` (6.23 review styling), text link back home.

### 6.24 Footer

- **Zone:** `--color-bg`, `padding-block: var(--section-m) var(--space-6)`. The top edge is space, not a rule.
- **Desktop (lg+):** eyebrow `KAMEL / CONTACT` (rail) · lead Heading · 1 weight 400 cols 4–10 · email as a text link (Heading · 2, underline) cols 4–10 · `var(--space-8)` gap · 5 groups (`<section>`) in a 5-track subgrid across cols 1–12 (the first starts at col 1, which is a deliberate rail break). Group heading Metadata `--color-text-meta` (`[data-localized]`), links Body · S `--color-text-secondary` with 36px line boxes (44px targets via `padding-block`); hover `--color-text`; external ↗.
- **Base row:** 1px `--color-rule` above it, Metadata `--color-text-meta`: `© 2026 Kamel` at inline-start and `TAIWAN / REMOTE` (localized) at inline-end.
- **Mobile (< lg):** 5 `<details>` accordions. `summary` has `min-block-size: 3.5rem`, Body 500 `--color-text`, a `+` built from two 1px lines that rotates to `−` when open (`--duration-base`), and `--color-rule` between groups. The open panel lists links at 48px rows. The native disclosure triangle is hidden (`list-style: none; ::-webkit-details-marker { display: none }`). Focus: ring on summary. No prices ever.

### 6.25 Admin, token-only pass

The layout does not change. `admin.css` keeps its selectors and gets the new values through the aliases:

| Admin usage | Variable | Resolves to |
| --- | --- | --- |
| Shell background | `--color-mineral` | `--color-bg` `#090D12` |
| Sidebar / field fills | `--color-console` | `--color-bg-2` `#0F151D` |
| Borders | `--color-line` | `--color-rule-strong` `#2A3643` |
| Active nav border/text | `--color-accent` (previously **undefined**, so it fell back to `currentColor`) | `#A7C7E7` (now defined) |
| Text | `--color-chalk` / `--color-cool-gray` | `--color-text` / `--color-text-secondary` |

One recommended one-line follow-up (not required): switch admin form input borders from `--color-line` to `--color-control-border` for 3:1. Today they are about 1.6:1, as they were before.

---

## 7. Imagery and the hero visual

### 7.1 Project covers

| Presentation | Aspect | Treatment |
| --- | --- | --- |
| Feature block (lg+) | 3:2 | Rest `grayscale(0.35) brightness(0.92)`, full color on hover/focus |
| Feature block (< md) | 4:5 | Same |
| List hover preview / touch thumbnail | 4:3 | Always full color |
| Project detail hero (full bleed) | 21:9 lg+, 16:9 < lg | Full color, subtle parallax per the motion doc |
| Case-study inline media | Intrinsic, max 16:9 crop for screenshots | Full color; captions Metadata below |
| Horizontal media strip (detail pages with ≥ 3 images) | 4:5 tiles, 3.5 visible | Scroll-snap; no autoplay |

Real images are `object-fit: cover` with radius 0 and no borders. Monochrome-leaning photography and screen captures are preferred. Never stock photos.

**Procedural placeholder covers** (`cover: null`): a server-rendered inline `<svg>` (no canvas, no JS; it works under CSP and reduced motion), seeded deterministically from the slug. The fill is `--color-bg-2`, and strokes are `--color-text` at 10–22% opacity, 1px (`vector-effect: non-scaling-stroke`). **Pattern is keyed to the primary category** so covers differ by structure, never by color (principle 10):

| Category | Pattern |
| --- | --- |
| `software` | Orthogonal step lines on the 12-column rhythm, like a schematic trace |
| `ai` | Point lattice (1.5px dots) with density rising along a diagonal gradient |
| `interactive` | Concentric contour lines around 1–2 off-center foci |
| `music` / `mixing` | 24–40 horizontal waveform traces (the hero language) |
| `research` | Vertical spectrogram bars of varying height at 2px pitch |

Each cover also carries the project index (`01`) as an Archivo 200 `font-stretch: 125%` numeral at 28% of cover height, bottom-left, in `--color-trace`, plus the PLACEHOLDER badge top-left. No accent in covers.

### 7.2 Hero canvas: the measured line

**Concept:** a field of horizontal lines spanning the full bleed of the hero. On the left, behind the wordmark and copy, each line is **perfectly straight**: a ruled, systematic grid of software. Moving right, an amplitude envelope grows and the same lines become **waveforms**: sums of 2–3 slow sines plus low-frequency noise, each line phase-shifted from its neighbor so the field reads as a spectral surface. The transition zone runs from col 5 to col 7. It is one continuous stroke per line, so software and sound are literally the same line.

| Parameter | Value |
| --- | --- |
| Line count | 36 at lg+ (spacing ≈ `100svh / 40`), 24 at md, 18 < md |
| Line weight | 1 CSS px (`lineWidth = 1 * dpr`), round caps off, `lineJoin: round` |
| Color | `--color-text` at **12%** opacity for field lines (keep it ≤ 25%; it must never lower text contrast below AA) |
| Carrier line | The line at the wordmark baseline: `--color-accent` at **60%**, 1px. It is the hero's one accent element. While audio plays it becomes `--color-accent-2` at 70%. |
| Column ticks | On the bottom line only: 12 ticks 4px tall at the grid column boundaries, `--color-trace` at 60%. The grid made visible. |
| Envelope | 0 on cols 1–5, smoothstep to max across cols 5–7, max amplitude ≈ 0.6 × line spacing (lines never cross) |
| Density falloff | Lines fade to 0% opacity over the last 15% of the hero height (the bottom edge dissolves into the page) |
| Inputs | Time (a period of 8–14s per sine), pointer x/y (a local bump up to +0.4 × spacing near the pointer, which eases back in ~600ms), scroll (the envelope flattens as the hero scrolls out), audio RMS (scales the envelope ×1–1.8 when playing) |
| DPR | `min(devicePixelRatio, 2)`; `min(dpr, 1.5)` < md |

**Static (reduced motion, JS off, before hydration):** the hero must look complete with nothing moving (principle 1). Ship a server-rendered inline `<svg>` of the same field (36 paths, fixed seed, `t = 0`, pointer bump 0, envelope at rest) inside `.home-hero__stage`'s backdrop layer. The canvas mounts over it and fades in (opacity only) once its first frame is drawn. Under `prefers-reduced-motion: reduce` the canvas never animates: it draws that same static frame once (or the SVG simply remains), there is no pointer bump and no audio reactivity, and the carrier line shows the accent. The canvas pauses when off screen or when the tab is hidden (motion doc).

---

## 8. Token file (`app/styles/tokens.css`, ready to paste)

```css
/* ==========================================================================
   Kamel design tokens — Cold Industrial Editorial
   Source of truth: docs/design-system.md. Motion values: docs/motion-system.md
   ========================================================================== */

:root {
  color-scheme: dark;

  /* ---- Color: surfaces ---- */
  --color-bg: #090d12;
  --color-bg-2: #0f151d;
  --color-surface: #161e28;
  --color-surface-hover: #1c2632;
  --color-shadow: rgb(5 8 11 / 0.7);

  /* ---- Color: text ---- */
  --color-text: #e8edf2; /* 16.54:1 on bg */
  --color-text-bright: #f5f7f9; /* inverse-button hover fill only */
  --color-text-secondary: #9aa5b2; /* 7.79:1 on bg, 6.12:1 on surface-hover */
  --color-text-meta: #808d9b; /* 5.75:1 on bg, 4.52:1 on surface-hover */

  /* ---- Color: lines (decorative unless noted) ---- */
  --color-trace: #596674; /* decorative only; never text */
  --color-rule: #1f2934;
  --color-rule-strong: #2a3643;
  --color-control-border: #6a7684; /* non-text 3:1 on every surface */

  /* ---- Color: accent (≤ 5% of a view) ---- */
  --color-accent: #a7c7e7;
  --color-accent-hover: #c4daf0;
  --color-accent-pressed: #8fb3d9;
  --color-on-accent: #090d12; /* 11.10:1 on accent */
  --color-accent-2: #788bff; /* live audio state only */

  /* ---- Color: status ---- */
  --color-danger: #eba3a3;
  --color-success: #9ccdb3;
  --color-warning: #d8c28e;

  /* ---- Elevation ---- */
  --edge-light: inset 0 1px 0 rgb(232 237 242 / 0.06);
  --shadow-float: 0 24px 48px -24px var(--color-shadow);

  /* ---- Typography: families ---- */
  --font-display: "Archivo Variable", "Noto Sans TC Variable", "PingFang TC",
    "Microsoft JhengHei", system-ui, sans-serif;
  --font-body: "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei",
    system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "Noto Sans TC Variable", ui-monospace,
    "SFMono-Regular", Menlo, Consolas, monospace;

  /* ---- Typography: sizes ---- */
  --text-wordmark: clamp(4rem, 0.5rem + 17vw, 15rem);
  --text-display: clamp(2.75rem, 1.5rem + 5vw, 6.5rem);
  --text-title-list: clamp(1.625rem, 0.9rem + 2.8vw, 3.5rem);
  --text-h1: clamp(1.75rem, 1.2rem + 2.2vw, 3.25rem);
  --text-h2: clamp(1.375rem, 1.1rem + 1vw, 2rem);
  --text-h3: clamp(1.125rem, 1.05rem + 0.3vw, 1.25rem);
  --text-price: clamp(2.5rem, 1.6rem + 3vw, 4.5rem);
  --text-price-s: clamp(2rem, 1.4rem + 2vw, 3.25rem);
  --text-lede: clamp(1.125rem, 1rem + 0.45vw, 1.375rem);
  --text-body: clamp(1rem, 0.96rem + 0.18vw, 1.0625rem);
  --text-body-s: 0.875rem;
  --text-meta: clamp(0.75rem, 0.72rem + 0.12vw, 0.8125rem);
  --text-meta-xs: 0.6875rem;
  --text-button: 0.9375rem;
  --text-button-s: 0.8125rem;
  --text-numeral-404: clamp(8rem, 4rem + 20vw, 22rem);

  /* zh overrides (applied under :lang(zh)) */
  --text-display-zh: clamp(2.5rem, 1.5rem + 3.6vw, 4.75rem);
  --text-title-list-zh: clamp(1.5rem, 0.95rem + 2.1vw, 2.75rem);
  --text-h1-zh: clamp(1.625rem, 1.2rem + 1.6vw, 2.625rem);
  --text-h2-zh: clamp(1.25rem, 1.05rem + 0.8vw, 1.75rem);

  /* ---- Typography: line-height ---- */
  --leading-wordmark: 0.86;
  --leading-display: 0.95;
  --leading-title: 1;
  --leading-heading: 1.06;
  --leading-heading-s: 1.12;
  --leading-lede: 1.55;
  --leading-body: 1.65;
  --leading-body-s: 1.6;
  --leading-meta: 1.4;
  --leading-display-zh: 1.12;
  --leading-heading-zh: 1.22;
  --leading-lede-zh: 1.75;
  --leading-body-zh: 1.85;

  /* ---- Typography: tracking ---- */
  --tracking-wordmark: -0.035em;
  --tracking-display: -0.025em;
  --tracking-title: -0.018em;
  --tracking-heading: -0.015em;
  --tracking-heading-s: -0.01em;
  --tracking-meta: 0.08em;
  --tracking-meta-xs: 0.1em;
  --tracking-button: 0.06em;
  --tracking-cjk-max: 0.02em;

  /* ---- Typography: weight / width ---- */
  --weight-wordmark: 780;
  --weight-display: 650;
  --weight-title: 500;
  --weight-heading: 600;
  --weight-body: 400;
  --weight-label: 500;
  --weight-display-zh: 800;
  --weight-heading-zh: 700;
  --stretch-wordmark: 125%;
  --stretch-display: 112%;
  --stretch-title: 106%;
  --stretch-heading: 100%;

  /* ---- Layout ---- */
  --content-max: 93.75rem; /* 1500px */
  --measure: 65ch;
  --page-margin: clamp(1rem, 0.25rem + 3.2vw, 3.5rem);
  --grid-cols: 4;
  --grid-gutter: clamp(1rem, 0.6rem + 1.1vw, 1.5rem);
  --header-h: 60px;
  --header-h-compact: 56px;

  /* ---- Vertical rhythm ---- */
  --section-s: clamp(3.5rem, 2.5rem + 4vw, 6rem);
  --section-m: clamp(5rem, 3rem + 7vw, 10rem);
  --section-l: clamp(6.5rem, 3.5rem + 10vw, 14rem);

  /* ---- Spacing (4px base) ---- */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4rem;
  --space-9: 6rem;
  --space-10: 8rem;

  /* ---- Radius ---- */
  --radius-0: 0;
  --radius-xs: 2px;
  --radius-round: 50%;

  /* ---- Targets ---- */
  --target-min: 44px;
  --control-h: 3rem;
  --control-h-s: 2.75rem;
  --control-h-l: 3.5rem;

  /* ---- Focus ---- */
  --focus-width: 2px;
  --focus-offset: 2px;
  --focus-color: var(--color-accent);

  /* ---- Motion (values owned by docs/motion-system.md) ---- */
  --duration-instant: 90ms;
  --duration-fast: 160ms;
  --duration-base: 240ms;
  --duration-slow: 420ms;
  --duration-reveal: 720ms;
  --duration-page: 560ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-soft: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --reveal-distance: 16px;

  /* ---- Z-index ---- */
  --z-base: 0;
  --z-preview: 20;
  --z-header: 50;
  --z-menu: 60;
  --z-skip: 100;

  /* ---- Legacy aliases (remove after every page is migrated) ---- */
  --color-mineral: var(--color-bg);
  --color-console: var(--color-bg-2);
  --color-chalk: var(--color-text);
  --color-cool-gray: var(--color-text-secondary);
  --color-coral: var(--color-accent); /* icons on a coral fill must switch to --color-on-accent */
  --color-line: var(--color-rule-strong);
  --color-line-soft: var(--color-rule);
  --color-surface-raised: var(--color-surface);
  --motion-fast: var(--duration-fast);
  --motion-normal: var(--duration-base);
  --motion-panel: var(--duration-slow);
}

@media (min-width: 768px) {
  :root {
    --grid-cols: 8;
  }
}

@media (min-width: 1024px) {
  :root {
    --grid-cols: 12;
    --header-h: 72px;
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-slow: var(--duration-fast);
    --duration-reveal: var(--duration-fast);
    --duration-page: 0ms;
    --reveal-distance: 0px;
  }
}
```

Companion changes for the Foundation agent (listed here, not made here):

- `app/root.tsx`: replace `import "@fontsource/barlow-condensed/600.css"` with `import "@fontsource-variable/archivo/wdth.css"`, and set `theme-color` to `#090D12`. `package.json`: add `"@fontsource-variable/archivo": "5.3.0"`, remove `@fontsource/barlow-condensed`.
- `global.css`: `::selection { color: var(--color-on-accent); background: var(--color-accent); }`; focus ring per 5.5; `h1, h2, h3` get `font-stretch`/`font-weight` from the tokens, with the `:lang(zh)` overrides from 3.4; the body field and grain from 2.3; `main { overflow-x: clip; }`; `html { scroll-padding-top: calc(var(--header-h) + var(--space-4)); }`.
- Remove the `layout.css` `border-inline` page frame and the `.landing-console*` panel rules as pages migrate.
- `media.css`: remove `waveform-pulse`, and switch the `.direct-audio > button` icon color to `--color-on-accent` (see 6.22).

---

## 9. Pre-merge visual checklist

1. A screenshot of `/en` and `/zh` at 1440 and 412 with reduced motion looks finished (hero SVG field present, all text visible).
2. Accent pixels ≤ 5% per viewport. At most one accent-filled button per viewport, and the header CTA is inverse neutral.
3. No readable text uses `--color-trace`, `--color-rule*` or any color below 4.5:1. Axe is clean.
4. No `border` around a section. No radius above 2px except the play button.
5. KAMEL renders from the DOM text "Kamel". The real name appears once and only on the landing page.
6. zh headings use Noto weight 700/800 at the zh sizes, and no Chinese is tracked beyond 0.02em.
7. Every interactive element has the idle/hover/pressed/focus(/disabled) states in §6 and a ≥ 44px target.
