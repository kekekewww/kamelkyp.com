/**
 * View builders (client-safe): content + context → localized view models.
 * Used by the public read functions and by preview of an unsaved form, so a
 * page renders the same way whether its data came from a snapshot or a form.
 * No cross-locale fallback: an empty value in this locale stays empty.
 */
import type { MediaItem } from "../../media/media-schema";
import { parseMediaUrl } from "../../media/parse-media-url";
import { isFilled, localize } from "../localized";
import {
  focalClasses,
  imageSources,
  r2HostSet,
  toPlayableMedia,
} from "../media/urls";
import type { MusicContent } from "../schemas/music";
import { type ProjectContent, STORY_KEYS } from "../schemas/project";
import type { RecognitionContent } from "../schemas/recognition";
import type { ServiceContent } from "../schemas/service";
import type { ServiceAreaKey } from "../schemas/site-settings";
import type { WritingContent } from "../schemas/writing";
import { parseFormattedText } from "../text-format";
import type { Locale } from "../types";
import type {
  EntryFacts,
  PublicImage,
  PublicMusicItem,
  PublicProjectCard,
  PublicProjectDetail,
  PublicRecognitionItem,
  PublicServiceItem,
  PublicTermRef,
  PublicWritingDetail,
  PublicWritingItem,
  ViewContext,
} from "./view-models";

export function projectHref(locale: Locale, slug: string): string {
  return `/${locale}/works/${slug}`;
}

export function writingHref(locale: Locale, slug: string): string {
  return `/${locale}/writing/${slug}`;
}

/** Internal CTA paths are locale-less in settings (`/commission`). */
export function localizeHref(locale: Locale, href: string): string {
  if (!href.startsWith("/")) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

export function imageView(
  assetId: string | null | undefined,
  context: ViewContext,
  locale: Locale,
  options: { widths?: readonly number[]; sizes?: string } = {},
): PublicImage | null {
  if (!assetId) return null;
  const asset = context.assets.get(assetId);
  if (!asset || asset.state !== "ready" || asset.kind !== "image") return null;
  const sources = imageSources(asset, context.mediaConfig, options);
  if (!sources) return null;
  return {
    assetId,
    ...sources,
    alt: localize(asset.alt, locale),
    focalClass: focalClasses(asset),
  };
}

export function termRef(
  id: string | null | undefined,
  context: ViewContext,
  locale: Locale,
): PublicTermRef | null {
  if (!id) return null;
  const term = context.terms.get(id);
  if (!term) return null;
  return { id: term.id, slug: term.slug, label: localize(term.label, locale) };
}

const PLAYABLE_KINDS = ["audio", "video", "embed"];
/**
 * Body media blocks also accept `link` assets: the legacy import stores
 * external-link media (Dropbox, MediaFire…) as kind `link`, and the existing
 * player renders them as an outbound "Open external media" link, never an
 * embed.
 */
const BLOCK_MEDIA_KINDS = [...PLAYABLE_KINDS, "link"];

function playableAsset(
  assetId: string | null | undefined,
  context: ViewContext,
  locale: Locale,
  override: Parameters<typeof toPlayableMedia>[3] = {},
  kinds: readonly string[] = PLAYABLE_KINDS,
): MediaItem | null {
  if (!assetId) return null;
  const asset = context.assets.get(assetId);
  if (!asset || asset.state !== "ready") return null;
  if (!kinds.includes(asset.kind)) return null;
  return toPlayableMedia(asset, context.mediaConfig, locale, override);
}

function blockMedia(
  blocks: { type: string; mediaId?: string }[],
  context: ViewContext,
  locale: Locale,
): MediaItem[] {
  const items: MediaItem[] = [];
  for (const block of blocks) {
    if (block.type !== "media" || !block.mediaId) continue;
    const item = playableAsset(
      block.mediaId,
      context,
      locale,
      {},
      BLOCK_MEDIA_KINDS,
    );
    if (item && !items.some((existing) => existing.id === item.id)) {
      items.push(item);
    }
  }
  return items;
}

/** Public reads show a row only where its required text exists in the locale. */
export function isProjectVisible(content: ProjectContent, locale: Locale) {
  return (
    isFilled(content.title, locale) &&
    isFilled(content.shortDescription, locale)
  );
}

export function buildProjectCard(
  content: ProjectContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicProjectCard {
  const categories = content.categoryIds
    .map((id) => termRef(id, context, locale))
    .filter((term): term is PublicTermRef => term !== null);
  return {
    id: facts.id,
    slug: content.slug,
    href: projectHref(locale, content.slug),
    title: localize(content.title, locale),
    year: content.year,
    role: localize(content.role, locale),
    shortDescription: localize(content.shortDescription, locale),
    primaryCategory: termRef(content.primaryCategoryId, context, locale),
    categories,
    cover: imageView(content.coverImageId, context, locale, {
      sizes: "(min-width: 1024px) 60vw, 100vw",
    }),
    featured: facts.featured,
    todoContent: facts.todoContent,
  };
}

export function buildProjectView(
  content: ProjectContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicProjectDetail {
  const card = buildProjectCard(content, locale, context, facts);
  const body = content.body[locale];
  return {
    ...card,
    description: parseFormattedText(localize(content.description, locale)),
    tools: content.tools,
    technologies: content.technologies,
    coverVideo: playableAsset(content.coverVideoId, context, locale, {
      title: card.title,
    }),
    gallery: content.gallery.flatMap((item) => {
      const image = imageView(item.assetId, context, locale);
      return image ? [{ image, caption: localize(item.caption, locale) }] : [];
    }),
    links: content.links
      .filter((link) => isFilled(link.label, locale) && link.url)
      .map((link) => ({ label: localize(link.label, locale), url: link.url })),
    credits: content.credits
      .filter((credit) => credit.name.trim())
      .map((credit) => ({
        role: localize(credit.role, locale),
        name: credit.name.trim(),
      })),
    story: STORY_KEYS.flatMap((key) => {
      const blocks = parseFormattedText(localize(content.story[key], locale));
      return blocks.length > 0 ? [{ key, blocks }] : [];
    }),
    body,
    bodyMedia: blockMedia(body, context, locale),
    seo: {
      title: localize(content.seo.title, locale) || card.title,
      description:
        localize(content.seo.description, locale) || card.shortDescription,
    },
    socialImage: imageView(content.socialImageId, context, locale),
    publishedAt: facts.publishedAt,
  };
}

export function isMusicVisible(content: MusicContent, locale: Locale) {
  return isFilled(content.title, locale) && isFilled(content.artist, locale);
}

function youtubeMedia(
  id: string,
  url: string | null,
  title: string,
  context: ViewContext,
  range: { start: number | null; end: number | null },
): MediaItem | null {
  if (!url) return null;
  try {
    const parsed = parseMediaUrl(url, {
      startSeconds: range.start,
      endSeconds: range.end,
      r2Hosts: r2HostSet(context.mediaConfig),
    });
    if (parsed.kind !== "youtube") return null;
    return {
      id: `${id}-youtube`,
      kind: "youtube",
      url: parsed.canonicalUrl,
      title: title.slice(0, 200) || id,
      startSeconds: range.start,
      endSeconds: range.end,
    };
  } catch {
    return null;
  }
}

export function buildMusicItem(
  content: MusicContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicMusicItem {
  const title = localize(content.title, locale);
  const range = {
    startSeconds: content.previewStartSeconds,
    endSeconds: content.previewEndSeconds,
  };
  const media =
    playableAsset(content.audioPreviewId, context, locale, {
      title,
      ...(content.previewStartSeconds !== null ||
      content.previewEndSeconds !== null
        ? range
        : {}),
    }) ??
    playableAsset(content.fullAudioId, context, locale, { title }) ??
    youtubeMedia(facts.id, content.youtubeUrl, title, context, {
      start: content.previewStartSeconds,
      end: content.previewEndSeconds,
    });
  return {
    id: facts.id,
    title,
    artist: localize(content.artist, locale),
    role: localize(content.role, locale),
    genre: localize(content.genre, locale),
    year: content.year,
    description: parseFormattedText(localize(content.description, locale)),
    artwork: imageView(content.artworkId, context, locale),
    media,
    durationMs: content.durationMs,
    links: {
      spotify: content.spotifyUrl,
      youtube: content.youtubeUrl,
      soundcloud: content.soundcloudUrl,
      other: content.otherLinks
        .filter((link) => isFilled(link.label, locale) && link.url)
        .map((link) => ({
          label: localize(link.label, locale),
          url: link.url,
        })),
    },
    credits: content.credits
      .filter((credit) => credit.name.trim())
      .map((credit) => ({
        role: localize(credit.role, locale),
        name: credit.name.trim(),
      })),
  };
}

export function isRecognitionVisible(
  content: RecognitionContent,
  locale: Locale,
) {
  return isFilled(content.event, locale);
}

export function buildRecognitionItem(
  content: RecognitionContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicRecognitionItem {
  const type = termRef(content.typeTermId, context, locale);
  const discipline = termRef(content.disciplineTermId, context, locale);
  return {
    id: facts.id,
    year: content.year,
    date: content.date,
    type: type ? { slug: type.slug, label: type.label } : null,
    discipline: discipline
      ? { slug: discipline.slug, label: discipline.label }
      : null,
    organization: localize(content.organization, locale),
    event: localize(content.event, locale),
    result: localize(content.result, locale),
    description: parseFormattedText(localize(content.description, locale)),
    url: content.url,
    image: imageView(content.imageId, context, locale),
    featured: facts.featured,
    todoContent: facts.todoContent,
  };
}

/** Internal content exists in this locale (a detail page can render). */
export function writingHasDetail(content: WritingContent, locale: Locale) {
  const internal = content.platform === "internal" || !content.externalUrl;
  return internal && content.content[locale].length > 0;
}

export function isWritingVisible(content: WritingContent, locale: Locale) {
  return (
    isFilled(content.title, locale) &&
    (writingHasDetail(content, locale) || Boolean(content.externalUrl))
  );
}

export function buildWritingItem(
  content: WritingContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicWritingItem {
  const hasDetail = writingHasDetail(content, locale);
  const category = termRef(content.categoryTermId, context, locale);
  return {
    id: facts.id,
    slug: content.slug,
    title: localize(content.title, locale),
    date: content.date,
    platform: content.platform,
    platformLabel: content.platformLabel,
    excerpt: localize(content.excerpt, locale),
    category: category ? { slug: category.slug, label: category.label } : null,
    href: hasDetail
      ? writingHref(locale, content.slug)
      : (content.externalUrl ?? null),
    external: !hasDetail && Boolean(content.externalUrl),
    hasDetail,
    cover: imageView(content.coverImageId, context, locale),
    featured: facts.featured,
    todoContent: facts.todoContent,
  };
}

export function buildWritingView(
  content: WritingContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts,
): PublicWritingDetail {
  const item = buildWritingItem(content, locale, context, facts);
  const blocks = content.content[locale];
  return {
    ...item,
    content: blocks,
    media: blockMedia(blocks, context, locale),
    seo: {
      title: localize(content.seo.title, locale) || item.title,
      description: localize(content.seo.description, locale) || item.excerpt,
    },
    socialImage: imageView(content.socialImageId, context, locale),
    publishedAt: facts.publishedAt,
  };
}

export function isServiceVisible(content: ServiceContent, locale: Locale) {
  return (
    isFilled(content.name, locale) && isFilled(content.description, locale)
  );
}

export function buildServiceItem(
  content: ServiceContent,
  locale: Locale,
  context: ViewContext,
  facts: EntryFacts & {
    area: ServiceAreaKey | null;
    /** Active price rule base for commission rows. */
    commissionBaseTwd?: number | null;
  },
): PublicServiceItem {
  const group = termRef(content.groupTermId, context, locale);
  let price: PublicServiceItem["price"] = null;
  if (content.commissionServiceId) {
    price =
      typeof facts.commissionBaseTwd === "number"
        ? { amount: facts.commissionBaseTwd, currency: "TWD" }
        : null;
  } else if (
    (content.priceMode === "fixed" || content.priceMode === "starting_from") &&
    content.priceAmount !== null &&
    content.currency !== null
  ) {
    price = { amount: content.priceAmount, currency: content.currency };
  }
  const list = (items: { zh: string; en: string }[]) =>
    items.map((item) => localize(item, locale)).filter(Boolean);
  return {
    id: facts.id,
    slug: content.slug,
    commissionServiceId: content.commissionServiceId,
    area: facts.area,
    group: group ? { slug: group.slug, label: group.label } : null,
    name: localize(content.name, locale),
    shortDescription: localize(content.shortDescription, locale),
    description: parseFormattedText(localize(content.description, locale)),
    priceMode: content.commissionServiceId
      ? "starting_from"
      : content.priceMode,
    price,
    turnaround: localize(content.turnaround, locale),
    revisions: localize(content.revisions, locale),
    deliverables: list(content.deliverables),
    requirements: list(content.requirements),
    process: content.process
      .map((step) => ({
        title: localize(step.title, locale),
        body: localize(step.body, locale),
      }))
      .filter((step) => step.title),
    faq: content.faq
      .map((item) => ({
        question: localize(item.question, locale),
        answer: localize(item.answer, locale),
      }))
      .filter((item) => item.question && item.answer),
    inquirySubject: localize(content.inquirySubject, locale),
    featured: facts.featured,
    todoContent: facts.todoContent,
  };
}
