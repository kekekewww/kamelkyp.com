# Kamel Portfolio — Content Studio / Admin CMS (brief as supplied, 2026-09-24)

Requirements recorded from Kevin's brief. Repo-specific decisions live in
`docs/content-architecture.md`, `docs/admin-architecture.md` and
`docs/content-schema.md`, which win where they are more specific.

## Brand (overrides the 2026-09-23 redesign decision)

- The only public identity is **Kamel**. Canonical value: `brandName: "Kamel"`.
- Remove every public-facing personal-name variant (楊子賢, Kevin Yang, Kevin, etc.) from:
  hero, navigation, About, footer, SEO titles, OpenGraph, structured data (JSON-LD),
  social previews, author fields, contact pages, project attribution, metadata,
  accessibility labels, placeholder content, configuration, content seed files,
  public email templates, favicon metadata.
- Do not introduce alternative personal names anywhere.
- The admin shows `KAMEL CONTENT STUDIO` or `KAMEL STUDIO`.

## 1. Goal

A private Content Studio so Kamel manages almost all portfolio content without code:
create, edit, delete, draft, publish, unpublish, reorder, feature, archive. The public site
reads content dynamically; content no longer lives in hard-coded React components.

## 2. Admin design language

Same product as the public site: cold dark palette, industrial precision, strong type,
restrained borders, geometric spacing, editorial hierarchy, subtle motion, quality
micro-interactions. Prioritise usability: higher density, less ambient/decorative motion,
visible controls, clear states, fast navigation, strong keyboard use.
"Kamel Portfolio × Creative Studio Tool × Professional CMS". Not a Bootstrap dashboard,
not a SaaS analytics dashboard, no excessive cards, no unrelated component-library look.

## 3. Routing

Prefer `/studio` (else `/admin`): `/studio`, `/studio/projects`, `/studio/projects/new`,
`/studio/projects/[id]`, `/studio/music`, `/studio/recognition`, `/studio/writing`,
`/studio/services`, `/studio/social`, `/studio/media`, `/studio/settings`.
Never linked from public navigation.

## 4. Authentication

Single role: Owner. Secure login, persistent session, logout, protected server-side
routes, unauthorized → login, API authorization, no client-only security, no secrets
in the frontend. Reuse an existing secure auth backend if present; otherwise the simplest
maintainable solution for the stack.

## 5. Content models

Projects, Music, Recognition, Writing, Services, Social Links, Media, Brand Settings,
Site Settings.

## 6. Projects

Actions: create, edit, duplicate, draft, publish, archive, delete, feature on homepage,
reorder featured, preview.
Fields: title, slug, year, status, category, categories, role, shortDescription,
description, tools, technologies, coverImage, coverVideo, gallery, featured,
featuredOrder, projectOrder, links, credits, context, problem, approach, process,
architecture, result, reflection, createdAt, updatedAt, publishedAt.

## 7. Categories

Not a rigid hard-coded set. Start: Software, AI, Interactive, Creative Technology, Music,
Mixing, Research. Future categories addable without redesigning the database.
Many-to-many (a project may have several).

## 8. Project editor UX

Grouped sections: BASIC, MEDIA, CLASSIFICATION, CASE STUDY, LINKS, CREDITS, PUBLICATION.
Collapsible or clearly grouped; important fields easy to reach. Live or near-live preview
where practical (Editor | Preview split on desktop; not required on mobile).

## 9. Music

Own model, may reference a Project. Fields: title, artist, year, role, credits, genre,
description, artwork, audioPreview, fullAudio, duration, spotifyUrl, youtubeUrl,
soundcloudUrl, otherLinks, featured, showreel, publishStatus, order.
Exactly one active Homepage Showreel at a time. Never autoplay.

## 10. Audio media

Uploads or external URLs. Storage host (e.g. media.kamelkyp.com) configurable, never
hard-coded in components; centralized media/asset layer. Only enable Web Audio analysis
when cross-origin config is compatible. Upload UI shows filename, duration, size,
preview playback, usage references.

## 11. Recognition

Fields: year, date, type, organization, event, result, description, url, image,
featured, order, status. Types: Award, Publication, Speaking, Event, Competition,
Research; extensible. Frontend decides visual grouping.

## 12. Writing

Fields: date, title, slug, excerpt, content, category, platform, externalUrl, cover,
featured, status, order. Platforms: Internal, Threads, Instagram, Medium, Devpost, Other.
Internal article OR external link; externalUrl without internal content → card links out.
No embedded social feeds.

## 13–14. Services

Fields: name, slug, category, shortDescription, description, priceMode, price,
startingPrice, currency, turnaround, revisions, deliverables, requirements, process, faq,
featured, status, order. Price modes: Fixed, Starting From, Custom Quote, Contact;
numeric price never required. Groups: Mixing, Music Production, Software Development,
Creative Technology, Interactive Experiences. Never invent pricing; sample pricing does
not become production content unless explicitly confirmed.

## 15. Social links

platform, label, url, username, icon, enabled, order. Any number of platforms
(Threads, Instagram, GitHub, YouTube, Spotify, SoundCloud, LinkedIn, Devpost, Email,
Other). Only enabled entries appear publicly.

## 16. Brand settings

brandName, shortBio, longBio, tagline, roles, locationDisplay, availability,
contactEmail, heroStatement, heroSubtext, primaryCTA, secondaryCTA, portrait, logo,
favicon, brandAssets. Public identity uses Kamel; no obsolete personal-name values.

## 17. Site settings

siteTitle, siteDescription, SEO description, OpenGraph image, default social image,
contact email, navigation, footer message, copyright, availability status, homepage
section visibility, featured project count, writing count, recognition count.

## 18–19. Media library and images

Images, video, audio, documents. Per item: filename, type, mimeType, size, width, height,
duration, altText, caption, URL, createdAt, usage information. Browser: upload, search,
filter, preview, copy URL, delete when unused; clear warning before deleting a referenced
asset. Images: optimized/responsive versions where supported, alt text, focal point if
practical, lazy loading; no manual resizing by the admin.

## 20. Draft / publish

States: Draft, Published, Archived. Drafts never public; archived editable but hidden.
Clear status indicators.

## 21. Homepage control

Featured projects and order, featured music/showreel, featured recognition, featured
writing, service highlights, availability, hero text, contact CTA — without code.
Drag-and-drop if reliable, else explicit order controls.

## 22. Preview

Preview action → secured unpublished preview route, not publicly discoverable.

## 23. Validation

Publishing enforces required fields; saving drafts never blocked.
Project: title, slug, year, category, short description. Service: name, description,
pricing mode. Writing: title, date, platform, and content or external URL.

## 24. Slugs

Auto-generate from title, manually editable, collision warnings, never silently change a
published URL on title change; keep redirects for changed published slugs where reasonable.

## 25. Search and filters

Projects: status, category, year, featured. Music: artist, year, role, featured.
Recognition: year, type. Writing: platform, status, category. Services: status, category.
Search across titles and metadata.

## 26–27. Studio home and quick actions

Editorial overview: counts (published/draft projects, music, recognition, writing,
services), recent changes, content needing attention, homepage featured content.
No meaningless analytics. Quick actions: New Project, New Music Entry, New Recognition,
New Writing, Upload Media, Edit Homepage, Preview Site.

## 28–32. Responsive, motion, feedback, unsaved changes, delete safety

Desktop primary; mobile supports text edits, publishing, status changes, simple uploads,
reordering when practical; no split panes on small screens. Reduced motion intensity:
state, hierarchy, success, navigation, dragging, loading only; no large transitions,
WebGL, parallax, ambient loops. Clear feedback for saving, publishing, uploading,
deleting, errors, unsaved changes, success; restrained, avoid disruptive modals.
Warn before leaving with unsaved changes; save state always one of Saved / Saving /
Unsaved Changes / Error; autosave only if reliable and unambiguous. Destructive actions
need explicit confirmation; prefer Archive over Delete for published content; permanent
delete is a deliberate secondary action.

## 33–34. Storage and layering

Inspect and reuse existing database, auth, storage, API. No large enterprise CMS unless
justified; custom admin UI preferred. Layers: Database/Content API → Content Repository →
Typed Models → Public Portfolio and Private Studio, both reading the same canonical content.
No portfolio data inside presentational components.

## 35–37. Migration and content-first

Inspect existing hard-coded sample content; do not delete blindly; migration strategy.
Sample content becomes draft seed data or TODO_CONTENT placeholders; existing real content
migrates into the new model; sample fictional content never appears publicly after
migration. Repository-wide brand audit (titles, nav, hero, footer, About, metadata, OG,
JSON-LD, public email templates, admin title, favicon metadata, seeds, placeholders).
Public site tolerates zero music, zero writing, few projects, missing images, empty
recognition, no social links: hide empty sections gracefully, never render broken ones.

## 38. Extensibility

Future modules (Testimonials, Clients, Press, Speaking, Research Publications,
Experiments, Lab Notes, Events, Downloads, Newsletter) addable without redesign.
Do not implement them now.

## 39. Order of work

1. Inspect the repo. 2. Identify framework and deployment. 3. Identify existing
database/storage/auth. 4. Document the current content model. 5. Propose the smallest
maintainable CMS architecture. 6. Define the schema. 7. Define the auth flow. 8. Define
the media strategy. 9. Define the migration strategy. 10. Implement the Studio.
Write `docs/content-architecture.md`, `docs/admin-architecture.md`,
`docs/content-schema.md` before major implementation. Do not redesign the public site
unnecessarily; the current portfolio visual language remains the source of truth.

**Final principle:** the public site is expressive; the Studio is precise; both clearly
belong to the same Kamel brand.
