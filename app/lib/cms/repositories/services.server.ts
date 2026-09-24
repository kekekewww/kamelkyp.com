/**
 * Studio services (content-schema §2.6, §5.3; admin-architecture §2.2, §4.4).
 *
 * Services are marketing content. Commission-linked rows (full mix, vocal mix,
 * song transitions) never hold a price: the Studio shows the active
 * `price_versions` rule read-only, the same rule the commission wizard locks
 * into a case, and prices change only in Pricing. Other services choose a
 * price mode; a number is never required (custom quote and contact carry
 * none, and only fixed / starting-from rows need one to publish).
 */
import { redirect } from "react-router";
import { getActivePriceRule } from "../../pricing/price-repository.server";
import { isServiceId } from "../../services/service-id";
import { CmsError } from "../db/errors";
import {
  archiveEntity,
  createEntity,
  deleteEntity,
  duplicateEntity,
  getEntity,
  type Loaded,
  publishEntity,
  reorder,
  restoreEntity,
  revertToPublished,
  saveEntity,
  setFeatured,
  unpublishEntity,
  validateEntity,
} from "../db/lifecycle.server";
import { formDataToObject, readExpectedRevision, readString } from "../forms";
import { parseLocalizedText } from "../localized";
import {
  type Currency,
  type PriceMode,
  type ServiceContent,
  ServiceDraftSchema,
  serviceContentToColumns,
} from "../schemas/service";
import type { Term } from "../schemas/taxonomy";
import {
  actionError,
  actionOk,
  cmsErrorResult,
  unknownIntent,
} from "../studio/responses";
import { listTerms } from "../taxonomy.server";
import type {
  EntityMeta,
  EntryStatus,
  LocalizedText,
  ValidationIssue,
} from "../types";

export type ServiceStatusFilter =
  | "active"
  | "draft"
  | "published"
  | "archived"
  | "all";

export type ServiceFilters = {
  q?: string | null;
  status?: ServiceStatusFilter | null;
  groupTermId?: string | null;
};

export type LivePrice = { baseTwd: number; versionId: string };

export type StudioServiceRow = {
  id: string;
  slug: string;
  name: LocalizedText;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  featuredOrder: number | null;
  sortOrder: number;
  groupTermId: string | null;
  commissionServiceId: string | null;
  priceMode: PriceMode;
  priceAmount: number | null;
  currency: Currency | null;
  /** Active price rule for commission rows (null otherwise or when none is active). */
  livePrice: LivePrice | null;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
};

type ServiceRow = {
  id: string;
  slug: string;
  name_i18n: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  featured_order: number | null;
  sort_order: number;
  group_term_id: string | null;
  commission_service_id: string | null;
  price_mode: PriceMode;
  price_amount: number | null;
  currency: Currency | null;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  updated_at: string;
};

const STATUS_SETS: Record<ServiceStatusFilter, EntryStatus[]> = {
  active: ["draft", "published"],
  draft: ["draft"],
  published: ["published"],
  archived: ["archived"],
  all: ["draft", "published", "archived"],
};

export function parseStatusFilter(
  value: string | null | undefined,
): ServiceStatusFilter {
  return value && value in STATUS_SETS
    ? (value as ServiceStatusFilter)
    : "active";
}

/** Active price rule for a commission service; null when none is active. */
export async function livePriceFor(
  db: D1Database,
  commissionServiceId: string | null | undefined,
  now: Date,
): Promise<LivePrice | null> {
  if (!commissionServiceId || !isServiceId(commissionServiceId)) return null;
  try {
    const rule = await getActivePriceRule(
      db,
      commissionServiceId,
      now.toISOString(),
    );
    return { baseTwd: rule.baseTwd, versionId: rule.versionId };
  } catch {
    return null;
  }
}

export async function listStudioServices(
  db: D1Database,
  filters: ServiceFilters,
  now: Date,
): Promise<StudioServiceRow[]> {
  const statuses = STATUS_SETS[filters.status ?? "active"];
  const q = filters.q?.trim().toLowerCase() || null;
  const rows = await db
    .prepare(
      `SELECT id, slug, name_i18n, status, todo_content, featured, featured_order, sort_order,
              group_term_id, commission_service_id, price_mode, price_amount, currency,
              revision, published_revision, (published_json IS NOT NULL) AS has_snapshot, updated_at
       FROM services
       WHERE status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(lower(name_i18n || ' ' || short_description_i18n || ' ' ||
              description_i18n || ' ' || slug), ?2) > 0)
         AND (?3 IS NULL OR group_term_id = ?3)
       ORDER BY sort_order, updated_at DESC, id`,
    )
    .bind(JSON.stringify(statuses), q, filters.groupTermId || null)
    .all<ServiceRow>();

  return Promise.all(
    rows.results.map(async (row) => ({
      id: row.id,
      slug: row.slug,
      name: parseLocalizedText(row.name_i18n),
      status: row.status,
      todoContent: row.todo_content === 1,
      featured: row.featured === 1,
      featuredOrder: row.featured_order,
      sortOrder: row.sort_order,
      groupTermId: row.group_term_id,
      commissionServiceId: row.commission_service_id,
      priceMode: row.price_mode,
      priceAmount: row.price_amount,
      currency: row.currency,
      livePrice: await livePriceFor(db, row.commission_service_id, now),
      hasUnpublishedChanges:
        row.has_snapshot === 1 &&
        row.published_revision !== null &&
        row.revision !== row.published_revision,
      updatedAt: row.updated_at,
    })),
  );
}

export async function loadServiceList(db: D1Database, url: URL, now: Date) {
  const filters = {
    q: url.searchParams.get("q") ?? "",
    status: parseStatusFilter(url.searchParams.get("status")),
    groupTermId: url.searchParams.get("group") ?? "",
  };
  const [rows, groups] = await Promise.all([
    listStudioServices(db, filters, now),
    listTerms(db, "service_group", { includeArchived: true }),
  ]);
  return { rows, groups, filters };
}

// ---- Form parsing -----------------------------------------------------------

const PRICED_MODES: readonly PriceMode[] = ["fixed", "starting_from"];

/**
 * Editor form → draft input. Custom quote and contact never keep a number;
 * the commission link is never taken from a form (it is seed-only).
 */
export function parseServiceForm(formData: FormData): {
  input: Record<string, unknown>;
  expectedRevision: number | null;
  clearTodoContent: boolean;
} {
  const raw = formDataToObject(formData);
  const {
    expectedRevision: _revision,
    intent: _intent,
    clearTodoContent,
    confirm: _confirm,
    ...content
  } = raw;
  const mode = content.priceMode;
  if (typeof mode !== "string" || !PRICED_MODES.includes(mode as PriceMode)) {
    content.priceAmount = null;
    content.currency = null;
  }
  content.commissionServiceId = null;
  return {
    input: content,
    expectedRevision: readExpectedRevision(formData),
    clearTodoContent: clearTodoContent === true,
  };
}

function hasContentFields(formData: FormData): boolean {
  return formData.has("name.zh") || formData.has("name.en");
}

function sameContent(
  a: ServiceContent,
  b: ServiceContent,
  commissionLinked: boolean,
): boolean {
  return (
    JSON.stringify(serviceContentToColumns(a, { commissionLinked })) ===
    JSON.stringify(serviceContentToColumns(b, { commissionLinked }))
  );
}

/**
 * Saves the form's working copy unless it matches what is stored, so Save
 * with nothing changed, Feature or Unpublish never bump the revision or
 * create phantom "unpublished changes".
 */
async function saveFromForm(
  db: D1Database,
  loaded: Loaded<"service">,
  formData: FormData,
  now: Date,
): Promise<EntityMeta> {
  const parsed = parseServiceForm(formData);
  const draft = ServiceDraftSchema.safeParse(parsed.input);
  const linked = Boolean(loaded.meta.commissionServiceId);
  const unchanged =
    draft.success &&
    !parsed.clearTodoContent &&
    sameContent(
      {
        ...draft.data,
        slug: linked
          ? loaded.content.slug
          : draft.data.slug || loaded.content.slug,
      },
      loaded.content,
      linked,
    );
  if (unchanged) return loaded.meta;
  if (parsed.expectedRevision === null) {
    throw new CmsError("invalid_content", {
      issues: [
        {
          field: "expectedRevision",
          code: "invalid_value",
          severity: "error",
          message: "Reload the page and try again.",
        },
      ],
    });
  }
  return saveEntity(
    db,
    "service",
    loaded.meta.id,
    parsed.expectedRevision,
    parsed.input as unknown as ServiceContent,
    now,
    { clearTodoContent: parsed.clearTodoContent },
  );
}

// ---- Loaders ---------------------------------------------------------------

export type ServiceEditorData = {
  meta: EntityMeta;
  content: ServiceContent;
  published: ServiceContent | null;
  issues: ValidationIssue[];
  groups: Term[];
  livePrice: LivePrice | null;
};

export async function loadServiceEditor(
  db: D1Database,
  id: string,
  now: Date,
): Promise<ServiceEditorData> {
  const loaded = await getEntity(db, "service", id);
  if (!loaded) throw new Response("Not Found", { status: 404 });
  const [issues, groups, livePrice] = await Promise.all([
    validateEntity(db, "service", id),
    listTerms(db, "service_group", { includeArchived: true }),
    livePriceFor(db, loaded.meta.commissionServiceId, now),
  ]);
  return {
    meta: loaded.meta,
    content: loaded.content,
    published: loaded.published,
    issues,
    groups,
    livePrice,
  };
}

// ---- Actions ---------------------------------------------------------------

type ActionArgs = {
  db: D1Database;
  formData: FormData | null;
  intent: string | null;
  now: Date;
};

/** `/studio/services/new`: a draft from a name (either locale) and a group. */
export async function createServiceFromForm({
  db,
  formData,
  now,
}: Omit<ActionArgs, "intent">) {
  const data = formData ?? new FormData();
  const name = {
    zh: (readString(data, "name.zh") ?? "").trim(),
    en: (readString(data, "name.en") ?? "").trim(),
  };
  if (!name.zh && !name.en) {
    return actionError("invalid_content", {
      status: 422,
      message: "Enter a name in ZH or EN.",
      issues: [
        {
          field: "name",
          code: "required",
          severity: "error",
          message: "Enter a name in ZH or EN.",
        },
      ],
    });
  }
  try {
    const meta = await createEntity(
      db,
      "service",
      {
        name,
        groupTermId: readString(data, "groupTermId") || null,
        priceMode: "contact",
      },
      { now },
    );
    return redirect(`/studio/services/${meta.id}`, 303);
  } catch (error) {
    return cmsErrorResult(error);
  }
}

function readId(formData: FormData | null): string | null {
  const id = formData ? readString(formData, "id") : null;
  return id?.trim() ? id.trim() : null;
}

function readIds(formData: FormData | null): string[] | null {
  const raw = formData ? readString(formData, "ids") : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

const MISSING_ID = () =>
  actionError("invalid_content", {
    status: 422,
    message: "Choose a service first.",
  });

/** List page: placement and status changes without the editor form. */
export async function handleServiceListAction({
  db,
  formData,
  intent,
  now,
}: ActionArgs) {
  try {
    if (intent === "reorder") {
      const ids = readIds(formData);
      if (!ids || ids.length === 0) {
        return actionError("invalid_content", {
          status: 422,
          message: "The new order could not be read.",
        });
      }
      await reorder(db, "service", ids, "sort_order");
      return actionOk({ message: "Order saved" });
    }
    const id = readId(formData);
    if (!id) return MISSING_ID();
    switch (intent) {
      case "feature":
      case "unfeature":
        await setFeatured(db, "service", id, intent === "feature");
        return actionOk({
          message:
            intent === "feature"
              ? "Added to homepage highlights"
              : "Removed from homepage highlights",
        });
      case "archive":
        return actionOk({
          meta: await archiveEntity(db, "service", id, now),
          message: "Archived",
        });
      case "restore":
        return actionOk({
          meta: await restoreEntity(db, "service", id, now),
          message: "Restored to draft",
        });
      case "duplicate": {
        const copy = await duplicateEntity(db, "service", id, now);
        return redirect(`/studio/services/${copy.id}`, 303);
      }
      default:
        return unknownIntent(intent);
    }
  } catch (error) {
    return cmsErrorResult(error);
  }
}

const EDITOR_INTENTS = new Set([
  "save",
  "publish",
  "unpublish",
  "archive",
  "restore",
  "revert",
  "duplicate",
  "delete",
  "feature",
  "unfeature",
]);

/** Editor page: every button posts the whole form with its intent. */
export async function handleServiceEditorAction({
  db,
  id,
  formData,
  intent,
  now,
}: ActionArgs & { id: string }) {
  if (!intent || !EDITOR_INTENTS.has(intent)) return unknownIntent(intent);
  const data = formData ?? new FormData();
  try {
    const loaded = await getEntity(db, "service", id);
    if (!loaded) throw new CmsError("not_found");
    const linked = Boolean(loaded.meta.commissionServiceId);

    if (intent === "delete") {
      if (linked) throw new CmsError("commission_service_delete_forbidden");
      await deleteEntity(db, "service", id, readString(data, "confirm") ?? "");
      return actionOk({ redirectTo: "/studio/services", message: "Deleted" });
    }
    if (intent === "archive" && linked) {
      throw new CmsError("commission_service_archive_forbidden");
    }
    if (intent === "revert") {
      const expected = readExpectedRevision(data) ?? loaded.meta.revision;
      const meta = await revertToPublished(db, "service", id, expected, now);
      return actionOk({
        meta,
        reverted: true,
        message: "Reverted to the published version",
      });
    }

    const meta = hasContentFields(data)
      ? await saveFromForm(db, loaded, data, now)
      : loaded.meta;

    switch (intent) {
      case "save":
        return actionOk({ meta, message: "Saved" });
      case "publish": {
        const outcome = await publishEntity(
          db,
          "service",
          id,
          meta.revision,
          now,
        );
        if (!outcome.ok) {
          const blocking = outcome.issues.filter(
            (issue) => issue.severity === "error",
          ).length;
          return actionOk({
            meta,
            published: false,
            issues: outcome.issues,
            message: `Saved. Publishing is blocked by ${blocking} ${
              blocking === 1 ? "issue" : "issues"
            }.`,
          });
        }
        return actionOk({
          meta: outcome.meta,
          published: true,
          message: "Published",
        });
      }
      case "unpublish":
        return actionOk({
          meta: await unpublishEntity(db, "service", id, now),
          message: "Unpublished",
        });
      case "archive":
        return actionOk({
          meta: await archiveEntity(db, "service", id, now),
          message: "Archived",
        });
      case "restore":
        return actionOk({
          meta: await restoreEntity(db, "service", id, now),
          message: "Restored to draft",
        });
      case "duplicate": {
        const copy = await duplicateEntity(db, "service", id, now);
        return actionOk({
          meta,
          redirectTo: `/studio/services/${copy.id}`,
          message: "Duplicated as a draft",
        });
      }
      case "feature":
      case "unfeature":
        await setFeatured(db, "service", id, intent === "feature");
        return actionOk({
          meta,
          message:
            intent === "feature"
              ? "Added to homepage highlights"
              : "Removed from homepage highlights",
        });
      default:
        return unknownIntent(intent);
    }
  } catch (error) {
    return cmsErrorResult(error);
  }
}
