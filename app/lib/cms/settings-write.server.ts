/**
 * Settings writes (content-schema §2.9, §5.3; admin-architecture §4.2.1).
 *
 * Brand and site settings have no draft state: Save validates the whole
 * document and applies it at once. `revision` guards concurrent saves (409).
 * Screens that edit part of a document (the homepage control, the settings
 * sections) send a patch that is deep-merged into the stored document, so a
 * form never erases the keys it does not show. The review flags
 * (`contactEmailConfirmedAt`, `redesignCopyAcknowledgedAt`) are never taken
 * from a form; they change only through their own actions.
 */
import type { z } from "zod";
import type { Env } from "../env.server";
import { findBrandViolations, matchBrandTerm } from "./brand-guard.server";
import { CmsError } from "./db/errors";
import { extractAssetRefs, syncUsages } from "./db/usage.server";
import { formDataToObject, readExpectedRevision } from "./forms";
import { getAssets } from "./media/assets.server";
import { readMediaConfig } from "./media/config.server";
import { type MediaSummary, toMediaSummary } from "./media/summary";
import {
  type BrandSettings,
  BrandSettingsSchema,
} from "./schemas/brand-settings";
import { type SiteSettings, SiteSettingsSchema } from "./schemas/site-settings";
import { settingsFromRows } from "./settings.server";
import { actionOk, cmsErrorResult, unknownIntent } from "./studio/responses";
import { listTerms } from "./taxonomy.server";
import type { UsageEntityType, ValidationIssue } from "./types";

export type SettingsKey = "brand" | "site";

export type SettingsWithMeta<T> = {
  value: T;
  revision: number;
  /** `settings.updated_at`; null when the row does not exist yet. */
  updatedAt: string | null;
};

type SettingsRow = {
  key: SettingsKey;
  data_json: string;
  revision: number;
  updated_at: string;
};

export async function readSettingsWithMeta(db: D1Database): Promise<{
  brand: SettingsWithMeta<BrandSettings>;
  site: SettingsWithMeta<SiteSettings>;
}> {
  const rows = await db
    .prepare(
      "SELECT key, data_json, revision, updated_at FROM settings WHERE key IN ('brand', 'site')",
    )
    .all<SettingsRow>();
  const parsed = settingsFromRows(rows.results);
  const updatedAt = (key: SettingsKey) =>
    rows.results.find((row) => row.key === key)?.updated_at ?? null;
  return {
    brand: { ...parsed.brand, updatedAt: updatedAt("brand") },
    site: { ...parsed.site, updatedAt: updatedAt("site") },
  };
}

/** True when the address contains a personal-name variant (note only). */
export function contactEmailNeedsReview(email: string): boolean {
  return email.trim() !== "" && matchBrandTerm(email) !== null;
}

// ---- Validation ----------------------------------------------------------

type ZodIssueLike = z.core.$ZodIssue;

function issueMessage(issue: ZodIssueLike): {
  code: ValidationIssue["code"];
  message: string;
} {
  const origin = "origin" in issue ? String(issue.origin) : "";
  switch (issue.code) {
    case "too_big":
      if (origin === "string") {
        return { code: "too_long", message: "This text is too long." };
      }
      if (origin === "array" || origin === "set") {
        return {
          code: "invalid_value",
          message: `Too many items (at most ${String(issue.maximum)}).`,
        };
      }
      return {
        code: "invalid_value",
        message: `Use a number no larger than ${String(issue.maximum)}.`,
      };
    case "too_small":
      if (origin === "string") {
        return { code: "required", message: "This field cannot be empty." };
      }
      if (origin === "array" || origin === "set") {
        return {
          code: "invalid_value",
          message: `Add at least ${String(issue.minimum)} items.`,
        };
      }
      return {
        code: "invalid_value",
        message: `Use a number no smaller than ${String(issue.minimum)}.`,
      };
    case "custom":
      if (issue.message === "href_invalid") {
        return {
          code: "invalid_url",
          message:
            "Use a site path such as /commission or an https:// address.",
        };
      }
      if (issue.message === "email_invalid") {
        return {
          code: "invalid_value",
          message: "Enter a valid email address.",
        };
      }
      if (issue.message === "duplicate_navigation_item") {
        return {
          code: "invalid_value",
          message: "Each navigation item can appear only once.",
        };
      }
      return { code: "invalid_value", message: "This value cannot be saved." };
    case "invalid_type":
      return issue.expected === "number"
        ? { code: "invalid_value", message: "Enter a whole number." }
        : { code: "invalid_value", message: "This value cannot be saved." };
    default:
      return { code: "invalid_value", message: "This value cannot be saved." };
  }
}

/** Zod issues → Studio field issues (dotted path, locale when zh/en). */
export function settingsIssues(
  issues: readonly ZodIssueLike[],
): ValidationIssue[] {
  return issues.map((issue) => {
    const path = issue.path.map(String);
    const last = path[path.length - 1];
    const locale = last === "zh" || last === "en" ? last : undefined;
    const { code, message } = issueMessage(issue);
    return {
      field: (locale ? path.slice(0, -1) : path).join("."),
      code,
      severity: "error",
      message,
      ...(locale ? { locale } : {}),
    };
  });
}

function brandIssues(
  value: unknown,
  exempt: readonly string[] = [],
): ValidationIssue[] {
  return findBrandViolations(value, { exempt }).map((hit) => ({
    field: hit.field,
    code: "brand_name",
    severity: "error",
    message: `Public text must use the Kamel brand only; remove "${hit.term}".`,
    ...(hit.locale ? { locale: hit.locale } : {}),
  }));
}

type AssetRule = { field: string; id: string | null; png?: boolean };

function isPng(asset: { mimeType: string | null; filename: string }) {
  return (
    asset.mimeType === "image/png" || /\.png$/i.test(asset.filename.trim())
  );
}

async function assetIssues(
  db: D1Database,
  rules: readonly AssetRule[],
): Promise<ValidationIssue[]> {
  const ids = rules.map((rule) => rule.id).filter((id): id is string => !!id);
  if (ids.length === 0) return [];
  const assets = await getAssets(db, ids);
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    if (!rule.id) continue;
    const asset = assets.get(rule.id);
    if (asset?.state !== "ready") {
      issues.push({
        field: rule.field,
        code: "missing_asset",
        severity: "error",
        message: "This media asset no longer exists. Choose another one.",
      });
    } else if (asset.kind !== "image") {
      issues.push({
        field: rule.field,
        code: "wrong_asset_kind",
        severity: "error",
        message: "Choose an image here.",
      });
    } else if (rule.png && !isPng(asset)) {
      issues.push({
        field: rule.field,
        code: "wrong_asset_kind",
        severity: "error",
        message: "The favicon must be a PNG image.",
      });
    }
  }
  return issues;
}

function invalid(issues: ValidationIssue[]): CmsError {
  return new CmsError("invalid_content", { issues });
}

async function validateBrand(
  db: D1Database,
  input: unknown,
): Promise<BrandSettings> {
  const parsed = BrandSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalid(settingsIssues(parsed.error.issues));
  const value = parsed.data;
  const issues = [
    ...brandIssues(value, [
      "contactEmail",
      "contactEmailConfirmedAt",
      "redesignCopyAcknowledgedAt",
    ]),
    ...(await assetIssues(db, [
      { field: "portraitId", id: value.portraitId },
      { field: "logoId", id: value.logoId },
      { field: "faviconId", id: value.faviconId, png: true },
      ...value.brandAssetIds.map((id, index) => ({
        field: `brandAssetIds.${index}`,
        id,
      })),
    ])),
  ];
  if (issues.length > 0) throw invalid(issues);
  return value;
}

async function validateSite(
  db: D1Database,
  input: unknown,
): Promise<SiteSettings> {
  const parsed = SiteSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalid(settingsIssues(parsed.error.issues));
  const value = parsed.data;
  const issues = [
    ...brandIssues(value),
    ...(await assetIssues(db, [
      { field: "ogImageId", id: value.ogImageId },
      { field: "defaultSocialImageId", id: value.defaultSocialImageId },
    ])),
  ];
  if (issues.length > 0) throw invalid(issues);
  return value;
}

// ---- Writes ----------------------------------------------------------------

async function writeDocument(
  db: D1Database,
  key: SettingsKey,
  expectedRevision: number,
  value: unknown,
  now: Date,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO settings (key, data_json, revision, updated_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(key) DO UPDATE SET
         data_json = excluded.data_json,
         revision = settings.revision + 1,
         updated_at = excluded.updated_at
       WHERE settings.revision = ?4
       RETURNING revision`,
    )
    .bind(key, JSON.stringify(value), now.toISOString(), expectedRevision)
    .first<{ revision: number }>();
  if (!row) throw new CmsError("stale_revision");
  return row.revision;
}

async function indexUsage(
  db: D1Database,
  type: UsageEntityType & ("brand_settings" | "site_settings"),
  key: SettingsKey,
  value: BrandSettings | SiteSettings,
) {
  // Settings are live on save: their references count as published.
  const refs = extractAssetRefs(type, value);
  await syncUsages(db, type, key, { working: refs, published: refs });
}

export async function saveBrandSettings(
  db: D1Database,
  expectedRevision: number,
  input: unknown,
  now: Date = new Date(),
): Promise<{ revision: number; value: BrandSettings }> {
  const value = await validateBrand(db, input);
  const revision = await writeDocument(
    db,
    "brand",
    expectedRevision,
    value,
    now,
  );
  await indexUsage(db, "brand_settings", "brand", value);
  return { revision, value };
}

export async function saveSiteSettings(
  db: D1Database,
  expectedRevision: number,
  input: unknown,
  now: Date = new Date(),
): Promise<{ revision: number; value: SiteSettings }> {
  const value = await validateSite(db, input);
  const revision = await writeDocument(
    db,
    "site",
    expectedRevision,
    value,
    now,
  );
  await indexUsage(db, "site_settings", "site", value);
  return { revision, value };
}

// ---- Patches ----------------------------------------------------------------

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep merge for settings patches: objects merge key by key; arrays, scalars
 * and null replace. `undefined` leaves the stored value alone.
 */
export function mergeSettings(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (UNSAFE_KEYS.has(key) || value === undefined) continue;
    result[key] = mergeSettings(base[key], value);
  }
  return result;
}

const PROTECTED_BRAND_KEYS = [
  "schemaVersion",
  "contactEmailConfirmedAt",
  "redesignCopyAcknowledgedAt",
];

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function patchBrandSettings(
  db: D1Database,
  expectedRevision: number,
  patch: Record<string, unknown>,
  now: Date = new Date(),
  options: {
    confirmContactEmail?: boolean;
    acknowledgeRedesignCopy?: boolean;
  } = {},
): Promise<{ revision: number; value: BrandSettings }> {
  const current = (await readSettingsWithMeta(db)).brand.value;
  const { secondaryCtaEnabled, ...rest } = patch;
  const safe: Record<string, unknown> = { ...rest };
  for (const key of PROTECTED_BRAND_KEYS) delete safe[key];

  const merged = mergeSettings(current, safe) as Record<string, unknown>;
  if (secondaryCtaEnabled === false) merged.secondaryCta = null;

  // A changed address was typed deliberately: it counts as reviewed.
  if (
    "contactEmail" in safe &&
    normalizedEmail(safe.contactEmail) !== normalizedEmail(current.contactEmail)
  ) {
    merged.contactEmailConfirmedAt = normalizedEmail(safe.contactEmail)
      ? now.toISOString()
      : null;
  }
  if (options.confirmContactEmail) {
    merged.contactEmailConfirmedAt = now.toISOString();
  }
  if (options.acknowledgeRedesignCopy) {
    merged.redesignCopyAcknowledgedAt = now.toISOString();
  }
  return saveBrandSettings(db, expectedRevision, merged, now);
}

export async function patchSiteSettings(
  db: D1Database,
  expectedRevision: number,
  patch: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ revision: number; value: SiteSettings }> {
  const current = (await readSettingsWithMeta(db)).site.value;
  const { schemaVersion: _ignored, ...safe } = patch;
  return saveSiteSettings(
    db,
    expectedRevision,
    mergeSettings(current, safe),
    now,
  );
}

/** Keeps the address as it is and records that it was reviewed. */
export async function confirmContactEmail(
  db: D1Database,
  expectedRevision: number,
  now: Date = new Date(),
) {
  const current = (await readSettingsWithMeta(db)).brand.value;
  return saveBrandSettings(
    db,
    expectedRevision,
    { ...current, contactEmailConfirmedAt: now.toISOString() },
    now,
  );
}

/** Records that the copy migrated from the redesign has been reviewed. */
export async function acknowledgeRedesignCopy(
  db: D1Database,
  expectedRevision: number,
  now: Date = new Date(),
) {
  const current = (await readSettingsWithMeta(db)).brand.value;
  return saveBrandSettings(
    db,
    expectedRevision,
    { ...current, redesignCopyAcknowledgedAt: now.toISOString() },
    now,
  );
}

// ---- Settings screens (Studio → Settings → Brand / Site) ---------------------

async function assetSummaries(
  db: D1Database,
  env: Env,
  ids: ReadonlyArray<string | null>,
): Promise<Record<string, MediaSummary>> {
  const wanted = ids.filter((id): id is string => !!id);
  if (wanted.length === 0) return {};
  const config = readMediaConfig(env);
  const assets = await getAssets(db, wanted);
  return Object.fromEntries(
    [...assets.values()].map((asset) => [
      asset.id,
      toMediaSummary(asset, config),
    ]),
  );
}

export async function loadBrandScreen(db: D1Database, env: Env) {
  const settings = await readSettingsWithMeta(db);
  const brand = settings.brand;
  const [assets, categories] = await Promise.all([
    assetSummaries(db, env, [
      brand.value.portraitId,
      brand.value.logoId,
      brand.value.faviconId,
      ...brand.value.brandAssetIds,
    ]),
    listTerms(db, "project_category", { includeArchived: true }),
  ]);
  return {
    brand,
    contactNeedsReview: contactEmailNeedsReview(brand.value.contactEmail),
    assets,
    categories,
  };
}

export async function loadSiteScreen(db: D1Database, env: Env) {
  const settings = await readSettingsWithMeta(db);
  const site = settings.site;
  return {
    site,
    contactEmail: settings.brand.value.contactEmail,
    brandName: settings.brand.value.brandName,
    assets: await assetSummaries(db, env, [
      site.value.ogImageId,
      site.value.defaultSocialImageId,
    ]),
  };
}

const FORM_ONLY_KEYS = ["intent", "expectedRevision", "confirm"];

/**
 * Form → settings patch: drops form plumbing, turns empty asset pickers
 * ("") into null and removes empty entries from asset lists.
 */
export function settingsFormPatch(formData: FormData): Record<string, unknown> {
  const tree = formDataToObject(formData);
  for (const key of FORM_ONLY_KEYS) delete tree[key];
  for (const [key, value] of Object.entries(tree)) {
    if (key.endsWith("Id") && typeof value === "string" && !value.trim()) {
      tree[key] = null;
    }
    if (key.endsWith("Ids") && Array.isArray(value)) {
      tree[key] = value.filter(
        (item) => typeof item === "string" && item.trim() !== "",
      );
    }
  }
  return tree;
}

type ScreenActionArgs = {
  db: D1Database;
  formData: FormData | null;
  intent: string | null;
  now: Date;
};

const SAVED_LIVE = "Saved. Live on the site now.";

export async function handleBrandSettingsAction({
  db,
  formData,
  intent,
  now,
}: ScreenActionArgs) {
  const data = formData ?? new FormData();
  const revision = readExpectedRevision(data);
  try {
    if (revision === null) throw new CmsError("stale_revision");
    switch (intent) {
      case "save":
      case "confirm-contact-email":
      case "acknowledge-redesign-copy": {
        const saved = await patchBrandSettings(
          db,
          revision,
          settingsFormPatch(data),
          now,
          {
            confirmContactEmail: intent === "confirm-contact-email",
            acknowledgeRedesignCopy: intent === "acknowledge-redesign-copy",
          },
        );
        return actionOk({
          revision: saved.revision,
          message:
            intent === "confirm-contact-email"
              ? "Contact email confirmed"
              : intent === "acknowledge-redesign-copy"
                ? "Copy marked as reviewed"
                : SAVED_LIVE,
        });
      }
      default:
        return unknownIntent(intent);
    }
  } catch (error) {
    return cmsErrorResult(error);
  }
}

export async function handleSiteSettingsAction({
  db,
  formData,
  intent,
  now,
}: ScreenActionArgs) {
  const data = formData ?? new FormData();
  const revision = readExpectedRevision(data);
  try {
    if (revision === null) throw new CmsError("stale_revision");
    if (intent !== "save") return unknownIntent(intent);
    const saved = await patchSiteSettings(
      db,
      revision,
      settingsFormPatch(data),
      now,
    );
    return actionOk({ revision: saved.revision, message: SAVED_LIVE });
  } catch (error) {
    return cmsErrorResult(error);
  }
}
