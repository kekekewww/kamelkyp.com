/**
 * Upload allowlist, size limits and file signatures (content-architecture
 * §4.3). Client-safe: the uploader checks a file before declaring it, and the
 * Worker checks the declaration and the first bytes of the stream again.
 *
 * SVG, HTML and anything not listed are refused: files are served from a
 * same-site origin, so only inert media types may be stored.
 */
import type { MediaKind } from "../schemas/media-asset";

export type UploadKind = "image" | "audio" | "video" | "document";

const MB = 1024 * 1024;

interface UploadRule {
  mimeTypes: readonly string[];
  extensions: readonly string[];
  maxBytes: number;
}

/** Cloudflare Free/Pro caps a request body at 100 MB; 95 MB leaves headroom. */
export const UPLOAD_RULES: Readonly<Record<UploadKind, UploadRule>> = {
  image: {
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
    ],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"],
    maxBytes: 20 * MB,
  },
  audio: {
    mimeTypes: [
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/aac",
      "audio/mp4",
      "audio/ogg",
      "audio/flac",
    ],
    extensions: [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".oga", ".flac"],
    maxBytes: 95 * MB,
  },
  video: {
    mimeTypes: ["video/mp4", "video/webm"],
    extensions: [".mp4", ".m4v", ".webm"],
    maxBytes: 95 * MB,
  },
  document: {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 20 * MB,
  },
};

const UPLOAD_KINDS = Object.keys(UPLOAD_RULES) as UploadKind[];

/** Browser-reported aliases → the canonical type stored and served. */
const MIME_ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/x-flac": "audio/flac",
  "application/ogg": "audio/ogg",
  "video/x-m4v": "video/mp4",
};

const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

/** `IMAGE/JPEG; charset=x` → `image/jpeg`. */
export function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function uploadKindForMime(
  mimeType: string | null | undefined,
): UploadKind | null {
  const mime = normalizeMime(mimeType);
  return (
    UPLOAD_KINDS.find((kind) => UPLOAD_RULES[kind].mimeTypes.includes(mime)) ??
    null
  );
}

/**
 * The type a file is declared and stored with: a known alias is mapped to
 * its canonical type; an empty type falls back to the file extension.
 * Anything else is returned unchanged (and then refused by the allowlist).
 */
export function canonicalMimeType(
  reported: string | null | undefined,
  filename: string,
): string {
  const mime = normalizeMime(reported);
  if (mime) return MIME_ALIASES[mime] ?? mime;
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  return EXTENSION_TYPES[filename.slice(dot).toLowerCase()] ?? "";
}

function isUploadKind(kind: MediaKind | undefined): kind is UploadKind {
  return kind !== undefined && kind in UPLOAD_RULES;
}

/** `accept` for a file input: the kind's types and extensions (all kinds otherwise). */
export function acceptAttribute(kind?: MediaKind): string {
  const kinds = isUploadKind(kind) ? [kind] : UPLOAD_KINDS;
  return [
    ...kinds.flatMap((item) => UPLOAD_RULES[item].mimeTypes),
    ...kinds.flatMap((item) => UPLOAD_RULES[item].extensions),
  ].join(",");
}

export type UploadCheck =
  | { ok: true; kind: UploadKind; mimeType: string }
  | {
      ok: false;
      code: "unsupported_media_type" | "file_too_large" | "empty_file";
      status: 413 | 415 | 422;
      maxBytes?: number;
    };

/** Type and size rules for a declared upload (client and server). */
export function checkUploadDeclaration(
  input: { mimeType: string; sizeBytes: number },
  expectedKind?: MediaKind,
): UploadCheck {
  const mimeType = normalizeMime(input.mimeType);
  const kind = uploadKindForMime(mimeType);
  if (
    !kind ||
    (expectedKind && isUploadKind(expectedKind) && kind !== expectedKind)
  ) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, code: "empty_file", status: 422 };
  }
  const { maxBytes } = UPLOAD_RULES[kind];
  if (input.sizeBytes > maxBytes) {
    return { ok: false, code: "file_too_large", status: 413, maxBytes };
  }
  return { ok: true, kind, mimeType };
}

/** Bytes the signature check needs before it can decide. */
export const SIGNATURE_BYTES = 12;

function ascii(data: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (data[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function startsWith(data: Uint8Array, ...values: number[]): boolean {
  return values.every((value, index) => data[index] === value);
}

const isFtyp = (data: Uint8Array) => ascii(data, 4, "ftyp");
const isId3 = (data: Uint8Array) => ascii(data, 0, "ID3");
/** MPEG audio frame sync: 11 set bits (`FF Ex` / `FF Fx`). */
const isFrameSync = (data: Uint8Array) =>
  data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0;
/** ADTS (raw AAC) sync: `FF F1` / `FF F9`. */
const isAdts = (data: Uint8Array) =>
  data[0] === 0xff && ((data[1] ?? 0) & 0xf6) === 0xf0;
const isRiff = (data: Uint8Array, form: string) =>
  ascii(data, 0, "RIFF") && ascii(data, 8, form);

const SIGNATURES: Readonly<Record<string, (data: Uint8Array) => boolean>> = {
  "image/jpeg": (data) => startsWith(data, 0xff, 0xd8, 0xff),
  "image/png": (data) => startsWith(data, 0x89, 0x50, 0x4e, 0x47),
  "image/gif": (data) => ascii(data, 0, "GIF8"),
  "image/webp": (data) => isRiff(data, "WEBP"),
  "image/avif": isFtyp,
  "audio/mpeg": (data) => isId3(data) || isFrameSync(data),
  "audio/wav": (data) => isRiff(data, "WAVE"),
  "audio/x-wav": (data) => isRiff(data, "WAVE"),
  "audio/aac": (data) => isAdts(data) || isId3(data) || isFtyp(data),
  "audio/mp4": isFtyp,
  "audio/ogg": (data) => ascii(data, 0, "OggS"),
  "audio/flac": (data) => ascii(data, 0, "fLaC"),
  "video/mp4": isFtyp,
  "video/webm": (data) => startsWith(data, 0x1a, 0x45, 0xdf, 0xa3),
  "application/pdf": (data) => ascii(data, 0, "%PDF"),
};

/**
 * Does the start of a file match its declared type? `head` should hold the
 * first {@link SIGNATURE_BYTES} bytes (fewer only when the file is shorter).
 */
export function matchesSignature(mimeType: string, head: Uint8Array): boolean {
  const check = SIGNATURES[normalizeMime(mimeType)];
  if (!check || head.length < 4) return false;
  return check(head);
}
