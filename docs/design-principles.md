# Design Principles

Date: 2026-09-23 · Derived from `docs/design-reference.md`, the master brief and the repo adaptation spec (the spec wins on conflicts).

These 12 rules are the test that every page and component is checked against. Downstream docs (`design-system.md`, `motion-system.md`) set the exact values. These rules set what counts as right. Rule 1 overrides the others.

---

### 1. Quiet by default. Expressive on interaction.

**The page must look finished and strong as a still image. Motion only answers what the visitor does.**

In practice:
- Take a screenshot with `prefers-reduced-motion: reduce` and JS animations off. The composition, hierarchy and CTAs must hold up with nothing moving.
- At rest, the only continuous motion allowed is the hero ambient canvas. Everything else animates in response to scroll entry, hover, focus or press.
- An element animates when it enters the viewport, then stays still. Nothing loops except the ambient field and an audio visualisation while audio is playing.

Violation looks like: a section that looks empty until its reveal runs, or pulsing, marquee or looping elements beside body text.

### 2. Typography carries the hierarchy.

**Size and weight say what matters. Boxes, colour and icons do not.**

In practice:
- Four levels only: Display (grotesk, oversized, `clamp()`-fluid), Heading, Body (Noto Sans TC Variable), Metadata (IBM Plex Mono, uppercase, tracked). No fifth style made up inside a component.
- Display goes on at most one element per viewport (hero lines such as `BUILDING / SYSTEMS, / SOUND & / INTERACTIONS.`, section openers, project titles in the list). Display is at least about 3× the body size.
- Section titles are set text, not text on a filled badge or inside a card header.

Violation looks like: a heading given importance by a coloured pill, icon or bordered box, or three different heading sizes in one section.

### 3. An editorial grid, composed asymmetrically.

**Each section is placed on a 12-column grid (max 1500px) and deliberately off-centre.**

In practice:
- Text blocks sit on column spans such as 1–5, 2–7 or 7–12. Centred text is kept for one or two moments at most (for example the final contact statement).
- No block of three identical cards. Repeated items use an editorial list, a metadata table or a varied media layout (feature + list, full-bleed + strip).
- Breaking the grid on purpose (full-bleed media, a display word crossing the gutter) happens at most once per page section and has to look intended.

Violation looks like: `grid-template-columns: repeat(3, 1fr)` holding look-alike cards, or every section centred in a narrow column (the current console layout).

### 4. Whitespace is structure. Sections have rhythm.

**Space separates ideas. Borders and panels do not. Important work gets more space than descriptive copy.**

In practice:
- Section spacing comes from a small set of spacing tokens (for example S / M / XL) and alternates. Dense sections, such as metadata lists, are followed by open ones, such as a feature project.
- Hairline rules (1px, low contrast) are allowed as structure inside lists and metadata tables. They are never a frame around a whole section or page (remove the current `border-inline` column frame).
- A featured project is always given more area than the paragraph that describes it.

Violation looks like: every section with the same padding and a top border, or a feature project image smaller than its description block.

### 5. The accent is rare and earns its place.

**About 85% neutral dark, 10% light type, at most 5% accent in any viewport.**

In practice:
- The primary accent (`#A7C7E7` or its adjusted value) is used for: the primary CTA, the focus ring, the active filter or nav state, and at most one highlight per section. The secondary accent (`#788BFF`) is kept for rare states such as audio-active.
- No accent borders on cards, no glows, no gradient text, no neon. Coral is removed entirely.
- Hover states lead with a change in contrast or position (text goes from secondary to primary), not with accent colour.

Violation looks like: accent-coloured headings, borders or icons repeated across a section, or a `box-shadow` glow in accent colour.

### 6. Dark with tonal variation, never flat black.

**Depth comes from close neutral values and soft light, not from blur or glass.**

In practice:
- Use the three background tones (`#090D12`, `#0F151D`, `#161E28`) to separate zones: page, alternate section, elevated element such as a menu overlay or audio player. No `#000`.
- Low-contrast ambient graphics (lines, waveform, grain, vignette) are allowed behind content, at 25% opacity or less, and must never reduce text contrast below AA.
- `backdrop-filter` blur is limited to the sticky header, if it is used at all. No glass cards.

Violation looks like: pure black sections, frosted glass panels, or a single flat colour across every section.

### 7. Motion has mass and a job.

**Every animation shows a spatial relationship, a state change or continuity, and it moves like something with weight.**

In practice:
- Animate only `transform` and `opacity` (plus `clip-path` for mask reveals). Use ease-out curves with a slow tail, no bouncy or overshooting springs. Durations are short for UI (about 150–250ms) and longer only for reveals and page continuity (about 600–900ms, capped).
- Reveals use small translation (12–24px) with a controlled stagger. No letter-by-letter scrambles.
- The tools follow the repo order: CSS, then WAAPI + IntersectionObserver, then GSAP only where `motion-system.md` justifies it. No smooth-scroll library, no scroll hijacking, no parallax on every section (parallax only on project media, and subtle).

Violation looks like: an animation you cannot name the purpose of, bounce easing, scroll-jacked sections, or a page transition that holds the visitor for more than about 600ms.

### 8. Hover reveals. It never hides what matters.

**Hover and focus add a layer (media preview, a shift in the type, a background change). Essential information is visible without it.**

In practice:
- In the project list, title, metadata and link are visible at rest. The media preview appears on `:hover` **and** `:focus-visible`, and the system cursor is never hidden or replaced.
- On touch devices (`@media (hover: none)`) the preview is shown inline as a static thumbnail. Hover-only content has a tap or focus equivalent.
- Magnetic pull is only on the primary CTA and the primary nav items, and is off under reduced motion and on coarse pointers.

Violation looks like: a project title that only appears on hover, `cursor: none`, or a magnetic effect on body links.

### 9. Credibility is written as metadata.

**Year, category, role and tools are shown in a consistent mono metadata system, never as trophies, badges or percentages.**

In practice:
- One format everywhere, for example `01 / ECHO CANVAS / AI / SOFTWARE / INTERACTION / 2026`, or for awards `2026 / OpenAI Build Week / 1st Place — Developer Tools`. The same component renders projects, recognition and writing (`ARTICLE / 2026.09.20 / …`).
- Metadata labels that carry meaning must meet 4.5:1 contrast. The brief's `#596674` is decorative-only unless the design system lightens it.
- Placeholder entries show a visible `PLACEHOLDER` badge. No invented metrics, prices, clients or testimonials.

Violation looks like: skill-percentage bars, trophy icons, logo walls of clients that are not real, or metadata formatted differently on each page.

### 10. One creator, many disciplines.

**Software, AI, interaction, music and mixing share one visual language and are shown side by side.**

In practice:
- Selected Work on the home page mixes categories in its order (for example AI, then mixing, then interactive, then software, then research). Category is a metadata value, not a colour theme or a separate page style.
- Music projects use the same list, layout and metadata as software projects, and add an audio player (Track / Artist / Role / Year / Credits, no autoplay). Lab or research items may use a lighter layout but the same system.
- The hero states three roles and one positioning line within the first viewport.

Violation looks like: a separate colour scheme or layout for music, or a home page split into a "developer" half and a "producer" half.

### 11. Mobile is its own composition.

**Phones get a deliberately designed layout, not the desktop layout squeezed down.**

In practice:
- Display type stays large (fluid `clamp()`, for example still at least about 2.5× body on a 412px Pixel 7) and wraps sensibly in both zh and en. No layout that depends on English words breaking at fixed places.
- Asymmetry becomes a vertical rhythm: metadata above the title, media full-width, CTAs at least 44 × 44px in thumb reach.
- Expensive effects simplify: the hero canvas runs at lower density or DPR and there are no parallax or cursor effects. The menu is fast and needs no animation to be usable.

Violation looks like: a 12-column desktop grid just stacked with its desktop spacing, horizontal scroll, or hover-only affordances on touch.

### 12. Accessible and honest, with none of the brief's anti-patterns.

**The site is WCAG 2.2 AA, fully usable without motion, and avoids every pattern in brief §25.**

In practice:
- Semantic landmarks and headings, full keyboard reach in a logical order, visible `:focus-visible` rings (at least 3:1), 44 × 44px targets, and labelled controls (audio, filters, language switch). Under `prefers-reduced-motion` there is no parallax, no ambient animation (the canvas shows a static frame), no magnetic effects and only opacity transitions.
- No gradient blobs, glass cards, neon borders, stacks of rounded rectangles (radius stays at 0–4px), fake terminal or decorative code, preloaders, meaningless 3D, "Hello, I'm Kevin" hero or skill bars.
- Every page works with SSR HTML alone. JS enhances it and never gates content.

Violation looks like: an axe violation, a focus ring you cannot see on the dark background, a `<div>` with an onClick, or any §25 item on screen.

---

**Quick component checklist**

Does it look right when still (1)? Is type doing the hierarchy (2)? Is it on the grid and off-centre (3)? Does space, not a border, separate it (4)? Is the accent under 5% (5)? Does it use tonal darks, not black or glass (6)? Does each motion have a purpose (7)? Is it usable without hover (8)? Is metadata in the shared format (9)? Is it discipline-neutral (10)? Has the mobile version been designed (11)? Does it pass AA and avoid every §25 item (12)?
