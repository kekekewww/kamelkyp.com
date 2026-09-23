# Motion System

Date: 2026-09-23 · Owner: Motion Design Agent · Branch: `worktree-editorial-redesign`

Sources, in order of precedence:

1. `docs/superpowers/specs/2026-09-23-editorial-redesign-design.md` (the "spec", section 6 is this document's mandate).
2. `docs/superpowers/specs/2026-09-23-redesign-master-brief.md` (the "brief", sections 9, 11–15, 21–23, 25, 26).
3. `docs/design-principles.md` (binding; rules 1, 7, 8, 11 and 12 above all).
4. `docs/information-architecture.md` (the "IA", which components exist).
5. The current code: `app/styles/motion.css`, `app/styles/tokens.css`, `app/components/media/*`, `app/lib/media/playback-coordinator.ts`, `app/components/layout/site-header.tsx`, `app/root.tsx`, `app/lib/security/headers.server.ts`.

This document supersedes the durations in the current `tokens.css`
(`--motion-fast: 140ms`, `--motion-normal: 220ms`, `--motion-panel: 320ms`) and
the whole of the current `motion.css`.

Colour names used below (`--color-text-primary`, `--color-text-secondary`,
`--color-text-muted`, `--color-accent`, `--color-accent-audio`, `--color-bg-0/1/2`,
`--color-rule`) are semantic placeholders. The foundation agent maps them to the
names that `docs/design-system.md` defines. This document only fixes *which
property changes, how long it takes and on which curve*.

---

## 0. Findings from the current code that shape this system

These are facts about the repository that every primitive below has to respect.

| # | Finding | Consequence |
| --- | --- | --- |
| F1 | CSP is `style-src 'self'` with **no** `'unsafe-inline'` and no style nonce (`headers.server.ts`). `script-src` allows `'self'` plus a per-request nonce that React Router applies to its own scripts (`entry.server.tsx`). | (a) **No `style="…"` attribute may be server-rendered** for motion. React's `style` prop is serialized into the SSR HTML and the browser blocks it (and logs a CSP violation). Motion state in SSR markup is expressed only with **classes and `data-*` attributes**. (b) Runtime values (cursor position, parallax offset, custom properties) are written on the client through the CSSOM (`el.style.setProperty("--x", …)`, `el.style.transform = …`) or via `element.animate()`. Both are allowed under `style-src 'self'`; `el.setAttribute("style", …)` is not and is forbidden. (c) No new inline `<script>` in `<head>` (the spec says CSP nonce handling stays unchanged), so there is **no pre-paint "js" class**. See §2.0 for how reveals avoid a flash without it. |
| F2 | `wavesurfer.js@7.12.11` is in `package.json` but **no file in `app/` imports it**. The only audio player is `DirectAudioPreview`, which plays a plain `HTMLAudioElement` created with `new Audio()`. Its "waveform" is 32 static `<span>` bars (`.media-waveform`). The spec and design-reference describe a "wavesurfer-based showreel"; that is the plan in `docs/superpowers/plans/2026-08-10-03-media-preview.md`, not the shipped code. | Hero amplitude is read from a **Web Audio `AnalyserNode` attached to the existing `HTMLAudioElement`**, not from wavesurfer. We do **not** introduce wavesurfer here: v7 renders into a shadow root with its own inline `<style>` (expected to be blocked by `style-src 'self'`) and fetches/decodes the audio file itself (cross-origin fetch is blocked by `connect-src 'self'`). Removing the unused dependency is a follow-up for the lead, not part of this doc. |
| F3 | The showreel (`media[0]` of D1 `page/home`) can be a YouTube or Google Drive embed (iframe, consent-gated) or a direct / GitHub-raw / R2 audio URL. `media-src 'self' https:` allows cross-origin audio. | Amplitude is only available for **direct audio from a CORS-enabled host**. Routing a cross-origin element without CORS through `createMediaElementSource` makes the element **play silence**, so the analyser is attached only when the host is on an allowlist (§4.5). Embeds and non-CORS hosts get state-reactive (not amplitude-reactive) behaviour. |
| F4 | `PlaybackProvider` re-creates the `PlaybackCoordinator` per `location.pathname` (keyed boundary) and calls `stopAll()` on unmount. | The amplitude channel lives on the coordinator, so it is torn down on navigation for free. The hero canvas subscribes through `usePlayback()`. |
| F5 | React 19.2, React Router 8.3, no animation library installed. RR exposes `<Link viewTransition>`, `<NavLink>` render prop `isTransitioning`, `useViewTransitionState(to)` and `useNavigation()`. | Page transitions use the router's built-in View Transitions integration. No dependency is added by this document. |
| F6 | The current `motion.css` blanket rule sets `transition-duration: 1ms` on `*` under reduced motion. | Kept in spirit but rewritten: reduced motion keeps **opacity/colour transitions at `--dur-1`** (principle 12: "only opacity transitions") and removes every transform. |

---

## 1. Motion character and tokens

Character (brief §13): smooth, inertial, weighted, restrained, precise. Things
start promptly and settle slowly. Nothing overshoots, bounces or loops beside
text.

### 1.1 Durations

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | `120ms` | Colour, opacity, underline on small UI (≤ 48px tall). Pressed-state feedback. Reduced-motion cross-fades. |
| `--dur-2` | `200ms` | Hover transforms on UI (arrow nudge, row indent), focus-ring fade, chip state, menu-button icon. |
| `--dur-3` | `320ms` | Medium elements: hover-preview in/out, mobile menu panel, filter list re-entry per row, audio bar settle, magnetic release. |
| `--dur-4` | `480ms` | Large elements and continuity: page transition (**hard cap**), parallax catch-up when parallax resumes, feature-media hover scale. |
| `--dur-5` | `720ms` | Entrances only: Text Reveal, Scroll Reveal of blocks and media. Never used for anything the visitor is waiting on. |

Stagger step: `--stagger: 60ms` (lists) and `--stagger-line: 80ms` (text lines).

No duration longer than `--dur-5` exists. No sequence (duration + total stagger)
may exceed **1000ms** from trigger to the last element at rest.

### 1.2 Easings (all monotonic, no overshoot: every control point y ∈ [0, 1])

| Token | Value | Character | Use |
| --- | --- | --- | --- |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Prompt start, soft stop | Default for UI hover/focus transforms and colour. |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Very fast start, very long tail | Text Reveal and Scroll Reveal (the "arrives with mass" feel). |
| `--ease-weighted` | `cubic-bezier(0.33, 0, 0.13, 1)` | Brief inertia, then long settle | Large elements: hover-preview media, magnetic release, parallax catch-up, feature media. |
| `--ease-in-out-quint` | `cubic-bezier(0.83, 0, 0.17, 1)` | Symmetric, decisive | Page transition morphs (title/cover), progress hairline. |
| `--ease-in-quart` | `cubic-bezier(0.5, 0, 0.75, 0)` | Accelerating exit | Exits only (old page fade, preview out). Always shorter than the matching entrance. |
| `--ease-linear` | `linear` | — | Continuous values driven by rAF (canvas time, scroll-linked parallax). |

### 1.3 Pairing rule (size × travel → duration and curve)

| Element | Largest dimension | Travel | Duration | Easing |
| --- | --- | --- | --- | --- |
| Icon, arrow, underline, chip, focus ring | ≤ 48px | ≤ 4px | `--dur-1` (colour) / `--dur-2` (transform) | `--ease-out-quart` |
| Button, nav link, form field, row content | ≤ 120px tall | ≤ 8px | `--dur-2` | `--ease-out-quart` |
| Card-sized block, preview media, menu panel | ≤ 480px | ≤ 16px | `--dur-3` | `--ease-weighted` (in), `--ease-in-quart` at `--dur-2` (out) |
| Section heading, text block, list group entrance | any | ≤ 24px | `--dur-5` | `--ease-out-expo` |
| Full-width media, page-level continuity | > 480px | morph (FLIP) | `--dur-4` | `--ease-in-out-quint` |

Rule of thumb: duration grows with **area and travel**, never with importance.
Exits use the next-shorter token and `--ease-in-quart`.

### 1.4 Distance caps

| Motion | Cap |
| --- | --- |
| Scroll Reveal translate | **24px** for blocks and media, **16px** for text and list rows, **8px** for filter re-entry. Direction: up only (`translateY(+n) → 0`). No horizontal slide-ins. |
| Text Reveal | `clip-path` mask from the bottom plus `translateY` ≤ **24px** (never `100%` of the line box). |
| Parallax | **±6% of the media frame height, hard-capped at 48px**; media is over-scaled to `1.12` inside an `overflow: clip` frame so edges never show. |
| Hover row shift | Title `translateX` ≤ **8px**; arrow ≤ **4px**. |
| Magnetic pull | Element ≤ **6px**, inner label an extra ≤ **2px**. |
| Hover-preview media | Follows the cursor inside the list's bounding box; never leaves it. Scale in `0.96 → 1`. |
| Pressed state | `scale(0.98)` on buttons only (not on links, rows or cards). |

---

## 2. Primitives

### 2.0 Shared contract (applies to every primitive)

**SSR-first static end state.** The server HTML is always the finished,
visible composition (principle 1 and 12). No element is hidden by CSS unless
JavaScript has explicitly *armed* it, and JS arms only elements that are
**entirely below the fold** at hydration time, so the arm never causes a
visible flash. Elements already on screen at hydration stay static (except the
hero, which uses a CSS-only intro, see 2.1).

**Motion tier**, computed once on the client by `getMotionTier()` in
`app/lib/motion/reduced-motion.ts` and re-evaluated on `change` of the media
queries:

| Tier | Condition (first match wins) | Effect |
| --- | --- | --- |
| `static` | `matchMedia("(prefers-reduced-motion: reduce)").matches` | No transforms, no parallax, no magnetic, no canvas loop (single frame), no hover-preview motion (preview appears in place with opacity), reveals disabled (content already visible), view-transition morphs off. Colour/opacity transitions at `--dur-1` remain. |
| `lite` | any of: `(hover: none)`, `(pointer: coarse)`, `innerWidth < 1024`, `navigator.connection?.saveData === true`, `navigator.hardwareConcurrency <= 4`, `navigator.deviceMemory <= 4` (when defined) | Reveals on (shorter: `--dur-4`, travel halved), no parallax, no magnetic, no cursor-following preview (inline thumbnails instead), hero canvas at reduced density / DPR 1 / 30fps cap. |
| `full` | otherwise | Everything in this document. |

The tier is written to `document.documentElement.dataset.motion = "static" | "lite" | "full"`
after hydration so CSS can key off it. Server snapshot of the tier is `"static"`
(the safe state), so SSR output never depends on it.

**Reduced motion is also enforced in CSS** so that the static state holds even
if JS never runs: every transform-based rule lives inside
`@media (prefers-reduced-motion: no-preference)`.

**Performance rules (all primitives):**

- Animate only `transform` and `opacity`, plus `clip-path: inset()` for Text
  Reveal. Colour transitions are allowed on hover/focus of small UI only.
- `will-change` is **never** set in static CSS. It is added by JS immediately
  before an animation and removed in `animation.finished` / on
  `transitionend`. Exceptions (set while the effect is active only): the
  hover-preview element (`transform, opacity`) while the pointer is inside the
  list, parallax media while in the IO-active window, the hero canvas (none
  needed).
- One shared `IntersectionObserver` per option set (module singleton in each
  hook file), not one per element.
- One shared rAF scheduler (`app/lib/motion/frame.ts`): reads (`getBoundingClientRect`,
  `scrollY`) are batched in a read phase, writes in a write phase. No hook calls
  `requestAnimationFrame` directly.
- Reveal elements are `unobserve`d after their first reveal. Nothing reveals twice.
- Every loop (canvas, parallax, hover-preview follow, magnetic, audio bars)
  stops on `document.visibilityState === "hidden"` and when its element leaves
  the viewport, and resumes on return.
- Pointer listeners are `passive: true`. No `scroll` listener does layout reads
  outside the rAF read phase.

---

### 2.1 Text Reveal

| Aspect | Spec |
| --- | --- |
| Purpose | Establish hierarchy on entry: the display line arrives first, metadata follows. |
| Allowed | Home hero: eyebrow, `h1` Kamel, real-name line, roles line, statement (CSS intro, on first load only). Section opener `h2`s on Home (Selected Work, Capabilities, Recognition, Services, Pricing, About, Writing, Contact CTA heading). `h1` of Work index, Project detail, Services, Software & Interactive, About, Writing. Contact band heading on every page. |
| Forbidden | Body paragraphs, metadata rows, prices (`ServicePrice`, `ServiceOverview` figures), wizard/commission pages (all `/commission/**`), Terms/Privacy, error page, admin, nav/footer, buttons and links. No letter-by-letter or glyph animation anywhere; no automatic line splitting (CJK and en wrap differently). |
| Tier | Hero intro: **CSS** `@keyframes` (runs without JS). All others: **WAAPI + IO**. |
| Trigger | Hero: page load (CSS). Others: element's top crosses 90% of viewport height (`rootMargin: "0px 0px -10% 0px"`, `threshold: 0`), only if armed (below fold at hydration or rendered after a client navigation). |
| Motion | Mask: `clip-path: inset(0 0 100% 0) → inset(0 0 0 0)` plus `translateY(min(0.25em, 24px)) → 0`, opacity `0 → 1` over the first 40% of the duration. `--dur-5`, `--ease-out-expo`. |
| Units | Whole element by default. Authored lines only when the markup wraps them: `<span class="reveal-line">` (hero statement, multi-line display headings). Never split by JS. |
| Stagger | `--stagger-line` 80ms per line, **max 4 lines**; lines 5+ start with line 4. Hero order: eyebrow 0ms → name line 80 → `h1` 160 → roles 240 → statement 320 → CTAs 400 (CTAs use opacity + 8px, `--dur-4`). Total ≤ 1000ms. |
| API | Data attributes: `data-reveal="mask"` on the heading; optional `data-reveal-delay="0–4"` (× 60ms). Hook: `useReveal(ref, { variant: "mask" })` for components that need it programmatically. Hero uses class `.hero-intro` and `.hero-intro__item` with `data-intro-step="0–5"` (CSS maps step → `animation-delay`; no `style` attribute, per F1). |
| Reduced motion | No animation. Element rendered at `clip-path: none; opacity: 1; transform: none`. CSS intro keyframes live inside `@media (prefers-reduced-motion: no-preference)`. |
| Touch / mobile | Same, but `lite` tier uses `--dur-4` and 12px max travel. Hero intro identical (CSS, cheap). |
| Performance | `clip-path: inset()` is composited in current engines; set `will-change: clip-path, transform` only during the animation. The hero intro must not delay LCP. The `h1` is laid out and painted at once and is revealed from a `clip-path` edge (keyframe 0% = `clip-path: inset(0 0 100% 0)`), not faded in from `opacity: 0`, so its paint is not held back by the animation. The intro runs once per document load. Client-side navigations back to Home do **not** replay it: the route adds `.hero-intro` only in the server-rendered first document, and a client effect removes the class after `animationend` so a later client render of the hero is static. |

### 2.2 Scroll Reveal

| Aspect | Spec |
| --- | --- |
| Purpose | Signal that a new block has arrived, with a controlled rhythm. Never needed for the page to look complete. |
| Allowed | Home: Selected Work rows (group), Capabilities groups (group), Recognition rows (group), Services group blocks (group), Pricing rows (group), About teaser block, Writing cards (group), Contact band body. Work index rows (group, first 8 only), Project detail: metadata grid (group), each case-study section block, media figures, Next project, CTA band. Services overview group blocks and process steps. Software page offering list, engagement models, process steps, related work, contact block. About sections. Writing index cards (first 8). |
| Forbidden | Header, footer, nav, filters, breadcrumbs, back links, prices, any form or wizard step, legal text, error page, admin, anything above the fold at hydration, inline elements inside paragraphs, individual list items beyond the cap. |
| Tier | **WAAPI + IO** (`element.animate`). |
| Trigger | Top crosses 90% of viewport (`rootMargin: "0px 0px -10% 0px"`, `threshold: 0`). Unobserve on reveal. |
| Motion | `opacity 0 → 1`, `translateY(24px → 0)` for blocks/media, `16px` for rows/text. `--dur-5`, `--ease-out-expo`. Opacity uses the same duration (not a separate fade). |
| Stagger | On a `data-reveal-group` parent, children `[data-reveal-item]` stagger by `--stagger` 60ms; **max 6 staggered children**, children 7+ start with child 6 (total stagger cap **300ms**). Children entering the viewport later than the group (long lists) reveal individually when they intersect, with no stagger. |
| API | `data-reveal="up" \| "fade"` + optional `data-reveal-delay="0–4"` on a single element. `data-reveal-group` on the parent + `data-reveal-item` on children. Hook: `useReveal(ref, { variant?: "up" \| "fade" \| "mask"; delay?: 0–4; group?: boolean })` which returns nothing and is a no-op on the server. A single root-level `<RevealRoot />` (in `root.tsx`, client effect) can also scan `[data-reveal]` after each navigation so route components need no hook. |
| Arm logic | On mount / after navigation commit: for each `[data-reveal]` not yet processed, read `getBoundingClientRect()` in the rAF read phase. If `rect.top >= innerHeight` → set `data-reveal-state="armed"` (CSS: `opacity: 0; transform: translateY(var(--reveal-y))`, only under `no-preference`) and observe. Else → `data-reveal-state="done"`, no animation. On intersect: run WAAPI from the armed values to identity with `fill: "backwards"`, then set `data-reveal-state="done"` and cancel the animation (so the element returns to its CSS end state, no retained fill). |
| Reduced motion | Never armed. Content static and visible. |
| Touch / mobile | `lite`: `--dur-4`, travel halved (12px / 8px), stagger cap 4 children. |
| Safety | `@media print` and `:target` / `:focus-within` force `opacity: 1; transform: none` on armed elements (keyboard focus moving into an armed block reveals it instantly). If `IntersectionObserver` is missing, nothing is armed. |

### 2.3 Project Media Parallax

| Aspect | Spec |
| --- | --- |
| Purpose | Give project media a third depth layer (canvas behind, type in front, media between). Subtle; the visitor should feel it, not notice it. |
| Allowed | Only project media: the home **feature project** media (the large first Selected Work item), the Project detail hero cover / procedural cover, and full-bleed `media` section figures on Project detail. **Max 2 parallax elements per viewport.** |
| Forbidden | Text of any kind, Work index rows and their thumbnails, hover preview, cards, Writing, Services, Pricing, About, footer, header, the hero canvas (it has its own scroll response), backgrounds, any section as a whole. Principle 7: no parallax on every section. |
| Tier | **CSS scroll-driven animation** where `CSS.supports("animation-timeline: view()")`; otherwise **rAF + IO** fallback. Never a scroll-event handler writing layout. |
| Motion | Inner media `translateY` from `+6%` to `-6%` of the frame height (capped ±48px) as the frame crosses the viewport, `scale(1.12)` constant on the inner element, `--ease-linear` (scroll-linked). |
| CSS path | `.parallax__media { animation: parallax linear both; animation-timeline: view(); animation-range: cover 0% cover 100%; }` with `@keyframes parallax { from { translate: 0 var(--parallax-max) } to { translate: 0 calc(var(--parallax-max) * -1) } }`, `--parallax-max: min(6cqh, 48px)` on a frame with `container-type: size` (or a JS-set pixel value). Entire rule inside `@media (prefers-reduced-motion: no-preference) and (hover: hover) and (min-width: 1024px)` **and** `:root[data-motion="full"]`. |
| JS fallback | `useParallax(ref, strength = 0.06)`: IO with `rootMargin: "20% 0px"` activates the element; while active, the shared rAF read phase computes `progress = (viewportCenter - frameCenter) / (viewportH/2 + frameH/2)` clamped to [-1, 1]; write phase sets `media.style.transform = translate3d(0, ${-progress * strength * frameH}px, 0) scale(1.12)` (CSSOM, CSP-safe). Values are rounded to 0.5px to avoid sub-pixel shimmer. When the element leaves, the loop stops and the last transform is kept. |
| Reduced motion | Off. Inner media `transform: none; scale: 1` (frame shows the unscaled image, `object-fit: cover`). |
| Touch / mobile | Off in `lite` tier (below 1024px, coarse pointer, `saveData`, ≤ 4 cores, ≤ 4GB memory). |
| Performance | `will-change: transform` only while in the IO-active window (JS path). CSS path needs none. |

### 2.4 Hover Preview

| Aspect | Spec |
| --- | --- |
| Purpose | Show the project's media when the visitor shows intent on a text row, without making the list depend on images (Dennis Snellenberg pattern, adapted). |
| Allowed | Work index rows (`/works`), Home Selected Work list rows (not the feature item, which already shows media), Software page "Related work" list, About "What I make" is **not** allowed (no media). |
| Forbidden | Writing cards, Recognition rows, Services, Pricing, nav, footer, any list without project media. No custom cursor: the system cursor is never hidden or replaced (`cursor` stays `pointer` on the row link). |
| Tier | **CSS** for show/hide states; **rAF** (shared scheduler) for the cursor follow. WAAPI for the swap cross-fade between projects. |
| Trigger | `pointerenter` on a row (pointer type `mouse` or `pen`) → show; `pointerleave` of the list → hide. `:focus-visible` on a row link (and `:focus-within` on the row) → show **anchored**, not following. |
| Structure | One preview element per list: `<div class="hover-preview" aria-hidden="true">` inside the list container (absolute, `pointer-events: none`, `inset-block-start: 0; inset-inline-start: 0`, fixed size `clamp(240px, 22vw, 360px)` wide, 16:10). It contains one `<img>` per row, pre-rendered in SSR with `loading="lazy" decoding="async"` and empty `alt` (the row link carries the name; preview is decorative), or the `ProceduralCover` for `cover: null` placeholders. Active image is chosen with `data-active` on the image, not by swapping `src`. |
| Follow motion | Target = pointer position relative to list, offset `+24px, -50% of preview height`, clamped to the list's box. Current position lerps toward target: `k = 1 - (1 - 0.18) ** (dt / 16.67)` (frame-rate independent; 0.18 per 60fps frame ≈ 150ms settle). Written as `translate3d(x, y, 0)`. |
| Show / hide | Show: `opacity 0 → 1`, `scale(0.96 → 1)`, `--dur-3`, `--ease-weighted`. Hide: `opacity → 0`, `--dur-2`, `--ease-in-quart`. Row-to-row swap: incoming image `opacity 0 → 1` `--dur-2`, outgoing stays until incoming ends (no black gap). Image at rest may be desaturated (`filter` is not animated; it is a fixed class on the preview). |
| Row typography shift | Title `translateX(8px)` and colour secondary → primary, `--dur-2`, `--ease-out-quart`; metadata opacity 0.72 → 1. No size or weight change (no reflow). |
| Focus (keyboard) | Row `:focus-visible` shows the preview **anchored** to the right column of that row (`translate3d` computed from row rect, no lerp), and it tracks focus from row to row. Focus ring stays on the row link (preview never covers it: preview is placed in columns 8–12, rows' focus ring hugs the text). |
| API | `useHoverPreview(listRef): { previewRef, activeId }` where rows are `[data-preview-id]` elements and preview images are `[data-preview-for="<id>"]`. Pure data contract, no props drilled through rows. |
| Reduced motion | Preview still appears on hover/focus (it is information, not decoration), but **anchored** to the row (no follow), `opacity` only at `--dur-1`, no scale, no row `translateX` (colour change only). |
| Touch / mobile | `(hover: none)` or `lite`: the preview element is not rendered (`display: none`); each row renders its own static inline thumbnail (`.project-row__thumb`, 64–96px, lazy) before the metadata, per principle 8 and 11. Tap = navigate (no "first tap previews" pattern). |
| Performance | The follow loop runs only while the pointer is inside the list and stops when the lerp error < 0.25px. Images for the list are decoded on the first `pointerenter` of the list (`img.decode()` for all rows, max 12), never on page load. `will-change: transform, opacity` on the preview only while the pointer is inside the list. |

### 2.5 Magnetic Interaction

| Aspect | Spec |
| --- | --- |
| Purpose | A tactile response on the few elements that carry intent. Signals "this is the action". |
| Allowed (exhaustive) | Header CTA 開始合作 / Start a project; Home hero primary CTA; Home Pricing CTA; Contact band CTA (Home and every page's CTA band); Software page 寄信聯絡 / Email me; the four desktop primary nav links (Work, Services, About, Writing). |
| Forbidden | Everything else: body links, text links with arrows, language switcher, brand link, project rows, filters, form controls, wizard buttons, footer, mobile menu, service detail "Start a commission" (inside a pricing context; stays calm). |
| Tier | **rAF** (shared scheduler) + pointer events. |
| Trigger | `pointermove` within `radius` px of the element's box (pointer type `mouse` only). |
| Motion | Displacement `d = clamp((pointer - center) * strength, ±6px)` on the element, extra `±2px` (0.35 × d) on the inner label span. Follow uses lerp `k = 0.2` per 60fps frame. Release (pointer leaves radius): WAAPI back to 0, `--dur-3`, `--ease-weighted`. Never rotates or scales. |
| API | `useMagnetic(ref, { radius = 48, strength = 0.25 })`. Inner label element is `[data-magnetic-label]`. |
| Keyboard | Focus never moves the element. `:focus-visible` ring is drawn on the element; since translation is ≤ 6px and ring offset is 3px, the ring stays attached. |
| Reduced motion | Off (hook returns before attaching listeners). |
| Touch / mobile | Off for `(pointer: coarse)`, `(hover: none)`, `< 1024px` or `lite`. |
| Performance | Listener on the element's hit region only (a transparent `::before` expanded by `radius` is **not** used, it would steal clicks); instead one `pointermove` listener on the header / band container, active only while the pointer is over that container. Stops when displacement < 0.25px. |

### 2.6 Page Transition

| Aspect | Spec |
| --- | --- |
| Purpose | Home ↔ Work ↔ Project feel spatially connected, using the project title and cover as continuity. |
| Tier | **View Transitions API through React Router** (`<Link viewTransition>` / `<NavLink viewTransition>`, which calls `document.startViewTransition` where supported). No custom router wrapper, no GSAP. Fallback where unsupported: instant navigation (no animation), then the destination's own Text/Scroll Reveal rules apply. |
| Hard cap | **Every view-transition animation ≤ 480ms** (`--dur-4`), total. Principle 7's 600ms ceiling is never approached. React Router starts the transition after loaders resolve and commits the DOM update inside it, so network time is not added to the animation; while loaders run, the old page stays interactive and the progress hairline (below) is the only feedback. |
| Links with `viewTransition` | Primary nav links, brand link, Work index rows, Home Selected Work rows and feature item, Project detail "Next project", "Back to work", Software "Related work" rows, filter links (see 2.9, root cross-fade only). **Not** on: commission links, language switcher (full document reload via `/language/:locale`), external links, `mailto:`, footer legal links, admin. |
| Default (root) | `::view-transition-old(root)`: `opacity 1 → 0`, `--dur-2`, `--ease-in-quart`. `::view-transition-new(root)`: `opacity 0 → 1` + `translateY(12px → 0)`, `--dur-4` (480ms), `--ease-out-expo`, `animation-delay: 0`. |
| Header | `.site-header { view-transition-name: site-header }` so it does not cross-fade; `::view-transition-group(site-header) { animation: none }`. |
| Named elements (continuity) | `vt-project-title`: the title element in the clicked row (Work index / Selected Work / Related work / Next project) ↔ the Project detail `h1`. `vt-project-cover`: the visible cover of the clicked item (feature media, inline thumbnail on touch, or the hover-preview image when it is showing) ↔ the Project detail hero cover. Only **one** element per name may exist at a time, so the names are applied only to the item being navigated. Group animation: `--dur-4`, `--ease-in-out-quint`. `::view-transition-old/new(vt-project-title)` use `mix-blend-mode: normal` and `animation-duration: var(--dur-3)` for the cross-fade inside the morph. |
| How names are applied (CSP-safe) | Do **not** use the documented `style={{ viewTransitionName }}` pattern: it serializes `style="view-transition-name:none"` into SSR HTML, which `style-src 'self'` blocks (F1). Instead the row uses `useViewTransitionState(href)` (or `NavLink`'s `isTransitioning`) to set `data-vt="active"` on the row; CSS: `[data-vt="active"] .project-row__title { view-transition-name: vt-project-title }` and `[data-vt="active"] .project-row__cover { view-transition-name: vt-project-cover }`. On the detail page the `h1` and hero cover carry the names statically via class (`.project-hero__title { view-transition-name: vt-project-title }`), which is fine because the detail page only has one of each. For the hover preview, the active preview image gets `data-vt="active"` via the same state when its row is transitioning. |
| Work → Project | Title morphs from row position/size to `h1` position/size; cover morphs from preview/thumb to hero cover; root cross-fades behind. |
| Project → Work (back) | "Back to work" and browser Back: root cross-fade only (named morph only if the destination row is in the viewport; RR handles the name if that row renders `data-vt="active"`, otherwise browsers just cross-fade). |
| Progress feedback | `useNavigation().state !== "idle"` for more than **150ms** shows a 1px hairline under the header: `transform: scaleX(0 → 0.8)` over 2400ms `--ease-out-quart` (asymptotic, honest "working"), then `scaleX(1)` + `opacity → 0` at `--dur-2` on idle. Never a full-screen loader (brief §25). |
| Reduced motion | Named morphs off: CSS `@media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation: none } ::view-transition-old(root) { animation: vt-fade-out var(--dur-1) linear both } ::view-transition-new(root) { animation: vt-fade-in var(--dur-1) linear both } }` and `data-vt` is never set. Result: 120ms opacity cross-fade only. Progress hairline appears without scale animation (opacity only). |
| Touch / mobile | Same as desktop (the API is cheap), but named `vt-project-cover` is dropped in `lite` when the cover is a procedural `<canvas>`/SVG larger than the viewport (avoids large snapshot textures). Title morph kept. |
| Focus | After navigation, RR's default focus/scroll behaviour is unchanged; the transition must not delay focus. `ScrollRestoration` stays. |

### 2.7 Ambient Motion

| Aspect | Spec |
| --- | --- |
| Purpose | Atmosphere that says "sound × systems" while nothing is being done. |
| Allowed | **Only the Home hero canvas** (§4). Optional second instance: the procedural cover of a placeholder project on the Project detail hero may render the same field as a **static** frame (no loop). |
| Forbidden | Every other surface: section backgrounds, cards, footer, contact band, gradients, grain animation, marquees, pulsing dots, looping icons, text columns. |
| Tier | 2D `<canvas>` + shared rAF. |
| Budget | See §6. |
| Reduced motion | Single static frame. |
| Touch / mobile | `lite` settings in §4.6. |

### 2.8 Audio-Reactive Accent

| Aspect | Spec |
| --- | --- |
| Purpose | Show that audio is playing and let the visuals listen (brief §15), only after the visitor presses play. |
| Allowed | (a) The 32 bars of `.media-waveform` inside `DirectAudioPreview` (every page where it renders: Home showreel, D1 work detail block media). (b) The Home hero canvas amplitude input (§4.4). |
| Forbidden | Anything else responding to audio. No beat-synced page elements, no colour flashing, no autoplay. |
| Tier | **Web Audio `AnalyserNode` + shared rAF**, writes `transform: scaleY()` via CSSOM. |
| Trigger | `coordinator.markPlaying(id)` with an analyser available. Stops on `markPaused`, `stopAll`, tab hidden, or element off screen (bars) / hero off screen (canvas). |
| Bars motion | Each bar `i` (0–31) maps to a log-spaced frequency band between 60Hz and 8kHz from `getByteFrequencyData` (`fftSize: 256`, `smoothingTimeConstant: 0.8`). `scaleY = 0.15 + 0.85 * v_i` with asymmetric smoothing (attack 0.5, release 0.12 per 60fps frame). Update at **30fps** max (every other frame). `transform-origin: bottom`. |
| Pause | Bars settle to their static composed profile (the same shape as the server markup) over `--dur-3`, `--ease-weighted` (WAAPI from current scale to 1). |
| No analyser (embed, non-CORS host) | Bars do not fake a spectrum. Playing state is shown by colour (`--color-accent-audio`) and the play/pause glyph; bars stay static. The hero canvas uses the state-only envelope in §4.4. |
| Reduced motion | Bars never move. Playing state: bar colour → `--color-accent-audio` at `--dur-1`, `aria-pressed="true"`, glyph change. Canvas static frame is redrawn once at playback start and once at pause (level ignored). |
| Touch / mobile | Same as desktop (visible feedback matters on touch), 30fps cap. |
| Seek | The existing player has no seek control; if the page agent adds one, it is a native `<input type="range">` (keyboard accessible) styled over the bars; the progress fill is `transform: scaleX(progress)` on an overlay, updated on `timeupdate` (≈ 4Hz), no transition (it follows real time). |

### 2.9 Filter Change (`/works?category=`)

| Aspect | Spec |
| --- | --- |
| Purpose | Confirm that the list changed without re-running the page's entrance or losing scroll position. |
| Allowed | Work index filter bar and result list only. |
| Tier | **View Transition (root cross-fade) + WAAPI** for row re-entry. |
| Trigger | Filter link navigation (`<NavLink to="?category=ai" viewTransition preventScrollReset>`). Works without JS as plain links (full load, no animation). |
| Motion | Active chip: background/colour to active at `--dur-2`, `--ease-out-quart`; the active underline (`::after`, `transform: scaleX(0 → 1)`, `transform-origin: left`) at `--dur-2`. List: new rows enter with `opacity 0 → 1`, `translateY(8px → 0)`, `--dur-3`, `--ease-out-expo`, stagger 30ms, **max 8 rows** (cap 240ms total), rows 9+ appear at once. No exit animation (old rows vanish inside the root cross-fade, `--dur-2`). The result line (`role="status"`) text swaps instantly (screen readers announce it); it is not animated. |
| API | `data-reveal-group="filter"` on the list with `data-filter-key={category}`; the hook re-runs when the key changes (keyed by `category`, not by the Scroll Reveal "only once" rule). |
| Reduced motion | Chip colour change at `--dur-1`; list swaps instantly; root cross-fade `--dur-1`. |
| Touch / mobile | Same, stagger cap 4 rows. The horizontally scrollable chip strip scrolls the active chip into view with `scrollIntoView({ inline: "nearest", behavior: reduced ? "auto" : "smooth" })` (native, not a library). |

### 2.10 Menu panel (mobile, supporting primitive)

Not in the brief list but specified to replace the current `.site-navigation`
rules. Open: panel `opacity 0 → 1`, `translateY(-8px → 0)`, `--dur-3`,
`--ease-out-quart`; links inside **not** staggered (the menu must be fast,
principle 11). Close: `--dur-2`, `--ease-in-quart`. Reduced motion: instant
(IA §2.4). Menu-button icon (two bars → cross): `transform: translateY/rotate`
at `--dur-2` (rotation allowed here: it is a glyph state change), instant under
reduced motion.

---

## 3. GSAP decision

**No primitive requires GSAP. GSAP is not added.**

| Primitive | Why CSS / WAAPI / IO is sufficient |
| --- | --- |
| Text Reveal | `clip-path` + `transform` keyframes; CSS for the hero, `element.animate()` elsewhere. Stagger = per-element `delay`. |
| Scroll Reveal | IO trigger + `element.animate()`; `animation.finished` promise handles cleanup. |
| Parallax | CSS scroll-driven animations (`animation-timeline: view()`), rAF fallback of ~30 lines. GSAP ScrollTrigger would replace a trivial calculation with ~40KB. |
| Hover Preview / Magnetic | Pointer → lerp → transform is a rAF loop; GSAP's `quickTo` offers nothing a 10-line lerp does not. |
| Page Transition | The View Transitions API does the FLIP snapshotting natively and React Router integrates it; GSAP Flip would duplicate this and fight RR's commit timing. |
| Canvas / audio | Pure 2D canvas math; no tweening library involved. |

Cost avoided: GSAP core ≈ 27KB min+gz, ScrollTrigger ≈ 12KB, Flip ≈ 8KB, on a
Workers-SSR site whose total JS budget should stay small. Revisit only if a
future primitive needs timeline sequencing of more than ~6 interdependent
tweens with scrubbing, which nothing in this redesign does.

---

## 4. Hero canvas system

Component: `app/components/hero/hero-canvas.tsx`. Placed in `.home-hero__stage`,
behind the hero type, `aria-hidden="true"`, `role` none, `pointer-events: none`
(pointer data is read from the hero section, not the canvas, so text stays
selectable and links clickable).

### 4.1 Composition (the static frame is the design)

- A **line field**: `N` horizontal polylines, evenly spaced across the lower
  60% of the hero's height, spanning full hero width. Each line is a sum of
  slow sine waves plus value noise, like a stack of waveform traces or
  spectrogram rows seen edge-on.
- **Envelope over x**: amplitude and alpha are near zero over the text
  columns and grow toward the right: `env(x) = smoothstep(0.30, 0.62, x/W)`
  (desktop, text on columns 1–7). On mobile (text stacked above), the envelope
  is over y instead: the field occupies the bottom 40% of the hero below the
  CTAs, `env = 1` across x with 8% fade at both edges.
- **Alpha**: stroke colour is `--color-text-primary` at alpha
  `0.06 + 0.16 * centerWeight(i)` (centre lines strongest, max **0.22**,
  under the 25% cap of principle 6), multiplied by `env`. Where `env < 0.05`,
  lines are not drawn at all (guarantees nothing behind body text).
- **One accent line**: line `i = floor(N * 0.62)` is drawn in
  `--color-accent` at alpha 0.5 (this is the view's single accent highlight;
  well under 5% of pixels). While audio plays with an analyser it switches to
  `--color-accent-audio`.
- Line width `1` CSS px (`lineWidth = dpr`), `lineJoin = "round"`, no fills,
  no glow, no blur, no gradients on strokes.
- Static frame parameters: `t = 0` with fixed seed `0x4B414D` ("KAM"),
  cursor neutral `(0.5, 0.5)`, scroll `p = 0`, level `0`. The frame must be
  pleasant alone: the lines form a gentle right-weighted swell (a quiet
  waveform crest around x ≈ 0.78W).

### 4.2 Parameters

| Parameter | `full` (≥ 1024px) | `lite` (tablet / mobile / low-end) | `static` |
| --- | --- | --- | --- |
| Lines `N` | 28 | 16 (< 1024px) / 12 (< 480px) | same as viewport tier |
| Sample step along x | 8 CSS px (≈ 180 points at 1440px) | 12 CSS px | same |
| Base amplitude `A` | 14 CSS px | 10 CSS px | same |
| Line spacing | `0.6 * H / N` | same | same |
| DPR | `min(devicePixelRatio, 2)` | `1` (`min(dpr, 1.5)` if cores ≥ 6 and not `saveData`) | `min(dpr, 2)` |
| Frame rate | display rate, work skipped if dt < 14ms (caps at ~60fps on 120Hz) | 30fps cap | 0 (one frame) |
| Cursor response | on | off (coarse pointer) | off |
| Scroll response | on | on | off |
| Audio response | on | on | off |

Canvas backing size = `round(cssW * dpr) × round(cssH * dpr)`, set in a
`ResizeObserver` callback (debounced to the next rAF). Never resize the canvas
inside the draw loop.

### 4.3 Function of time

For line `i` (0…N-1), sample `x` (CSS px), time `t` (seconds, accumulated from
frame dt so pausing does not jump):

```
u        = x / W                                   // 0..1
phase_i  = seed-derived random in [0, 2π)
k_i      = 0.8 + 0.4 * rand_i                      // per-line spatial frequency jitter
wave(u,t)= 0.5 * sin(2π(1.6 k_i u + 0.031 t) + phase_i)
         + 0.3 * sin(2π(3.1 k_i u - 0.047 t) + 1.7 phase_i)
         + 0.2 * noise1D(u * 4 + i * 0.37, t * 0.061)   // value noise, [-1, 1]
y_i(x,t) = baseY_i
         + A * gain * env(u) * wave(u,t)
         + cursorBump_i(u)
```

Temporal frequencies 0.031 / 0.047 / 0.061 Hz keep the **maximum idle vertex
velocity ≈ 2π · A · Σ(w·f) ≈ 3.7px/s** (desktop), i.e. motion on a time base of
tens of seconds, never frames.

### 4.4 Modulators

**Cursor** (`full` only). Pointer position over the hero section, normalized
`cx, cy ∈ [0, 1]`. Smoothed with frame-rate-independent lerp,
`k = 1 - (1 - 0.06) ** (dt / 16.67)` (≈ 0.06 per 60fps frame, ~0.8s settle:
inertial, never twitchy). When the pointer leaves the hero, target returns to
`(0.5, 0.5)`.

```
d          = u - cx_s
bumpX      = exp(-(d*d) / (2 * 0.12^2))            // gaussian, σ = 12% of width
dy         = baseY_i/H - cy_s
bumpY      = exp(-(dy*dy) / (2 * 0.18^2))
cursorBump_i(u) = sign(baseY_i/H - cy_s) * 18px * bumpX * bumpY * env(u)
```

Lines part around the cursor by at most **18px**, only where the field is
visible (`env`). Cursor never affects the text area.

**Scroll** progress `p = clamp(-heroRect.top / heroRect.height, 0, 1)` read in
the rAF read phase. Effects: `gain *= 1 - 0.6p` (field calms as you leave),
spacing `*= 1 - 0.35p` (lines converge toward the centre line, like a signal
narrowing), global alpha `*= 1 - 0.5p`. Scroll changes are applied directly
(no lerp); they are already continuous.

**Audio level** `L ∈ [0, 1]`:

- Source: `AnalyserNode` on the playing `HTMLAudioElement` (F2), exposed by the
  `PlaybackCoordinator` (see 4.5). `fftSize = 1024`,
  `smoothingTimeConstant = 0.8` (for the frequency data used by the bars).
- Per frame: RMS of `getFloatTimeDomainData` → `rms`; `level = clamp((20·log10(rms) + 48) / 36, 0, 1)` (maps −48…−12 dBFS to 0…1).
- Envelope follower (frame-rate independent): attack `a = 0.35`, release
  `r = 0.06` per 60fps frame: `L += (level - L) * (level > L ? a : r)`.
- Low band `B` (bins covering 40–250Hz, mean of `getByteFrequencyData` / 255,
  same follower) drives a subtle crest.
- Application: `gain = 1 + 1.2 * L` (capped at **2.2**), and the temporal
  frequency terms get `+ 0.25 * B` added to `t` progression (the field breathes
  faster with the bass, still ≤ ~12px/s vertex speed at full level).
- **State-only fallback** (embed, non-CORS host, analyser unavailable): when
  `coordinator` reports "playing" without an analyser, `gain` ramps to `1.35`
  over 1.2s and back to `1` over 1.2s on pause. No pseudo-beat, no fake
  spectrum.
- When nothing is playing, `L` decays to 0 by the release rule, then audio
  sampling stops (no analyser reads while idle).

### 4.5 Amplitude plumbing (extends the existing PlaybackCoordinator)

Add to `app/lib/media/playback-coordinator.ts` (framework-free, unit-testable):

```ts
type LevelSource = { analyser: AnalyserNode | null; playing: boolean };
setLevelSource(id: string, source: LevelSource | null): void;
subscribeLevel(listener: (s: LevelSource | null) => void): () => void;
```

`DirectAudioPreview.startStream()` (already a user-gesture handler):

1. If `isCorsAudioHost(item.url)` (allowlist: `raw.githubusercontent.com` plus
   the configured `r2Hosts` **that have a CORS policy**, flagged in config;
   same-origin always allowed): set `instance.crossOrigin = "anonymous"`
   **before** `instance.src`.
2. Lazily create one `AudioContext` per page (module singleton in
   `app/lib/motion/audio-level.ts`), `resume()` inside the click handler,
   `createMediaElementSource(instance) → analyser → destination`.
3. `coordinator.setLevelSource(item.id, { analyser, playing: true })` on
   `play`; `{ analyser, playing: false }` on `pause`; `null` on dispose.
4. Non-allowlisted hosts: no `crossOrigin`, no Web Audio routing (it would
   silence the element), `setLevelSource(id, { analyser: null, playing })`.
5. If the CORS load fails (`onerror` after setting `crossOrigin`), the existing
   `showFallback` path runs; the fallback `<audio>` element is never routed
   through Web Audio.

`AudioContext` is never created before a click, so no autoplay warnings and
no work on page load.

### 4.6 Frame budget and degradation

- **Target: ≤ 4ms per frame of main-thread work** (JS math + canvas commands)
  on a mid laptop (4-core, integrated GPU, 1440×900, DPR 2), measured as the
  duration of the canvas rAF callback in a Performance trace. `lite`: ≤ 4ms
  at 30fps on a Pixel 7-class phone.
- Cost model at `full`: 28 lines × 180 samples = 5,040 points, 2 `sin` + 1
  noise lookup each (~15k ops) plus 4 `stroke()` calls → ~1–2ms expected.
- Draw batching: lines are grouped into 4 alpha buckets; each bucket is one
  `beginPath()` / many `moveTo/lineTo` / one `stroke()`. Accent line is its own
  path. `ctx.clearRect` whole canvas each frame; no shadow, no filter, no
  `globalCompositeOperation` changes.
- Noise: a precomputed 256-entry value table with smoothstep interpolation
  (no Perlin library).
- Typed arrays: per-line `Float32Array` for baseY/phase/k allocated on resize,
  no allocation inside the loop.
- **Self-throttle**: keep an EMA of callback time. If EMA > 6ms for 60
  consecutive frames → drop to `lite` parameters (N and DPR) for the session.
  If still > 6ms → stop the loop and keep the last frame (static).

### 4.7 Lifecycle

1. **SSR**: renders `<canvas class="hero-canvas" width="0" height="0" aria-hidden="true">`
   inside a wrapper whose CSS background is a very low-contrast tonal gradient
   (`--color-bg-0` → `--color-bg-1`, no blobs). No `style` attribute. Without
   JS the hero is complete (type + CTAs + tonal background).
2. **Mount (`useEffect`)**: read tier; size the canvas; seed; **draw the static
   frame synchronously** (so the first painted client frame already has the
   field). If tier is `static`, stop here (redraw only on resize and on
   playback start/pause).
3. **Loop start** only when all hold: hero intersecting (IO `threshold: 0`),
   `document.visibilityState === "visible"`, tier ≠ `static`.
4. **Loop stop** on leaving viewport, tab hidden, tier change to `static`
   (reduced-motion toggled at runtime → redraw static frame at `t = 0`).
5. **Unmount**: cancel rAF, disconnect IO/ResizeObserver, unsubscribe
   coordinator, release the 2D context reference.

### 4.8 Draw loop skeleton

```ts
// app/components/hero/hero-canvas.tsx (client-only effect body)
const state = {
  t: 0, last: 0, cx: 0.5, cy: 0.5, tx: 0.5, ty: 0.5,
  p: 0, L: 0, B: 0, gainState: 1, running: false, emaMs: 0,
};

function frame(now: number) {
  if (!state.running) return;
  const dt = Math.min(now - state.last, 64);           // clamp after stalls
  if (tier === "lite" && dt < 32) return schedule(frame); // 30fps cap
  if (dt < 14) return schedule(frame);                  // ~60fps cap on 120Hz
  state.last = now;
  const t0 = performance.now();

  // read phase (batched by the shared scheduler)
  state.p = scrollProgress(heroEl);                     // uses cached rect from read phase

  // update
  const f = dt / 16.667;
  const kc = 1 - Math.pow(1 - 0.06, f);
  state.cx += (state.tx - state.cx) * kc;
  state.cy += (state.ty - state.cy) * kc;
  const src = levelSource;                              // from coordinator subscription
  const lvl = src?.analyser && src.playing ? readLevel(src.analyser) : 0;
  const a = lvl > state.L ? 1 - Math.pow(1 - 0.35, f) : 1 - Math.pow(1 - 0.06, f);
  state.L += (lvl - state.L) * a;
  const targetGain = src?.playing && !src.analyser ? 1.35 : 1 + 1.2 * state.L;
  state.gainState += (Math.min(targetGain, 2.2) - state.gainState) * (1 - Math.pow(1 - 0.03, f));
  state.t += (dt / 1000) * (1 + 0.25 * state.B);

  // draw
  draw(ctx, geometry, {
    t: state.t, cx: state.cx, cy: state.cy, p: state.p,
    gain: state.gainState * (1 - 0.6 * state.p),
  });

  const ms = performance.now() - t0;
  state.emaMs = state.emaMs * 0.95 + ms * 0.05;
  if (state.emaMs > 6) degrade();                       // after 60 consecutive frames
  schedule(frame);
}

function draw(ctx, g, s) {
  ctx.clearRect(0, 0, g.w, g.h);
  for (const bucket of g.buckets) {                     // 4 alpha buckets
    ctx.beginPath();
    ctx.strokeStyle = bucket.color;                     // precomputed rgba string
    for (const i of bucket.lines) {
      const base = g.baseY[i] * (1 - 0.35 * s.p) + g.centerY * 0.35 * s.p;
      let started = false;
      for (let x = g.x0[i]; x <= g.x1[i]; x += g.step) {  // x0/x1 skip env < 0.05
        const u = x / g.cssW;
        const e = g.env(u);
        const y = base
          + g.A * s.gain * e * wave(u, s.t, g.k[i], g.phase[i], i)
          + cursorBump(u, base / g.cssH, s.cx, s.cy, e);
        started ? ctx.lineTo(x * g.dpr, y * g.dpr) : (ctx.moveTo(x * g.dpr, y * g.dpr), started = true);
      }
    }
    ctx.stroke();
  }
  drawAccentLine(ctx, g, s);
}
```

`schedule` is the shared scheduler in `app/lib/motion/frame.ts`; `readLevel`
lives in `app/lib/motion/audio-level.ts` and reuses one preallocated
`Float32Array`.

---

## 5. Micro-interaction state table

Global rules: no state changes `width`, `height`, `padding`, `margin`,
`border-width`, `font-size`, `font-weight` or `letter-spacing` (no reflow).
Borders that appear on hover exist at rest as transparent. Focus ring:
`outline: 2px solid var(--color-accent); outline-offset: 3px` (≥ 3:1), shown
on `:focus-visible` only, appears at `--dur-1` opacity via `outline-color`
transition from transparent. Under reduced motion every `transform` column
below becomes "none"; colour/opacity changes remain at `--dur-1`.

| Component | Idle | Hover | Pressed | Focus-visible | Disabled | Duration / easing |
| --- | --- | --- | --- | --- | --- | --- |
| Primary nav link (desktop) | `--color-text-secondary`; underline `::after` `scaleX(0)` | text → primary; underline `scaleX(1)` from left; magnetic (2.5) | text primary, underline stays, no scale | ring + underline `scaleX(1)` | n/a | colour `--dur-1` out-quart; underline `--dur-2` out-quart |
| Nav link, current (`aria-current`) | primary text, underline `scaleX(1)` in accent | unchanged | — | ring | — | — |
| Primary CTA (Start a project, Email me) | solid `--color-accent` bg, dark text | bg lightens one step (colour), label `translateX(2px)`, magnetic (2.5) | `scale(0.98)` | ring (offset 3px, second 1px inner ring in `--color-bg-0` for contrast on accent) | n/a (never disabled) | bg `--dur-1`; transform `--dur-2` out-quart; pressed `--dur-1` |
| Ghost / secondary button (View work, Load preview, wizard back) | transparent bg, 1px `--color-rule` border | border → `--color-text-secondary`, bg → `--color-bg-2` | `scale(0.98)` | ring | 40% opacity, `cursor: not-allowed`, no hover | `--dur-1` colour; `--dur-1` pressed |
| Text link with arrow (All work →, More about me →) | secondary text, arrow at 0 | text → primary; arrow `translateX(4px)`; underline `scaleX(1)` | text primary, arrow returns to `translateX(2px)` | ring; arrow `translateX(4px)` | n/a | colour `--dur-1`; arrow/underline `--dur-2` out-quart |
| External link `↗` | as above | arrow `translate(2px, -2px)` | — | ring + arrow shift | — | `--dur-2` |
| Project row (Work index, Selected Work) | metadata row at 72% opacity, title secondary, bg transparent, hairline below | title primary + `translateX(8px)`; metadata 100%; row bg → `--color-bg-1`; hover preview shows (2.4) | title `translateX(6px)`, bg `--color-bg-2` | ring around the row link; same as hover **including preview (anchored)** | n/a | bg/colour `--dur-2` out-quart; title `--dur-2` out-quart |
| Thumbnail / feature media | desaturated class, `scale(1)` inside `overflow: clip` frame | full colour (opacity cross-fade between two stacked layers, not `filter` animation), inner media `scale(1.03)` | — | same as hover (via row `:focus-within`) | — | colour layer `--dur-3` weighted; scale `--dur-4` weighted |
| Filter chip (link) | mono label secondary, count muted, underline `scaleX(0)` | label primary | — | ring | n/a | `--dur-2` out-quart |
| Filter chip, active (`aria-current`) | label primary, accent underline `scaleX(1)` | unchanged | — | ring | — | underline `--dur-2` |
| Price display (Pricing preview rows, `ServicePrice`, `ServiceOverview`) | static figure | **no motion on the price itself**; the containing row link (if any) behaves like a project row minus preview (bg `--color-bg-1`, arrow nudge) | — | ring on the row link | — | `--dur-2` |
| Contact band (CTA band) | `--color-bg-1` band, heading static | band itself does not react; its CTA is the magnetic primary CTA; secondary email link = text link | — | — | — | — |
| Social / footer link | secondary text | primary text, underline `scaleX(1)` | — | ring | — | colour `--dur-1`; underline `--dur-2` |
| Footer accordion `summary` (mobile) | secondary label, chevron 0° | label primary | — | ring | — | chevron `rotate(180deg)` on `[open]` at `--dur-2`; content no height animation |
| Language switcher | mono `中文 / EN`, current locale primary, other secondary | other locale → primary | — | ring | — | `--dur-1` |
| Menu button (mobile) | two bars | bars `--color-text-primary` | — | ring | — | icon morph `--dur-2` out-quart (instant reduced) |
| Audio play button | 44×44, `▶` glyph, 1px rule border | border → secondary, bg `--color-bg-2` | `scale(0.96)` | ring | `loading`: glyph replaced by 3 static dots, 60% opacity, `aria-busy` (no spinner rotation) | `--dur-1`; pressed `--dur-1` |
| Audio play button, playing (`aria-pressed=true`) | `Ⅱ` glyph, border `--color-accent-audio` | — | `scale(0.96)` | ring | — | colour `--dur-1` |
| Waveform bars / seek | static composed profile, muted | (if seek added) hover shows a 1px playhead preview line at pointer x, `opacity` only | — | range input ring around the bar area; arrow keys seek 5s | disabled when no media | playhead `--dur-1`; bars see 2.8 |
| Form field (wizard, admin untouched) | `--color-bg-1` fill, 1px bottom rule `--color-rule` | rule → `--color-text-secondary` | — | rule → accent (2px, pre-reserved via `box-shadow: inset 0 -1px` so height is constant) + ring | 40% opacity, no hover | `--dur-1` out-quart |
| Field error | rule → error colour, message appears | — | — | — | — | message `opacity` `--dur-2` (no slide) |
| Choice card (`ServiceChoice`, `/commission` choices) | `--color-bg-1`, hairline border transparent | bg → `--color-bg-2`; arrow `translateX(4px)`; label primary | `scale(0.99)` on the link surface | ring on the link; same visual as hover | n/a | `--dur-2` out-quart; pressed `--dur-1` |
| Stepper (commission steps list) | future steps muted, done steps secondary with check, current step primary + accent bar | not interactive (no hover) | — | if steps become links: ring | future steps not focusable | current-step bar `transform: scaleX(0 → 1)` `--dur-3` out-quart on step change; colour `--dur-1` |

---

## 6. Ambient motion budget

What may move while a visitor reads: **almost nothing**.

| Rule | Limit |
| --- | --- |
| Continuous elements per viewport | **At most one**, and only the Home hero canvas. When the hero leaves the viewport its loop stops; every other viewport of every page is motionless at rest. |
| Hero field idle speed | Max vertex velocity ≈ **4px/s** at idle (§4.3), ≤ 12px/s at full audio level. Only inside the field envelope (right columns / bottom band), never behind text. |
| Any other ambient element (if ever proposed) | ≤ **0.5px/s** equivalent drift **or** opacity change ≤ **2% per second**, max amplitude 4px / 5% opacity, never inside a text column (the grid spans that hold headings, paragraphs, metadata rows or form fields) and never within 48px of one. None are specified by this document. |
| Audio visualisation | Allowed only while audio is playing, only inside the player (bars) and the hero field; stops on pause. |
| Loops | No CSS `infinite` animation anywhere in the public site. (Stylelint-able rule: grep for `infinite` in `app/styles` must return 0 matches outside admin.) |
| After interaction | Every hover/magnetic/preview effect settles to rest within `--dur-4` after the pointer stops. |

---

## 7. Reduced motion and accessibility matrix

`RM` = `prefers-reduced-motion: reduce`. "Keyboard" = keyboard focus with
`:focus-visible`. "Touch" = `(hover: none)` / coarse pointer.

| Primitive | Default (fine pointer, no RM) | RM | Keyboard | Touch |
| --- | --- | --- | --- | --- |
| Text Reveal | Mask + 24px rise, `--dur-5` | Static, fully visible | Content visible without reveal; focus into an armed block forces end state | Same as default, `lite` duration/travel |
| Scroll Reveal | IO, 24/16px rise, stagger ≤ 6 | Never armed; static | `:focus-within` on armed element forces end state immediately | `lite`: halved travel, `--dur-4`, stagger ≤ 4 |
| Project Media Parallax | ±6% (≤ 48px) scroll-linked | Off, media unscaled | Unaffected (no focusable parts) | Off |
| Hover Preview | Cursor-following preview, row shift | Anchored preview, opacity only, no row shift | Preview on `:focus-visible` / `:focus-within`, anchored to the row; row styles identical to hover | Preview element not rendered; inline static thumbnail per row; tap navigates |
| Magnetic Interaction | ≤ 6px pull on 6 allowed targets | Off | Never moves on focus; ring only | Off |
| Page Transition | Root cross-fade + title/cover morph, ≤ 480ms | Root opacity cross-fade 120ms, no morph | Same as default/RM; focus handling by RR unchanged | Same as default (cover morph dropped for large procedural covers in `lite`) |
| Ambient (hero canvas) | Loop while visible, cursor + scroll + audio | Single static frame (redrawn on resize/playback state only) | No focusable parts; `aria-hidden` | `lite` density/DPR, 30fps, no cursor |
| Audio-Reactive Accent | Bars from analyser at 30fps; hero gain | Bars static; playing state via colour + glyph + `aria-pressed` | Play button is a `<button>` with `aria-label` "Play <title>" (unchanged); seek (if added) is a native range input | Same as default |
| Filter Change | Root cross-fade + row re-entry, stagger ≤ 8 | Instant swap, 120ms cross-fade, chip colour only | Filters are links in a `<nav>`; focus stays on the activated link after navigation (`preventScrollReset`, RR restores focus target) and the `role="status"` result line announces the count | Chip strip scrolls active chip into view (`behavior: auto` under RM) |
| Menu panel | 320ms fade + 8px drop | Instant | Escape closes, focus returns to button (IA §2.4) | Same as default |
| Micro-interactions | Colour + small transforms | Colour/opacity only at `--dur-1` | `:focus-visible` states mirror hover everywhere | Hover states suppressed with `@media (hover: hover)` gates so taps don't leave sticky hover; `:active` pressed state kept |

Non-negotiables:

- All hover-revealed information (preview media, row emphasis, arrow
  affordances) also appears on `:focus-visible` / `:focus-within`.
- Hover styles are declared inside `@media (hover: hover)` to avoid sticky
  hover on touch.
- No motion hides content from assistive tech: armed elements use `opacity`,
  never `display: none` / `visibility: hidden`, so they stay in the
  accessibility tree and in find-in-page (IO reveals on scroll-to-match).
- Nothing flashes more than 3 times per second (WCAG 2.3.1); audio bars are
  capped at 30fps and smoothed, colour never flashes.
- Motion never blocks input: no pointer-events lock during transitions (the
  View Transition overlay is non-interactive for ≤ 480ms by browser design;
  that is the only exception).

---

## 8. File plan

Every module is SSR-safe: **no access to `window`, `document`, `navigator`,
`matchMedia`, `IntersectionObserver`, `AudioContext` or `requestAnimationFrame`
at import time or during render**. All such access happens inside
`useEffect` / `useLayoutEffect`-free effects (use `useEffect`; the static
server markup is already the correct first paint) or inside event handlers.
Hooks return inert values on the server. No component renders a `style` prop
into SSR output (F1); runtime values go through the CSSOM in effects.

| File | Action | Contents | SSR safety |
| --- | --- | --- | --- |
| `app/styles/tokens.css` | edit (foundation agent) | Replace `--motion-fast/normal/panel` with `--dur-1…5`, `--stagger`, `--stagger-line`, and the six `--ease-*` custom properties from §1. | CSS only. |
| `app/styles/motion.css` | **rewrite** | Classes/selectors below. All transform rules inside `@media (prefers-reduced-motion: no-preference)`; parallax additionally gated by `(hover: hover) and (min-width: 1024px)` and `:root[data-motion="full"]`; hover rules inside `@media (hover: hover)`. | CSS only; works with `style-src 'self'` (external stylesheet). |
| `app/lib/motion/tokens.ts` | new | `export const DUR = { d1: 120, d2: 200, d3: 320, d4: 480, d5: 720 } as const; export const STAGGER = 60; STAGGER_LINE = 80; export const EASE = { outQuart: "cubic-bezier(0.25, 1, 0.5, 1)", … }; export const EASE_FN = { outExpo: (t) => … }` (JS easing functions for canvas/rAF lerps), `export const CAPS = { revealBlock: 24, revealText: 16, filter: 8, parallax: 0.06, parallaxMaxPx: 48, magneticPx: 6, magneticLabelPx: 2, rowShift: 8 }`, `MAX_STAGGER_CHILDREN = 6`, `PAGE_TRANSITION_MAX = 480`. A unit test asserts these equal the CSS custom properties (parse `tokens.css`). | Pure constants. |
| `app/lib/motion/reduced-motion.ts` | new | `subscribeReducedMotion(cb)`, `getReducedMotionSnapshot()`, `getServerSnapshot = () => true`, `useReducedMotion()` via `useSyncExternalStore`; `getMotionTier(): "static" \| "lite" \| "full"` with the heuristics of §2.0 (feature-checked: `"connection" in navigator`, `"deviceMemory" in navigator`); `useMotionTier()`; `<MotionTierSync />` component (effect sets `documentElement.dataset.motion`, listens to the three media queries). | All browser APIs inside functions guarded by `typeof window !== "undefined"`; server snapshot is `"static"` / `true`. |
| `app/lib/motion/frame.ts` | new | Shared rAF scheduler: `scheduleRead(fn)`, `scheduleWrite(fn)`, `loop(fn): () => void` (auto-pauses on `visibilitychange`). | Lazily touches `requestAnimationFrame` on first call. |
| `app/lib/motion/observe.ts` | new | Shared `IntersectionObserver` registry keyed by options (`reveal`, `parallax`, `canvas`); `observe(el, opts, cb): () => void`. | Lazy; no-op if `IntersectionObserver` is undefined. |
| `app/lib/motion/use-reveal.ts` | new | `useReveal(ref, { variant, delay, group })` and `revealScan(root)` used by `<RevealRoot />` (arm logic, WAAPI animate, stagger caps, unobserve, `data-reveal-state`). Re-runs `revealScan(document.body)` after each navigation (subscribe to `useLocation().key`). | Effect-only. |
| `app/lib/motion/use-parallax.ts` | new | `useParallax(ref, strength = 0.06)`: returns early if tier ≠ `full` or CSS scroll-driven animations are supported (CSS path handles it); otherwise IO + rAF fallback. | Effect-only. |
| `app/lib/motion/use-magnetic.ts` | new | `useMagnetic(ref, { radius = 48, strength = 0.25 })`: tier `full` + `(pointer: fine)` only; container-scoped `pointermove`; lerp; WAAPI release. | Effect-only. |
| `app/lib/motion/use-hover-preview.ts` | new | `useHoverPreview(listRef): { previewRef }` with `[data-preview-id]` / `[data-preview-for]` contract, follow lerp, focus anchoring, decode-on-first-enter, `data-vt` for the active preview image. | Effect-only; SSR renders all preview images inert (`data-active` absent). |
| `app/lib/motion/use-view-transition-flag.ts` | new | `useVtFlag(href): "active" \| undefined` wrapping RR's `useViewTransitionState(href)` and returning `undefined` under reduced motion; used as `data-vt={useVtFlag(href)}`. | `useViewTransitionState` is SSR-safe (false on server). |
| `app/lib/motion/audio-level.ts` | new | Singleton `getAudioContext()` (created on first call from a click handler), `attachAnalyser(audio: HTMLAudioElement): AnalyserNode`, `isCorsAudioHost(url, corsHosts)`, `readLevel(analyser)` / `readBands(analyser, 32)` with preallocated buffers and the follower math of §4.4. | Only called from event handlers/effects. |
| `app/lib/media/playback-coordinator.ts` | edit | Add `setLevelSource` / `subscribeLevel` (§4.5). Unit test: subscribe/unsubscribe, cleared on `stopAll`. | Framework-free. |
| `app/components/media/direct-audio-preview.tsx` | edit | CORS-gated `crossOrigin`, analyser attach in `startStream`, level-source updates on play/pause/dispose, bar animation (30fps, WAAPI settle on pause). | Changes live in handlers/effects only. |
| `app/components/motion/reveal-root.tsx` | new | `<RevealRoot />` mounted once in `root.tsx` next to `<MotionTierSync />`; renders `null`. | Effect-only. |
| `app/components/motion/navigation-progress.tsx` | new | Header hairline driven by `useNavigation()` (150ms show delay). | Renders static markup; `data-state` attribute only. |
| `app/components/hero/hero-canvas.tsx` | new | The canvas system of §4 (`draw`, `wave`, `noise`, geometry builder exported for unit tests of the static frame's determinism, e.g. same seed → same first-line points). | SSR renders `<canvas width="0" height="0">`; all work in `useEffect`. |

### 8.1 `motion.css` class list (rewrite)

- `:root[data-motion]` hooks (`static` / `lite` / `full`).
- Reveal: `[data-reveal]`, `[data-reveal-state="armed"]` (with `--reveal-y: 24px | 16px`), `[data-reveal="mask"][data-reveal-state="armed"]` (clip-path), `[data-reveal-state="armed"]:focus-within`, `@media print` override.
- Hero intro: `.hero-intro .hero-intro__item`, `[data-intro-step="0"…"5"]` → `animation-delay` mapping, `@keyframes hero-mask-in`, `@keyframes hero-rise-in`.
- Parallax: `.parallax`, `.parallax__media`, `@keyframes parallax` with `animation-timeline: view()` inside `@supports (animation-timeline: view())`.
- Hover preview: `.hover-preview`, `.hover-preview[data-visible]`, `.hover-preview__item`, `.hover-preview__item[data-active]`, `.project-row`, `.project-row__title`, `.project-row__meta`, `.project-row__thumb` (touch only), `@media (hover: none)` swap.
- Magnetic: `[data-magnetic]`, `[data-magnetic-label]` (no static transform; JS-driven).
- View transitions: `.site-header { view-transition-name: site-header }`, `[data-vt="active"] .project-row__title`, `[data-vt="active"] .project-row__cover`, `.project-hero__title`, `.project-hero__cover`, `::view-transition-old(root)`, `::view-transition-new(root)`, `::view-transition-group(vt-project-title|vt-project-cover)`, `@keyframes vt-fade-out`, `vt-fade-in`, `vt-rise-in`, reduced-motion overrides.
- Navigation progress: `.nav-progress`, `.nav-progress[data-state="loading"]`, `[data-state="done"]`.
- Filter: `.filter-chip`, `.filter-chip[aria-current="page"]::after`, `[data-reveal-group="filter"]`.
- Micro-interactions (§5): `.link-underline::after`, `.link-arrow__icon`, `.button`, `.button--primary`, `.button--ghost`, `.choice-card`, `.stepper__bar`, `.media-waveform span` (`transform-origin: bottom`), `.direct-audio[data-player-state="playing"]`.
- Menu: `.site-navigation[data-open]` panel rules, `.site-header__menu-button` icon morph.
- Canvas: `.hero-canvas` (position/size only; `pointer-events: none`).
- Reduced-motion block: removes every transform/animation above, keeps opacity/colour transitions at `--dur-1`, `scroll-behavior: auto`.

### 8.2 Acceptance checks for the implementing agents

1. Reduced-motion screenshot of every public route equals the no-JS
   screenshot composition (nothing hidden, nothing offset).
2. `grep -n 'style=' ` on SSR HTML of `/en`, `/en/works`, `/en/works/<slug>`
   returns no motion-related inline styles; the browser console shows no CSP
   `style-src` violations.
3. Performance trace (1440×900, 4× CPU throttle off, DPR 2): hero canvas rAF
   callback ≤ 4ms p95; no layout shift from hover (CLS 0 during hover sweep of
   the Work list).
4. Page transition Work → Project: longest `::view-transition-*` animation
   ≤ 480ms (inspect in DevTools Animations panel).
5. No `infinite` animation in public CSS; no `requestAnimationFrame` callbacks
   running when the hero is scrolled out of view and no audio plays
   (Performance panel idle for 5s shows no rAF).
6. Keyboard-only pass on `/en/works`: every row shows its preview on focus;
   focus ring always visible and not covered by the preview.
7. Axe (existing suite) passes on `/en`, `/en/works`, `/en/services/software`,
   `/en/about`.
