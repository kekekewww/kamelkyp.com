/**
 * Block editor model (client-safe). The Studio edits the existing content
 * blocks (`app/lib/content/block-schema.ts`) through a flat, form-friendly
 * shape: list items are one-per-line text and optional strings are "" while
 * editing. `serializeBlocks` turns the editor state back into blocks: empty
 * blocks are dropped (an added-but-unused block never blocks a save), and
 * blocks that cannot be stored keep their place and get an inline message, so
 * a draft never loses what the owner typed and the server still refuses it.
 */
import {
  type ContentBlock,
  ContentBlockSchema,
} from "../../../lib/content/block-schema";

export type BlockKind = ContentBlock["type"];

export type EditorBlock =
  | { key: string; type: "heading"; level: 2 | 3; text: string }
  | { key: string; type: "paragraph"; text: string }
  | {
      key: string;
      type: "list";
      style: "unordered" | "ordered";
      itemsText: string;
    }
  | { key: string; type: "quote"; text: string; attribution: string }
  | {
      key: string;
      type: "external_image";
      url: string;
      alt: string;
      caption: string;
    }
  | { key: string; type: "external_link"; url: string; label: string }
  | { key: string; type: "media"; mediaId: string }
  | { key: string; type: "divider" };

export const BLOCK_KINDS: ReadonlyArray<{ type: BlockKind; label: string }> = [
  { type: "paragraph", label: "Paragraph" },
  { type: "heading", label: "Heading" },
  { type: "list", label: "List" },
  { type: "quote", label: "Quote" },
  { type: "media", label: "Media" },
  { type: "external_image", label: "Image URL" },
  { type: "external_link", label: "Link" },
  { type: "divider", label: "Divider" },
];

export const BLOCK_LABEL: Record<BlockKind, string> = Object.fromEntries(
  BLOCK_KINDS.map((kind) => [kind.type, kind.label]),
) as Record<BlockKind, string>;

let fallbackCounter = 0;
export function defaultBlockKey(): string {
  fallbackCounter += 1;
  return `block-${fallbackCounter}`;
}

type KeyMaker = () => string;

export function createEditorBlock(
  type: BlockKind,
  makeKey: KeyMaker = defaultBlockKey,
): EditorBlock {
  const key = makeKey();
  switch (type) {
    case "heading":
      return { key, type, level: 2, text: "" };
    case "paragraph":
      return { key, type, text: "" };
    case "list":
      return { key, type, style: "unordered", itemsText: "" };
    case "quote":
      return { key, type, text: "", attribution: "" };
    case "external_image":
      return { key, type, url: "", alt: "", caption: "" };
    case "external_link":
      return { key, type, url: "", label: "" };
    case "media":
      return { key, type, mediaId: "" };
    case "divider":
      return { key, type };
  }
}

export function toEditorBlock(
  block: ContentBlock,
  makeKey: KeyMaker = defaultBlockKey,
): EditorBlock {
  const key = makeKey();
  switch (block.type) {
    case "heading":
      return { key, type: "heading", level: block.level, text: block.text };
    case "paragraph":
      return { key, type: "paragraph", text: block.text };
    case "list":
      return {
        key,
        type: "list",
        style: block.style,
        itemsText: block.items.join("\n"),
      };
    case "quote":
      return {
        key,
        type: "quote",
        text: block.text,
        attribution: block.attribution ?? "",
      };
    case "external_image":
      return {
        key,
        type: "external_image",
        url: block.url,
        alt: block.alt,
        caption: block.caption ?? "",
      };
    case "external_link":
      return {
        key,
        type: "external_link",
        url: block.url,
        label: block.label,
      };
    case "media":
      return { key, type: "media", mediaId: block.mediaId };
    case "divider":
      return { key, type: "divider" };
  }
}

export function toEditorBlocks(
  blocks: readonly ContentBlock[],
  makeKey: KeyMaker = defaultBlockKey,
): EditorBlock[] {
  return blocks.map((block) => toEditorBlock(block, makeKey));
}

/** Copies blocks (e.g. ZH → EN to translate) with fresh keys. */
export function copyEditorBlocks(
  items: readonly EditorBlock[],
  makeKey: KeyMaker = defaultBlockKey,
): EditorBlock[] {
  return items.map((item) => ({ ...item, key: makeKey() }));
}

function isHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function listItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A block the owner added but left empty (dropped on save). */
function isEmpty(item: EditorBlock): boolean {
  switch (item.type) {
    case "heading":
    case "paragraph":
      return !item.text.trim();
    case "list":
      return listItems(item.itemsText).length === 0;
    case "quote":
      return !item.text.trim() && !item.attribution.trim();
    case "external_image":
      return !item.url.trim() && !item.alt.trim() && !item.caption.trim();
    case "external_link":
      return !item.url.trim() && !item.label.trim();
    case "media":
      return !item.mediaId;
    case "divider":
      return false;
  }
}

function toBlock(item: EditorBlock): ContentBlock {
  switch (item.type) {
    case "heading":
      return { type: "heading", level: item.level, text: item.text.trim() };
    case "paragraph":
      return { type: "paragraph", text: item.text.trim() };
    case "list":
      return {
        type: "list",
        style: item.style,
        items: listItems(item.itemsText),
      };
    case "quote":
      return {
        type: "quote",
        text: item.text.trim(),
        attribution: item.attribution.trim() || null,
      };
    case "external_image":
      return {
        type: "external_image",
        url: item.url.trim(),
        alt: item.alt.trim(),
        caption: item.caption.trim() || null,
      };
    case "external_link":
      return {
        type: "external_link",
        url: item.url.trim(),
        label: item.label.trim(),
      };
    case "media":
      return { type: "media", mediaId: item.mediaId };
    case "divider":
      return { type: "divider" };
  }
}

/** Plain-language problems with one block (empty list = storable). */
export function blockProblems(block: ContentBlock): string[] {
  const problems: string[] = [];
  switch (block.type) {
    case "heading":
      if (block.text.length > 180) {
        problems.push("Headings are limited to 180 characters.");
      }
      break;
    case "paragraph":
      if (block.text.length > 8000) {
        problems.push(
          "Paragraphs are limited to 8,000 characters; split this one.",
        );
      }
      break;
    case "list":
      if (block.items.length > 100) {
        problems.push("Lists are limited to 100 items.");
      }
      if (block.items.some((entry) => entry.length > 1000)) {
        problems.push("Each list item is limited to 1,000 characters.");
      }
      if (new Set(block.items).size !== block.items.length) {
        problems.push("Each list item must be different.");
      }
      break;
    case "quote":
      if (!block.text) problems.push("Add the quote text.");
      if (block.text.length > 2000) {
        problems.push("Quotes are limited to 2,000 characters.");
      }
      if ((block.attribution ?? "").length > 200) {
        problems.push("The attribution is limited to 200 characters.");
      }
      break;
    case "external_image":
      if (!isHttps(block.url)) {
        problems.push("Use an https:// image address.");
      }
      if (!block.alt) problems.push("Add alt text describing the image.");
      if (block.alt.length > 300) {
        problems.push("Alt text is limited to 300 characters.");
      }
      if ((block.caption ?? "").length > 500) {
        problems.push("Captions are limited to 500 characters.");
      }
      break;
    case "external_link":
      if (!isHttps(block.url)) problems.push("Use an https:// link.");
      if (!block.label) problems.push("Add the link label.");
      if (block.label.length > 200) {
        problems.push("Link labels are limited to 200 characters.");
      }
      break;
    case "media":
    case "divider":
      break;
  }
  if (problems.length === 0 && !ContentBlockSchema.safeParse(block).success) {
    problems.push("This block cannot be saved. Check its fields.");
  }
  return problems;
}

export function serializeBlocks(items: readonly EditorBlock[]): {
  blocks: ContentBlock[];
  /** Messages by block key (the block is still sent; the server refuses it). */
  errors: Record<string, string>;
} {
  const blocks: ContentBlock[] = [];
  const errors: Record<string, string> = {};
  for (const item of items) {
    if (isEmpty(item)) continue;
    const block = toBlock(item);
    const problems = blockProblems(block);
    if (problems.length > 0) errors[item.key] = problems.join(" ");
    blocks.push(block);
  }
  return { blocks, errors };
}

export function moveEditorBlock(
  items: readonly EditorBlock[],
  key: string,
  delta: number,
): EditorBlock[] {
  const index = items.findIndex((item) => item.key === key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as EditorBlock);
  return next;
}
