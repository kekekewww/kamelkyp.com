/**
 * Content Studio error type. Every lifecycle failure carries a stable `code`
 * and the HTTP status a Studio route should answer with (admin §3.5).
 */

export type CmsErrorCode =
  | "not_found"
  | "stale_revision"
  | "confirmation_mismatch"
  | "invalid_state"
  | "invalid_content"
  | "slug_taken"
  | "published_entity_delete_forbidden"
  | "commission_service_delete_forbidden"
  | "commission_service_archive_forbidden"
  | "commission_link_immutable"
  | "term_vocabulary_mismatch"
  | "term_in_use"
  | "media_asset_in_published_use"
  | "unknown_reference"
  | "uploads_not_configured";

const STATUS: Record<CmsErrorCode, number> = {
  not_found: 404,
  stale_revision: 409,
  confirmation_mismatch: 422,
  invalid_state: 409,
  invalid_content: 422,
  slug_taken: 409,
  published_entity_delete_forbidden: 409,
  commission_service_delete_forbidden: 409,
  commission_service_archive_forbidden: 409,
  commission_link_immutable: 409,
  term_vocabulary_mismatch: 422,
  term_in_use: 409,
  media_asset_in_published_use: 409,
  unknown_reference: 422,
  uploads_not_configured: 503,
};

export const CMS_ERROR_MESSAGES: Record<CmsErrorCode, string> = {
  not_found: "This entry no longer exists.",
  stale_revision: "This entry changed elsewhere.",
  confirmation_mismatch: "The confirmation text does not match.",
  invalid_state: "This action is not available in the current status.",
  invalid_content: "Some fields could not be saved.",
  slug_taken: "Another entry already uses this slug.",
  published_entity_delete_forbidden:
    "Published entries cannot be deleted. Unpublish or archive first.",
  commission_service_delete_forbidden: "Commission services cannot be deleted.",
  commission_service_archive_forbidden:
    "Commission services cannot be archived; unpublish instead.",
  commission_link_immutable: "The commission link of a service cannot change.",
  term_vocabulary_mismatch: "That term belongs to a different list.",
  term_in_use: "This term is still used. Archive it instead.",
  media_asset_in_published_use:
    "This asset is used by published content. Unpublish or replace it first.",
  unknown_reference: "A referenced item no longer exists.",
  uploads_not_configured: "Uploads are not configured.",
};

export class CmsError extends Error {
  readonly code: CmsErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: CmsErrorCode, details?: unknown) {
    super(code);
    this.name = "CmsError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isCmsError(error: unknown): error is CmsError {
  return error instanceof CmsError;
}

const TRIGGER_CODES: CmsErrorCode[] = [
  "published_entity_delete_forbidden",
  "commission_service_delete_forbidden",
  "commission_service_archive_forbidden",
  "commission_link_immutable",
  "term_vocabulary_mismatch",
  "media_asset_in_published_use",
];

/** Maps D1 trigger / constraint failures to CmsError; rethrows anything else. */
export function mapD1Error(error: unknown): never {
  if (isCmsError(error)) throw error;
  const message = error instanceof Error ? error.message : String(error);
  for (const code of TRIGGER_CODES) {
    if (message.includes(code)) throw new CmsError(code);
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    throw new CmsError("unknown_reference");
  }
  if (/UNIQUE constraint failed: \w+\.(published_)?slug/i.test(message)) {
    throw new CmsError("slug_taken");
  }
  throw error;
}
