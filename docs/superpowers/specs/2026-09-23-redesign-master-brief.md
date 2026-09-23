# Redesign Master Brief (as supplied by Kevin, 2026-09-23)

This is the master prompt for the Cold Industrial Editorial redesign experiment,
recorded verbatim in substance so every agent works from the same source.
Repo-specific adaptations live in `2026-09-23-editorial-redesign-design.md`,
which takes precedence wherever the two differ.

---

## MASTER PROMPT — Personal Portfolio / Freelance Website

You are the lead product designer, creative developer, motion designer, UX
architect, and frontend engineer responsible for designing and implementing a
premium personal portfolio website for Kevin Yang.

This website is not merely a résumé website. It must simultaneously function as:

1. A personal brand website
2. A creative portfolio
3. A software / technology portfolio
4. A music production and mixing portfolio
5. A freelance service landing page
6. A credibility / achievement showcase
7. A personal writing and social-content gateway
8. A conversion-oriented contact website

The final experience should feel intentionally designed, technically
sophisticated, visually memorable, and commercially usable.

Do not produce a generic developer portfolio. Do not produce a generic
dark-mode SaaS website. Do not produce an over-animated Awwwards-style
experiment that sacrifices usability.

The target design language is:

**«Cold Industrial Editorial × Creative Technology × Music Culture»**

The website should feel precise, restrained, atmospheric, modern, technically
capable, slightly experimental, but still professional enough that a potential
client would trust Kevin with a paid project.

### 1. Primary business goal

**«Convert visitors into freelance clients.»** Portfolio presentation exists to
establish credibility for that goal.

Primary freelance categories: Mixing, Music Production, Software Development,
Interactive / AI Experiences.

The website must quickly communicate: who Kevin is, what Kevin creates, why his
work is credible, what services are available, what previous work demonstrates
his capabilities, what it might cost to work with him, how to contact him.

A visitor should understand the core value proposition within approximately the
first 10–15 seconds.

### 2. Creative positioning

Kevin works across: Software Engineering, AI / Creative Technology, Interactive
Systems, Music Production, Mixing, Creative Development, Research,
Competitions / Hackathons.

Do not visually isolate these disciplines as if they belong to unrelated people.
Communicate **«One creator working across software, sound, interaction, and
technology.»** Unifying themes: systems, interaction, precision,
experimentation, technology, sound, creativity. Software and music should feel
like different manifestations of the same creative identity.

### 3. Reference websites

Study before designing. Do NOT copy layouts, branding, or animations
one-to-one. Extract underlying design principles.

- **Dennis Snellenberg** (https://dennissnellenberg.com/) — SITE STRUCTURE +
  PORTFOLIO UX: information architecture, project presentation, large
  typography, section rhythm, hover interactions, work preview interactions,
  navigation, CTA placement, portfolio-to-contact transition, personality vs
  commercial clarity.
- **Obys Agency** (https://obys.agency/) — TYPOGRAPHY + GRID + EDITORIAL
  COMPOSITION: typography hierarchy, editorial layouts, asymmetric grids,
  whitespace, oversized type, modular layouts, restrained color, visual rhythm,
  grid discipline, text-heavy ↔ visual-heavy transitions.
- **Obys Experiment** (https://experiment.obys.agency/) — lab-style
  presentation for experiments, prototypes, research, unfinished creative
  technology projects. Not every project must look like a polished product.
- **Lusion** (https://lusion.co/) — MOTION + DEPTH + DIGITAL ATMOSPHERE:
  spatial composition, dark interfaces, layered depth, parallax, cursor
  interaction, cinematic transitions, controlled spectacle, scroll-linked
  motion. Do not replicate its complexity everywhere; stay fast and readable.
- **Active Theory** (https://activetheory.net/) — AMBIENCE + ENVIRONMENTAL
  MOTION: dark atmospheric interfaces, ambient effects, subtle particles,
  low-contrast background graphics, immersive heroes, depth.
- **Cuberto** (https://cuberto.com/) — CASE STUDIES + COMMERCIAL
  PRESENTATION: case studies, service presentation, storytelling, interaction
  details, CTA design, balancing experimentation with business information.
- **Aristide Benoist** (https://aristidebenoist.com/) — PROJECT METADATA
  SYSTEM: metadata, category labels, role presentation, e.g.
  `2026 / AI / SOFTWARE / DESIGN + DEVELOPMENT` or
  `2026 / MUSIC / MIXING + MASTERING`.
- **Landing.love** (https://www.landing.love/) — supporting research only
  (filters: Portfolio, Dark Mode, GSAP, WebGL, Three.js, Creative Developer).
  Do not turn the site into a collection of unrelated trendy interactions.

### 4. Reference analysis workflow

Before implementation create `docs/design-reference.md`: for each major
reference document what works, what to borrow conceptually, what NOT to copy,
and observations on typography, spacing, grid, motion, interaction, navigation,
portfolio presentation.

Then create `docs/design-principles.md`: reduce the references into ~8–12
design rules (e.g. large typography carries hierarchy; motion reinforces
spatial relationships; important work gets more space than descriptive copy;
interactive effects react to intention, not constantly demand attention; dark
backgrounds contain subtle tonal variation; accent colors are rare; layout
feels editorial rather than dashboard-like). Do this BEFORE building final UI
components.

### 5. Visual direction

Cold dark palette. Avoid pure black. Starting palette (adjustable for contrast
and coherence):

| Role | Value |
| --- | --- |
| Background | `#090D12` |
| Secondary background | `#0F151D` |
| Elevated surface | `#161E28` |
| Primary text | `#E8EDF2` |
| Secondary text | `#8995A3` |
| Muted metadata | `#596674` |
| Primary accent | `#A7C7E7` |
| Secondary accent | `#788BFF` |

Roughly 85% neutral dark tones, 10% neutral bright typography, 5% accent.
Avoid: neon cyberpunk overload, RGB gradients everywhere, excessive blue glow,
gamer aesthetics, glassmorphism everywhere, generic AI startup visuals. Dark
does not mean black. Technology does not mean neon. Premium does not mean
excessive blur.

### 6. Typography

A primary visual system. Strong modern grotesk / geometric sans-serif:
geometric, precise, modern, industrial, not aggressive, highly readable, strong
numerals, excellent large-scale display. 3–4 levels: Display, Heading, Body,
Metadata. Oversized display selectively (e.g. `KEVIN / YANG`, `BUILDING /
SYSTEMS, / SOUND & / INTERACTIONS.`). Typography is part of the composition.
Do not put everything inside cards; use typography, space, lines, imagery and
alignment as layout elements.

### 7. Grid system

Disciplined editorial 12-column desktop grid, max content width ~1400–1600px.
Asymmetric compositions, large whitespace, controlled edge alignment,
full-bleed project imagery where appropriate, occasional deliberate grid
breaking. Avoid endless centered cards, identical 3-column feature grids, SaaS
dashboard layouts, excessive rounded rectangles. Sections should feel composed
rather than generated.

### 8. Information architecture

- **HOME**: Hero, Selected Work, Capabilities, Selected Recognition, Services,
  Pricing Preview, About, Writing / Social, Contact CTA, Footer.
- **WORK**: all projects, filters All / Software / AI / Interactive / Music /
  Mixing / Research; structured metadata per project.
- **PROJECT DETAIL**: Name, Year, Category, Role, Technology / Tools, Context,
  Problem, Approach, Process, System / Architecture, Design, Result, Media,
  Links, Lessons / Reflection. Not every project requires every field.
- **SERVICES**: Mixing (what is included, deliverables, revision policy,
  workflow, pricing, turnaround) and Software Development (web development,
  prototypes, AI integrations, internal systems, creative technology,
  interactive installations, custom software). Software may use "Starting from
  NT$____" or "Contact for quote" until real pricing exists. Never invent
  pricing.
- **ABOUT**: multidisciplinary creator; not an autobiography. What he creates,
  how he thinks, how software and music connect, approach to systems and
  creative work.
- **WRITING**: selected content from Threads, Instagram, articles, technical
  notes, creative reflections. No huge social feed; editorial cards, e.g.
  `ARTICLE / 2026.09.20 / Why I Build Tools Instead of Just Using Them / → Read
  on Threads`.
- **CONTACT**: primary CTA START A PROJECT; project type selector (Mixing,
  Music Production, Software Development, AI / Interactive, Other). Contact CTA
  appears multiple times without becoming repetitive.

### 9. Homepage hero

Immediately establish identity: name, three roles (Music Producer, Software
Developer, Creative Technologist), one positioning statement ("Building
systems, sound, and interactive experiences."), primary actions VIEW WORK and
START A PROJECT. No long biography copy. Include an atmospheric visual system
(waveform, spectral analysis, procedural lines, node graphs, particles,
abstract geometry, subtle 3D, interactive noise, generative systems) that
subtly reacts to cursor, scroll, time, optional audio data. Not a meaningless
WebGL demo; it must reinforce technology × sound × systems.

### 10. Project presentation

Selected Work intentionally mixes categories (AI / creative technology, mixing,
interactive experiment, software platform, research) to demonstrate
multidisciplinarity immediately. Do not split into four isolated worlds.

### 11. Project cards

Avoid generic rectangular cards. Use multiple presentation modes: large feature
project, full-width media, editorial list, hover-preview list, horizontal media
strip, metadata row (`01 / ECHO CANVAS / AI / SOFTWARE / INTERACTION / 2026`).
On hover: media appears, typography subtly shifts, cursor responds, background
changes slightly. Not every interaction is dramatic.

### 12. Motion design system

Create `docs/motion-system.md` with reusable primitives:

1. Text Reveal (hero type, section headers, project titles): mask reveal,
   translate, opacity. No random letter animations everywhere.
2. Scroll Reveal: small translation, opacity, controlled stagger. Not excessive.
3. Project Media Parallax: subtle speed offset.
4. Hover Preview: image / video / canvas preview following cursor location.
5. Magnetic Interaction: only on CTA, primary navigation, important buttons.
6. Page Transition: Home ↔ Work ↔ Project feel spatially connected; use project
   imagery or typography as continuity.
7. Ambient Motion: noise, particles, lines, waveforms, slow gradient movement,
   procedural forms; subtle while the visitor is reading.

### 13. Motion character

Smooth, inertial, physical, weighted, restrained, precise. Objects have mass.
Avoid bouncy cartoon animation, excessive springs, hyperactive cursor effects,
constant motion, animations longer than necessary.

### 14. Micro interactions

Define idle / hover / pressed / focus / disabled for navigation, buttons,
links, project titles, thumbnails, filters, pricing cards, contact CTA, social
links, audio controls.

### 15. Music-specific experience

Optional audio playback with a minimal embedded player (Track, Artist, Role,
Mixing / Production / Mastering, Year, Credits). No autoplay. When audio plays,
subtle visual elements may respond to amplitude or spectrum. Keep lightweight.

### 16. Software project experience

Emphasize problem solving: CONTEXT, PROBLEM, ROLE, SYSTEM, TECHNOLOGY,
PROCESS, RESULT. Strong projects may include architecture diagrams, interface
screenshots, prototype videos, before / after, metrics where real data exists.
Never invent metrics.

### 17. Awards & credibility

Clean metadata presentation (`2026 / OpenAI Build Week / 1st Place — Developer
Tools`). No trophy graphics. Awards support credibility; they do not dominate.

### 18. Pricing

Transparent but professional. Distinct sections for Mixing and Software
Development. Structures: STARTING AT, PROJECT BASED, CUSTOM QUOTE. Do not
fabricate any real price. Store pricing separately for easy updates.

### 19. Content architecture

Separate content from UI. Projects as structured data (id, slug, title, year,
category, role, description, featured, services, technologies, cover, media,
links, credits, content). Easy to add projects; do not hard-code dozens inside
UI components.

### 20. Technical implementation

Respect the existing architecture unless there is a strong technical reason to
change it. Motion hierarchy: CSS → lightweight animation library → GSAP →
WebGL / Three.js. Use the simplest capable tool. No heavy dependencies for
trivial effects. Smooth scrolling only if justified.

### 21. Performance

Smooth 60fps where practical, no layout thrashing, animate transform / opacity,
optimize images / video / fonts, lazy-load expensive content, never initialize
scenes that are not visible, respect device capability, simplified mobile
motion.

### 22. Responsive design

Mobile is designed intentionally, not compressed desktop. Typography stays
expressive, hierarchy clear, hover has mobile equivalents, cursor effects
disappear gracefully, expensive effects simplify, navigation stays fast.

### 23. Accessibility

Keyboard navigation, visible focus, semantic HTML, sufficient contrast,
screen-reader labels, `prefers-reduced-motion` disables or simplifies
parallax, smooth scrolling, cursor effects, large transitions, ambient
animation. Usable without motion.

### 24. SEO / sharing

Titles, descriptions, OpenGraph, project metadata, social preview images,
semantic headings, structured URLs.

### 25. Anti-patterns (never)

Generic gradient blobs, random glass cards, neon borders everywhere, excessive
rounded rectangles, fake terminal sections, decorative fake code, constant
parallax, scroll hijacking, slow page transitions, usability-reducing custom
cursors, animation on every element, huge loading screens, meaningless 3D,
"Hello, I'm Kevin" templates, skill percentage bars.

### 26. Design principle

**«Quiet by default. Expressive on interaction.»** The page must look strong
when nothing moves. If it needs animation to look interesting, redesign the
static composition.

### 27. User journey

Primary: Landing → Understand Kevin → See impressive work → Understand
capabilities → Build trust → Understand services → See pricing / engagement
model → Start project.

Secondary: Landing → Work → Case study → Contact; Landing → Mixing → Audio work
→ Pricing → Contact; Landing → Software → Case study → Contact; Landing →
Article → Threads / Instagram.

### 28. Multi-agent workflow

- Research Agent → `docs/design-reference.md` (+ `docs/design-principles.md`)
- UX / IA Agent → `docs/information-architecture.md`
- Visual Design Agent → `docs/design-system.md`
- Motion Agent → `docs/motion-system.md`
- Frontend Agent → implementation following the documents; no independent
  redesign of the visual language without justification.
- QA / Review Agent → review (the original message was cut off here; assumed
  scope: visual fidelity to the docs, accessibility, performance,
  responsiveness, and consistency across pages).
