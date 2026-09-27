/**
 * Publish validation (client-safe core, content-schema §4, admin §4.10).
 *
 * Model rules are pure functions over the parsed content. Shared rules need
 * facts the client may not have; the server injects them through
 * {@link PublishContext}: asset summaries, slug availability, brand-guard hits
 * (the deny list lives in `brand-guard.server.ts` and never reaches a client
 * bundle) and the serialized snapshot size. Draft saves never run this.
 */
import { filledLocales, isComplete, isFilled, LOCALES } from "./localized";
import { isHttpsUrl } from "./schemas/common";
import type { MediaKind } from "./schemas/media-asset";
import { AUDIO_KINDS, IMAGE_KINDS, VIDEO_KINDS } from "./schemas/media-asset";
import { MUSIC_URL_HOSTS, type MusicContent } from "./schemas/music";
import type { ProjectContent } from "./schemas/project";
import { STORY_KEYS } from "./schemas/project";
import type { RecognitionContent } from "./schemas/recognition";
import type { ServiceContent } from "./schemas/service";
import type { WritingContent } from "./schemas/writing";
import { isValidSlug } from "./slug";
import type {
  EntityType,
  LocalizedBlocks,
  LocalizedText,
  ValidationIssue,
} from "./types";

export const SNAPSHOT_MAX_BYTES = 1_500_000;

export type AssetSummary = {
  id: string;
  kind: MediaKind;
  state: "pending" | "ready" | "failed";
  alt: LocalizedText;
};

export type BrandHit = { field: string; locale?: "zh" | "en"; term: string };

export interface PublishContext {
  todoContent: boolean;
  /** When present, referenced assets are checked (existence, kind, alt). */
  assets?: ReadonlyMap<string, AssetSummary>;
  /** Result of the slug check; undefined = not checked. */
  slugAvailable?: boolean;
  brandViolations?: readonly BrandHit[];
  snapshotBytes?: number;
  isShowreel?: boolean;
  commissionLinked?: boolean;
}

type ContentByType = {
  project: ProjectContent;
  music: MusicContent;
  recognition: RecognitionContent;
  writing: WritingContent;
  service: ServiceContent;
};

const LOCALE_LABEL = { zh: "ZH", en: "EN" } as const;

class Issues {
  readonly list: ValidationIssue[] = [];

  error(
    field: string,
    code: ValidationIssue["code"],
    message: string,
    locale?: "zh" | "en",
  ) {
    this.list.push({
      field,
      code,
      severity: "error",
      message,
      ...(locale ? { locale } : {}),
    });
  }

  warning(
    field: string,
    code: ValidationIssue["code"],
    message: string,
    locale?: "zh" | "en",
  ) {
    this.list.push({
      field,
      code,
      severity: "warning",
      message,
      ...(locale ? { locale } : {}),
    });
  }

  /** Required in both locales: one issue per missing locale. */
  requiredText(field: string, label: string, text: LocalizedText | undefined) {
    for (const locale of LOCALES) {
      if (!isFilled(text, locale)) {
        this.error(
          field,
          "required_locale",
          `${label} is required in ${LOCALE_LABEL[locale]}.`,
          locale,
        );
      }
    }
  }

  /** Optional text filled in one locale only renders only there. */
  oneLocale(field: string, label: string, text: LocalizedText | undefined) {
    const filled = filledLocales(text);
    if (filled.length !== 1) return;
    const only = filled[0] as "zh" | "en";
    const other = only === "zh" ? "en" : "zh";
    this.warning(
      field,
      "one_locale_only",
      `${label} is only in ${LOCALE_LABEL[only]}; it will not show on the ${other === "en" ? "English" : "Chinese"} page.`,
      other,
    );
  }

  required(field: string, present: boolean, message: string) {
    if (!present) this.error(field, "required", message);
  }

  httpsUrl(field: string, value: string | null | undefined, label: string) {
    if (value && !isHttpsUrl(value)) {
      this.error(field, "invalid_url", `${label} must be an https:// address.`);
    }
  }

  slug(slug: string) {
    if (!slug) {
      this.error("slug", "required", "Slug is required.");
    } else if (!isValidSlug(slug)) {
      this.error(
        "slug",
        "slug_invalid",
        "Use lowercase letters, digits and hyphens only.",
      );
    }
  }

  links(field: string, links: { label: LocalizedText; url: string }[]) {
    links.forEach((link, index) => {
      this.requiredText(`${field}.${index}.label`, "Link label", link.label);
      if (!isHttpsUrl(link.url)) {
        this.error(
          `${field}.${index}.url`,
          "invalid_url",
          "Links must be https:// addresses.",
        );
      }
    });
  }

  credits(field: string, credits: { role: LocalizedText; name: string }[]) {
    credits.forEach((credit, index) => {
      if (!credit.name.trim()) {
        this.error(
          `${field}.${index}.name`,
          "required",
          "Credit name is required.",
        );
      }
    });
  }
}

function checkAsset(
  issues: Issues,
  context: PublishContext,
  field: string,
  assetId: string | null | undefined,
  kinds: readonly MediaKind[] | null,
) {
  if (!assetId || !context.assets) return;
  const asset = context.assets.get(assetId);
  if (asset?.state !== "ready") {
    issues.error(field, "missing_asset", "This media asset no longer exists.");
    return;
  }
  if (kinds && !kinds.includes(asset.kind)) {
    issues.error(
      field,
      "wrong_asset_kind",
      `Choose a ${kinds.join(" or ")} asset here.`,
    );
    return;
  }
  if (asset.kind === "image") {
    for (const locale of LOCALES) {
      if (!isFilled(asset.alt, locale)) {
        issues.error(
          field,
          "alt_required",
          `Add ${LOCALE_LABEL[locale]} alt text to this image before publishing.`,
          locale,
        );
      }
    }
  }
}

function checkBlockAssets(
  issues: Issues,
  context: PublishContext,
  field: string,
  blocks: LocalizedBlocks,
) {
  for (const locale of LOCALES) {
    for (const block of blocks[locale]) {
      if (block.type === "media") {
        checkAsset(issues, context, `${field}.${locale}`, block.mediaId, null);
      }
    }
  }
}

export function validateProjectForPublish(
  content: ProjectContent,
  context: PublishContext,
): ValidationIssue[] {
  const issues = new Issues();
  issues.requiredText("title", "Title", content.title);
  issues.slug(content.slug);
  issues.required("year", content.year !== null, "Year is required.");
  issues.required(
    "primaryCategoryId",
    Boolean(content.primaryCategoryId),
    "Choose a primary category.",
  );
  issues.requiredText(
    "shortDescription",
    "Short description",
    content.shortDescription,
  );
  if (content.shortDescription.en.trim().length > 140) {
    issues.warning(
      "shortDescription",
      "too_long",
      "The English short description reads best under 140 characters.",
      "en",
    );
  }
  issues.oneLocale("role", "Role", content.role);
  issues.oneLocale("description", "Description", content.description);
  for (const key of STORY_KEYS) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    issues.oneLocale(`story.${key}`, label, content.story[key]);
  }
  issues.links("links", content.links);
  issues.credits("credits", content.credits);
  checkAsset(
    issues,
    context,
    "coverImageId",
    content.coverImageId,
    IMAGE_KINDS,
  );
  checkAsset(
    issues,
    context,
    "coverVideoId",
    content.coverVideoId,
    VIDEO_KINDS,
  );
  checkAsset(
    issues,
    context,
    "socialImageId",
    content.socialImageId,
    IMAGE_KINDS,
  );
  content.gallery.forEach((item, index) => {
    checkAsset(
      issues,
      context,
      `gallery.${index}.assetId`,
      item.assetId,
      IMAGE_KINDS,
    );
  });
  checkBlockAssets(issues, context, "body", content.body);
  return issues.list;
}

function hostAllowed(value: string, hosts: readonly string[]): boolean {
  try {
    return hosts.includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function validateMusicForPublish(
  content: MusicContent,
  context: PublishContext,
): ValidationIssue[] {
  const issues = new Issues();
  issues.requiredText("title", "Title", content.title);
  issues.requiredText("artist", "Artist", content.artist);
  for (const field of ["spotifyUrl", "youtubeUrl", "soundcloudUrl"] as const) {
    const value = content[field];
    if (
      value &&
      (!isHttpsUrl(value) || !hostAllowed(value, MUSIC_URL_HOSTS[field]))
    ) {
      issues.error(
        field,
        "invalid_url",
        `Use an https:// link on ${MUSIC_URL_HOSTS[field][0]}.`,
      );
    }
  }
  const playable = Boolean(
    content.audioPreviewId ||
      content.fullAudioId ||
      content.youtubeUrl ||
      content.spotifyUrl ||
      content.soundcloudUrl,
  );
  issues.required(
    "audioPreviewId",
    playable,
    "Add preview audio, full audio or a Spotify, YouTube or SoundCloud link.",
  );
  if (
    context.isShowreel &&
    !(content.audioPreviewId || content.fullAudioId || content.youtubeUrl)
  ) {
    issues.error(
      "audioPreviewId",
      "required",
      "The homepage showreel needs preview audio, full audio or a YouTube link.",
    );
  }
  issues.oneLocale("role", "Role", content.role);
  issues.oneLocale("genre", "Genre", content.genre);
  issues.oneLocale("description", "Description", content.description);
  issues.links("otherLinks", content.otherLinks);
  issues.credits("credits", content.credits);
  checkAsset(issues, context, "artworkId", content.artworkId, IMAGE_KINDS);
  checkAsset(
    issues,
    context,
    "audioPreviewId",
    content.audioPreviewId,
    AUDIO_KINDS,
  );
  checkAsset(issues, context, "fullAudioId", content.fullAudioId, AUDIO_KINDS);
  return issues.list;
}

export function validateRecognitionForPublish(
  content: RecognitionContent,
  context: PublishContext,
): ValidationIssue[] {
  const issues = new Issues();
  issues.required("year", content.year !== null, "Year is required.");
  issues.required("typeTermId", Boolean(content.typeTermId), "Choose a type.");
  issues.requiredText("event", "Event", content.event);
  issues.oneLocale("organization", "Organization", content.organization);
  issues.oneLocale("result", "Result", content.result);
  issues.oneLocale("description", "Description", content.description);
  issues.httpsUrl("url", content.url, "The link");
  checkAsset(issues, context, "imageId", content.imageId, IMAGE_KINDS);
  return issues.list;
}

function blocksComplete(blocks: LocalizedBlocks, locale: "zh" | "en") {
  return blocks[locale].length > 0;
}

export function validateWritingForPublish(
  content: WritingContent,
  context: PublishContext,
): ValidationIssue[] {
  const issues = new Issues();
  issues.requiredText("title", "Title", content.title);
  issues.required("date", Boolean(content.date), "Date is required.");
  const internal = content.platform === "internal";
  if (!internal) {
    if (!content.externalUrl) {
      issues.error(
        "externalUrl",
        "required",
        "External entries need a link to the original post.",
      );
    } else {
      issues.httpsUrl("externalUrl", content.externalUrl, "The external link");
    }
  } else {
    issues.httpsUrl("externalUrl", content.externalUrl, "The external link");
  }
  if (content.platform === "other") {
    issues.required(
      "platformLabel",
      Boolean(content.platformLabel?.trim()),
      "Name the platform.",
    );
  }
  const needsContent = internal || !content.externalUrl;
  if (needsContent) {
    for (const locale of LOCALES) {
      if (!blocksComplete(content.content, locale)) {
        issues.error(
          "content",
          "required_locale",
          `Content is required in ${LOCALE_LABEL[locale]}.`,
          locale,
        );
      }
    }
    issues.slug(content.slug);
  } else if (content.slug && !isValidSlug(content.slug)) {
    issues.slug(content.slug);
  }
  issues.oneLocale("excerpt", "Excerpt", content.excerpt);
  checkAsset(
    issues,
    context,
    "coverImageId",
    content.coverImageId,
    IMAGE_KINDS,
  );
  checkAsset(
    issues,
    context,
    "socialImageId",
    content.socialImageId,
    IMAGE_KINDS,
  );
  checkBlockAssets(issues, context, "content", content.content);
  return issues.list;
}

export function validateServiceForPublish(
  content: ServiceContent,
  context: PublishContext,
): ValidationIssue[] {
  const issues = new Issues();
  const linked =
    context.commissionLinked ?? content.commissionServiceId !== null;
  issues.requiredText("name", "Name", content.name);
  issues.slug(content.slug);
  issues.required(
    "groupTermId",
    Boolean(content.groupTermId),
    "Choose a group.",
  );
  issues.requiredText("description", "Description", content.description);
  if (linked) {
    if (content.priceAmount !== null || content.currency !== null) {
      issues.error(
        "priceAmount",
        "price_forbidden",
        "Commission prices come from Pricing; this service cannot hold its own price.",
      );
    }
  } else if (
    content.priceMode === "fixed" ||
    content.priceMode === "starting_from"
  ) {
    if (content.priceAmount === null) {
      issues.error("priceAmount", "price_required", "Enter the price.");
    }
    if (content.currency === null) {
      issues.error("currency", "price_required", "Choose the currency.");
    }
  } else if (content.priceAmount !== null) {
    issues.error(
      "priceAmount",
      "price_forbidden",
      "Custom quote and contact services show no price; clear the amount.",
    );
  }
  content.faq.forEach((item, index) => {
    issues.requiredText(`faq.${index}.question`, "Question", item.question);
    issues.requiredText(`faq.${index}.answer`, "Answer", item.answer);
  });
  issues.oneLocale(
    "shortDescription",
    "Short description",
    content.shortDescription,
  );
  issues.oneLocale("turnaround", "Turnaround", content.turnaround);
  issues.oneLocale("revisions", "Revisions", content.revisions);
  return issues.list;
}

const MODEL_VALIDATORS: {
  [T in EntityType]: (
    content: ContentByType[T],
    context: PublishContext,
  ) => ValidationIssue[];
} = {
  project: validateProjectForPublish,
  music: validateMusicForPublish,
  recognition: validateRecognitionForPublish,
  writing: validateWritingForPublish,
  service: validateServiceForPublish,
};

/** Model rules plus the shared rules (TODO flag, slug, brand, size). */
export function validateForPublish<T extends EntityType>(
  type: T,
  content: ContentByType[T],
  context: PublishContext,
): ValidationIssue[] {
  const head = new Issues();
  if (context.todoContent) {
    head.error(
      "todoContent",
      "todo_content",
      "Seeded sample content. Replace the text, then clear the TODO_CONTENT flag.",
    );
  }
  const model = MODEL_VALIDATORS[type](content, context);
  const issues = new Issues();
  if (context.slugAvailable === false) {
    issues.error("slug", "slug_taken", "Another entry already uses this slug.");
  }
  for (const hit of context.brandViolations ?? []) {
    issues.error(
      hit.field,
      "brand_name",
      `Public text must use the Kamel brand only; remove "${hit.term}".`,
      hit.locale,
    );
  }
  if (
    context.snapshotBytes !== undefined &&
    context.snapshotBytes > SNAPSHOT_MAX_BYTES
  ) {
    issues.error(
      "snapshot",
      "snapshot_too_large",
      "This entry is too large to publish. Shorten the text or split it.",
    );
  }
  return [...head.list, ...model, ...issues.list];
}

export function hasBlockingIssues(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** Zod draft-schema failures → inline structural issues (save blockers). */
export function structuralIssues(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; code: string; message: string }>;
}): ValidationIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String);
    const last = path[path.length - 1];
    const locale = last === "zh" || last === "en" ? last : undefined;
    const field = (locale ? path.slice(0, -1) : path).join(".");
    const code: ValidationIssue["code"] =
      issue.code === "too_big"
        ? "too_long"
        : issue.message === "slug_invalid"
          ? "slug_invalid"
          : "invalid_value";
    const message =
      code === "too_long"
        ? "This text is too long."
        : code === "slug_invalid"
          ? "Use lowercase letters, digits and hyphens only."
          : "This value cannot be saved.";
    return {
      field,
      code,
      severity: "error",
      message,
      ...(locale ? { locale } : {}),
    };
  });
}

/** Convenience for list rows: is `text` complete in both locales? */
export { isComplete };
