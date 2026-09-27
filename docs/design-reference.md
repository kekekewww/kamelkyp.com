# Design Reference Analysis

Date: 2026-09-23 · Author: Research Agent · Inputs: master brief §3–4, §25–26; repo adaptation spec (wins on conflict).

Purpose: turn the reference sites into principles for the kamelkyp.com editorial redesign. Nothing here is a layout to copy. `docs/design-principles.md` holds the rules that come out of this analysis.

## 0. Where we are starting from

The current site (`app/styles/tokens.css`, `layout.css`, `routes/public/home.tsx`) is a **narrow console**:

- Saturated navy mineral background (`#071724` / `#0b2030`) with a warm chalk text colour and a **coral** accent (`#ff5c4d`) that shows up in focus rings, selection and CTAs.
- **Barlow Condensed** display type. It is tall and compressed and reads as sporty or signage, not editorial.
- A bordered content column (`border-inline` on the main wrapper) with a sidebar identity panel (`landing-console__identity`), plus a right-hand content stack with a showreel, a two-item service list and "current work".
- 1px rules on almost every block (`border-block`, `border-top`, `border-left`). The page reads as a set of framed panels, a dashboard more than a composition.
- Eyebrows such as `SHOWREEL / 001` and `SELECTED / CURRENT` are the only metadata voice.

**What the redesign moves away from:** warm-on-navy with coral becomes cold neutral near-black with a pale steel-blue accent. Condensed signage type becomes a geometric grotesk at editorial scale. Boxed panels with rules everywhere become open composition on a 12-column grid, with rules used sparingly as structure. A single narrow column becomes asymmetric full-width sections. Two services and a showreel become one creator across four disciplines, with work shown first.

---

## 1. Dennis Snellenberg: site structure and portfolio UX

**Sources:** homepage HTML fetched on 2026-09-23. It showed a multilingual greeting preloader ("Hello / Bonjour / Ciao…"), the nav (Home, Work, About, Contact), a positioning line ("Helping brands to stand out in the digital era…"), a "Recent work" list with title, discipline ("Interaction & Development", "Design & Development") and year, and a "More work" link with a count (11). Motion and visual details come from memory of the site and are marked "typically".

**What works**
- The structure is short and obvious: intro, positioning, recent work, about, contact. A client can find work and contact within seconds.
- The work list is an **editorial list**, not a card grid. Each row is a large title, a discipline and a year. On hover a floating media preview follows the cursor (typically). The list stays readable when no image is showing.
- The "More work (11)" count is a small credibility signal and an honest pointer.
- The page typically ends on a very large "Let's work together" section with a magnetic round button, email and phone. The move from portfolio to contact is the climax of the page, not a footer afterthought.
- Personality comes from a few moments: the greeting loader, the magnetic buttons and a local-time clock. Everything else is plain and commercial.

**Borrow conceptually**
- A hover-preview editorial list for the Work index and for Selected Work on the home page.
- Every project row reads as title, disciplines and year.
- A contact section that works as a destination: large type, one primary action, direct channels.
- A small, fixed IA (the repo spec already has Work, Services, About, Writing, plus the CTA).

**Do NOT copy**
- The greeting preloader. The brief bans "huge loading screens", and any preloader delays the 10–15 s value proposition.
- A portrait-led hero. Kamel's hero is typographic plus a procedural canvas.
- The custom round cursor follower. The repo spec bans custom cursor replacement.
- Magnetic effects on every link. The brief limits them to CTAs and primary navigation.

**Observations**
- *Typography:* one sans family, very large headline sizes, small sentence-case labels. The hierarchy comes almost entirely from size.
- *Spacing:* generous vertical padding between sections, typically about one viewport per major section.
- *Grid:* wide gutters and left-aligned text blocks offset against right-aligned media.
- *Motion:* typically inertial scroll plus eased reveals. The work preview has lag and mass instead of snapping.
- *Navigation:* a minimal top bar that typically collapses into a round menu button after scrolling.
- *Portfolio:* list first, image on intent. Each project detail typically ends with a large "Next case" teaser.

## 2. Obys Agency: typography, grid and editorial composition

**Sources:** homepage HTML fetched. It showed a long indexed project list, each entry with a sequence number (02, 04, 07 … 55), a title, an industry ("Architecture, Furniture", "Fashion") and services ("Creative Direction, Web Design/Dev", "Identity", "3D"). Visual composition is recalled and marked "typically".

**What works**
- **Numbered indexing.** Every project carries a number, so the list reads like a catalogue or a magazine table of contents.
- Two metadata axes per project: *industry* (what it is about) and *services* (what Obys did). That maps directly onto Kamel's "category" and "role".
- Oversized type is used as image. Headlines typically span most of the grid and sometimes break it, set against tiny mono or small-caps labels. The scale contrast between display and metadata is extreme on purpose.
- Asymmetry: text blocks typically sit on columns 1–5 or 7–12, never centred. Whitespace is part of the composition.
- The pacing alternates text-heavy spreads with image-heavy spreads, which gives it a magazine rhythm.

**Borrow conceptually**
- Index numbers (`01 /`, `02 /`) on Selected Work, Capabilities and Services.
- The two-axis metadata: category and role.
- A large scale jump between display and metadata, with nothing in between that looks like a card.
- Deliberate alternation between text sections (Capabilities, About) and media sections (Selected Work).

**Do NOT copy**
- Obys's typically warm, light, paper-like palette and serif display faces. Kamel is cold and dark with a grotesk.
- Letter-by-letter or glyph-scramble animations. The brief says "no random letter animations everywhere".
- Very long indexed lists on the home page. Kamel's home shows 4–6 selected projects, and the full index lives on `/works`.

**Observations**
- *Typography:* two voices, display and small label, with body text typically short. Numerals are prominent.
- *Spacing:* large, uneven vertical gaps are used for rhythm, not uniform padding.
- *Grid:* strict underneath and broken on purpose at the surface.
- *Motion:* line and mask reveals of headings, typically slow and eased.
- *Navigation:* sparse, often at the corners.
- *Portfolio:* an index plus a thumbnail. The number, title and metadata carry as much weight as the image.

## 3. Obys Experiment: lab presentation

**Sources:** fetched. The HTML showed "Experiment Space — Unpublished Works & Experiments", "Since 2018... ...Never Finished", a live local clock ("CEST 10:23 AM"), a counter ("00"), and the message "This experience was designed for desktop. Please revisit from a larger screen." Everything else about the experience is marked "typically" or not described.

**What works**
- It frames unfinished work honestly. "Never Finished" makes experiments legitimate portfolio content without pretending they are client products.
- Living metadata, such as a clock and counters, makes the page feel like a working studio.
- It is a separate framing from the main agency portfolio, so polished and exploratory work do not compete.

**Borrow conceptually**
- An **EXPERIMENT / PROTOTYPE / RESEARCH status label** in the project metadata system (for example `2026 / RESEARCH / PROTOTYPE`). A lab item can have a lighter layout: media, one paragraph, what was learned.
- Research belongs in the `/works` filter (`?category=research`) instead of in a separate site.

**Do NOT copy**
- The desktop-only gate. Mobile is a first-class design (brief §22) and the site must stay WCAG 2.2 AA.
- Obscure navigation, or an experience that has to be explored before it can be understood.

**Observations**
- *Typography:* very sparse copy. The clock and counter act as typographic ornament.
- *Motion / interaction:* typically canvas-driven, where the interaction is the content. That is fine for a lab and wrong for a commercial landing page.
- *Portfolio:* exploratory work framed as ongoing. This fits a "Lessons / Reflection" section.

## 4. Lusion: motion, depth and digital atmosphere

**Sources:** fetched. The HTML showed the positioning line ("We create 3D visual storytelling and interactive web experiences…"), a "scroll to explore" prompt, a Featured Work list with bullet-separated tags (`concept • web • design • development • 3d • animation`), "Let's work together!", a footer with the address, separate "General enquires" and "New business" emails, an R&D link (labs.lusion.co), and PLAY/MUTE sound toggles. The WebGL and 3D visuals are recalled and marked "typically".

**What works**
- The tag strings on each project are exactly the metadata-row idea: dense, lowercase, bullet-separated.
- Separate "New business" contact and an R&D lab link. Commercial and exploratory work are split cleanly.
- Sound is opt-in behind PLAY/MUTE, never autoplay. This matches brief §15.
- Controlled spectacle: typically one immersive 3D moment per view, with depth from parallaxed layers and scroll-linked camera moves while type stays crisp in the foreground.

**Borrow conceptually**
- Layered depth made with 2D means: a canvas line field behind, type in front, media at a third depth with a subtle parallax offset.
- Scroll-linked progress in the hero only, where the canvas responds to scroll position.
- An explicit sound toggle that feeds amplitude into visuals only after the user presses play (the existing wavesurfer showreel).
- A dedicated "Start a project" route for new business, apart from general links.

**Do NOT copy**
- Three.js / WebGL scenes, GPU-heavy post-processing and inertial smooth scroll. The repo spec rules out Three.js and smooth-scroll libraries.
- Full-screen scroll-to-explore gating before content, and "Keep scrolling" teasers that delay information.
- Heavy, long page transitions.

**Observations**
- *Typography:* a clean sans, a medium-large headline and small tag metadata.
- *Motion:* scroll-linked, cinematic, weighted. Things arrive with inertia.
- *Interaction:* cursor-reactive 3D, typically with a visible cursor.
- *Navigation:* minimal top bar plus a menu overlay.
- *Portfolio:* big media tiles with tags. The case studies are media-led.

## 5. Active Theory: ambience and environmental motion

**Sources:** the homepage fetch returned only the title ("Active Theory · Creative Digital Experiences"). The page is fully WebGL. Context comes from web search (The FWA "Insights… Active Theory v4", Active Theory's Medium case studies on their in-house Hydra framework, a webgpu.com showcase entry) and from memory. A third-party description of a strict 12-column grid with violet accents only on CTAs is **unverified** and not relied on.

**What works**
- The environment is the brand. Ambient motion (fog, particles, light) typically runs slowly in the background at low contrast, so UI text stays readable on top.
- Performance engineering is part of the craft. Their write-ups describe cheap lighting tricks and workers, so spectacle does not mean slow.
- A dark field with light used sparingly. Brightness is kept for things that matter.

**Borrow conceptually**
- **Ambient motion stays low in contrast and low in speed.** Hero line and waveform strokes at about 10–25% opacity of the primary text colour, moving on a time base of seconds, not frames.
- The canvas pauses when it is off screen or the tab is hidden (IntersectionObserver plus `visibilitychange`) and becomes a static frame under reduced motion.
- Tonal depth: the background is not flat. Soft vignettes and value shifts between `#090D12`, `#0F151D` and `#161E28`.

**Do NOT copy**
- Full 3D environments, cyberpunk neon and "alien" display fonts. The brief bans neon and gamer aesthetics.
- Navigation that lives inside a 3D scene, or a JS-only site with no HTML content (it fails SEO and accessibility).

**Observations**
- *Typography:* typically small UI type over the scene. The environment carries the scale.
- *Motion:* continuous but slow and environmental.
- *Navigation / portfolio:* typically spatial, where you move through a world. Unsuitable for a conversion site.

## 6. Cuberto: case studies and commercial presentation

**Sources:** fetched. The HTML showed "Digital design & development agency", a positioning line, "What we do", "Why Cuberto" with stats (15+ years, 300+ projects), client testimonials with logos, and a detailed FAQ (process: Discovery → UX research → IA → wireframing → UI → prototyping → development → QA → launch; tech choice; services list). Case study pages and hover details are recalled and marked "typically".

**What works**
- It answers commercial questions on the page: process, services, platform choice. An FAQ lowers the barrier to contacting.
- Credibility is layered: stats, awards and testimonials, each short.
- Case studies typically follow a steady beat: headline, client/services/year meta block, big media, short text blocks alternating with full-bleed imagery, next project.
- Distinctive interaction details (typically magnetic round buttons and hover blobs) are confined to CTAs.

**Borrow conceptually**
- A **process list** on `/services/software` and the mixing pages: numbered steps, not an illustration.
- A short FAQ on services pages covering revisions, turnaround and file delivery, using real policy from `SERVICE_CATALOG` only.
- A case-study rhythm for `/works/:slug`: meta block, hero media, then Context / Problem / Approach / Result, with a text block and full-bleed media alternating.
- A contact CTA at the end of each case study and each service page.

**Do NOT copy**
- Invented stats ("300+ projects"). Kamel shows real numbers only, and placeholders are badged.
- Testimonials unless they are real.
- Blob or gooey cursor effects, which read as agency-generic.

**Observations**
- *Typography:* large sans headlines and plain body. Readability first.
- *Spacing:* regular and business-like, less daring than Obys.
- *Navigation:* a standard top bar, typically with a hamburger overlay.
- *Portfolio:* case studies with a clear narrative spine.

## 7. Aristide Benoist: project metadata system

**Sources:** the homepage fetch returned only the title "Aristide Benoist — Independent developer" and a counter-like "0 0 1". Context comes from web search: Communication Arts describes "transitional editorial typography with a hyper-aligned technical grid", "full bleed monochromatic images with bold paginated numbers", and navigation by keyboard arrows, mouse or menu (FLIP-based transitions). Awwwards lists his portfolio as Site of the Month (June 2021). The current version was not observed in detail.

**What works**
- **Pagination as identity.** A large `001`-style index turns project order into typography.
- A hyper-aligned grid. Every label snaps to a column, and metadata looks engineered.
- Projects can be browsed by keyboard (arrow keys), an accessibility and power-user bonus.
- Monochrome imagery keeps the palette controlled, so the work never fights the UI.

**Borrow conceptually**
- The **metadata row** from brief §11: `01 / ECHO CANVAS / AI / SOFTWARE / INTERACTION / 2026`, set in IBM Plex Mono, uppercase, tracked, in the muted metadata colour, aligned to grid columns.
- Zero-padded index numbers (`01`, `001`) as a recurring typographic motif.
- Optional desaturated or duotone treatment of cover images at rest, returning to full colour on hover or focus.
- FLIP-style continuity from list item to project hero (Web Animations API, or a View Transition where supported).

**Do NOT copy**
- Navigation that relies only on arrow keys, or a single-screen slider that hides the full list from crawlers and screen readers.

**Observations**
- *Typography:* editorial display plus technical mono.
- *Grid:* rigid and visible in the alignments.
- *Motion:* FLIP transitions give spatial continuity between states.

## 8. Landing.love: supporting research only

**Sources:** fetched. It is a gallery ("Showcase of the best 2156 Animation Websites") with category filters (Portfolio 562, Dark Mode 633, 3D Websites 568, Minimal 1381, Studio 545, …) and full-page video recordings.

**Use:** a place to check specific patterns, such as how other dark portfolios handle filter chips, hover-preview lists and mobile navigation. It is not a style source.

**Do NOT:** assemble the site from trending interactions found here. Each interaction has to serve one of the brief's motion primitives (§12).

---

## 9. What this means for Kamel

| Reference | Role in brief | What Kamel takes | Repo constraint that shapes it |
| --- | --- | --- | --- |
| Dennis Snellenberg | Structure and portfolio UX | Short IA; hover-preview editorial list; contact as the climax section; CTA repeated at the end of every major page | No custom cursor: the preview follows the pointer as an absolutely positioned image, the system cursor stays visible, and on touch or keyboard the preview is inline |
| Obys Agency | Typography and grid | Extreme display-to-metadata scale contrast; index numbers; asymmetric 12-column compositions; alternating text and media sections | Fontsource-only: one geometric/industrial grotesk for display, Noto Sans TC Variable for body and CJK, IBM Plex Mono for metadata. Barlow Condensed removed. Display must also work for zh headings, where CJK falls back to Noto Sans TC, so scale rather than letterform carries the hierarchy |
| Obys Experiment | Lab presentation | A research/prototype status in metadata; lighter layout for lab items; "reflection" framing | Must work on mobile; no desktop-only gates |
| Lusion | Depth | Layered 2D depth; scroll-linked hero only; opt-in sound feeding visuals | No Three.js, no smooth-scroll library. Hero is a 2D `<canvas>` reacting to cursor, scroll, time and wavesurfer amplitude |
| Active Theory | Ambience | Slow, low-contrast ambient field; tonal background variation; performance as craft | Canvas pauses off screen; static frame under `prefers-reduced-motion` |
| Cuberto | Case studies and commercial | Case-study narrative spine; process steps; FAQ; CTA after every case | Never invent stats, testimonials or prices. Software shows "Contact for quote"; mixing prices come from `SERVICE_CATALOG` |
| Aristide Benoist | Metadata | Mono uppercase metadata rows; zero-padded indices; desaturate-at-rest media; FLIP continuity | Metadata colour must still pass AA (4.5:1 for small text). Brief's `#596674` on `#090D12` is about 3.3:1, so it is decorative only and needs lightening for readable labels. Visual agent to confirm |
| Landing.love | Supporting | Pattern lookup only | — |

**Cross-cutting constraints for every agent**
- Motion tooling: CSS first, then WAAPI plus IntersectionObserver, then GSAP only if `docs/motion-system.md` justifies it. No Three.js, no smooth-scroll library, no custom cursor.
- zh/en: every label, metadata row and CTA is authored in both locales. Metadata rows stay Latin uppercase in both (they are codes), and section titles are localized. Display type must handle CJK line breaks, so no layouts that depend on a word breaking at a fixed character count.
- WCAG 2.2 AA: 44 × 44 px targets, visible focus (replacing the coral outline with the new accent at 3:1 or better against adjacent colours), and hover content must also be reachable by focus.
- Placeholders get a visible `PLACEHOLDER` badge. Reference-style credibility (stats, awards, logos) is only as real as the content.
