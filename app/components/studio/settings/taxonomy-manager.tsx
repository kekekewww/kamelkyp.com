/**
 * Studio → Settings → Taxonomies (content-architecture §3.10, admin §4.9).
 * One vocabulary at a time: rename (ZH/EN), change the slug, choose the
 * service area of a service group, reorder with explicit controls, archive
 * (hidden from pickers and public filters) and delete only when unused.
 * Every change is live on save; terms have no draft state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { TaxonomyTermRow } from "../../../lib/cms/repositories/taxonomies.server";
import type { Vocabulary } from "../../../lib/cms/schemas/taxonomy";
import { StudioPage } from "../shell/studio-page";
import {
  ConfirmDialog,
  CsrfField,
  OrderControls,
  useKeyboardReorder,
  useStudioSession,
} from "../ui";
import { type ActionData, useActionToasts } from "./form-kit";

const VOCABULARY_HINT: Record<Vocabulary, string> = {
  project_category:
    "Project categories power the /works filters and the capability links.",
  recognition_type:
    "Recognition types group awards, publications, talks and other entries.",
  service_group:
    "Service groups organise the services list; the area decides which service page lists them.",
  writing_category: "Writing categories label posts and external articles.",
};

const AREAS = [
  { value: "mixing", label: "Mixing page (/mixing)" },
  { value: "song_transition", label: "Song transition page" },
  { value: "software", label: "Software page (/services/software)" },
];

function AreaSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="studio-taxonomy__field">
      <span className="studio-taxonomy__label">Service area</span>
      <select
        name="data.area"
        className="studio-input studio-select"
        defaultValue={defaultValue ?? ""}
        required
      >
        <option value="" disabled>
          Choose…
        </option>
        {AREAS.map((area) => (
          <option key={area.value} value={area.value}>
            {area.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabelInputs({
  zh = "",
  en = "",
  slug,
}: {
  zh?: string;
  en?: string;
  slug?: string;
}) {
  return (
    <>
      <label className="studio-taxonomy__field">
        <span className="studio-taxonomy__label">ZH</span>
        <input
          className="studio-input"
          name="label.zh"
          lang="zh-Hant"
          defaultValue={zh}
          maxLength={80}
          required
        />
      </label>
      <label className="studio-taxonomy__field">
        <span className="studio-taxonomy__label">EN</span>
        <input
          className="studio-input"
          name="label.en"
          lang="en"
          defaultValue={en}
          maxLength={80}
          required
        />
      </label>
      <label className="studio-taxonomy__field">
        <span className="studio-taxonomy__label">Slug</span>
        <input
          className="studio-input studio-taxonomy__slug"
          name="slug"
          defaultValue={slug ?? ""}
          placeholder={slug === undefined ? "from EN label" : undefined}
          spellCheck={false}
          autoComplete="off"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={96}
          required={slug !== undefined}
        />
      </label>
    </>
  );
}

function TermRow({
  term,
  vocabulary,
  handle,
  onDelete,
}: {
  term: TaxonomyTermRow;
  vocabulary: Vocabulary;
  handle?: React.ReactNode;
  onDelete: (term: TaxonomyTermRow) => void;
}) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const pending = fetcher.state !== "idle";
  const intent = pending ? fetcher.formData?.get("intent") : null;
  const error =
    fetcher.state === "idle" && fetcher.data?.ok === false
      ? fetcher.data.message
      : null;
  const archived = Boolean(term.archivedAt);
  return (
    <li
      className="studio-taxonomy__row"
      data-archived={archived ? "" : undefined}
    >
      {handle ? <div className="studio-taxonomy__handle">{handle}</div> : null}
      <fetcher.Form method="post" className="studio-taxonomy__form">
        <CsrfField />
        <input type="hidden" name="id" value={term.id} />
        <LabelInputs zh={term.label.zh} en={term.label.en} slug={term.slug} />
        {vocabulary === "service_group" ? (
          <AreaSelect
            defaultValue={
              typeof term.data.area === "string" ? term.data.area : undefined
            }
          />
        ) : null}
        <span className="studio-taxonomy__usage">
          {term.usage > 0
            ? `Used by ${term.usage}`
            : archived
              ? "Archived"
              : "Not used"}
        </span>
        <div className="studio-taxonomy__actions">
          <button
            type="submit"
            name="intent"
            value="update"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={intent === "update" || undefined}
          >
            {intent === "update" ? "Saving…" : "Save"}
          </button>
          <button
            type="submit"
            name="intent"
            value={archived ? "restore" : "archive"}
            className="studio-btn studio-btn--ghost studio-btn--compact"
            formNoValidate
          >
            {archived ? "Restore" : "Archive"}
          </button>
          {term.usage === 0 ? (
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => onDelete(term)}
            >
              Delete
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="studio-field__error" role="alert">
            {error}
          </p>
        ) : null}
      </fetcher.Form>
    </li>
  );
}

function AddTerm({ vocabulary }: { vocabulary: Vocabulary }) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const [formKey, setFormKey] = useState(0);
  const error =
    fetcher.state === "idle" && fetcher.data?.ok === false
      ? fetcher.data.message
      : null;
  // Clear the inputs once the new term is saved (errors keep what was typed).
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setFormKey((key) => key + 1);
    }
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      key={formKey}
      method="post"
      className="studio-taxonomy__add"
      aria-label="Add a term"
    >
      <CsrfField />
      <input type="hidden" name="vocabulary" value={vocabulary} />
      <p className="studio-section-label">Add a term</p>
      <LabelInputs />
      {vocabulary === "service_group" ? <AreaSelect /> : null}
      <button
        type="submit"
        name="intent"
        value="create"
        className="studio-btn studio-btn--primary studio-btn--compact"
        aria-busy={fetcher.state !== "idle" || undefined}
      >
        Add
      </button>
      {error ? (
        <p className="studio-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </fetcher.Form>
  );
}

export function TaxonomyManager({
  vocabulary,
  vocabularies,
  terms,
}: {
  vocabulary: Vocabulary;
  vocabularies: Array<{ key: Vocabulary; label: string }>;
  terms: TaxonomyTermRow[];
}) {
  const orderFetcher = useFetcher<ActionData>();
  const deleteFetcher = useFetcher<ActionData>();
  useActionToasts(orderFetcher);
  useActionToasts(deleteFetcher);
  const { csrfToken } = useStudioSession();
  const [deleting, setDeleting] = useState<TaxonomyTermRow | null>(null);

  const active = useMemo(
    () => terms.filter((term) => !term.archivedAt),
    [terms],
  );
  const archived = terms.filter((term) => term.archivedAt);
  const byId = useMemo(
    () => new Map(terms.map((term) => [term.id, term] as const)),
    [terms],
  );
  const ids = useMemo(() => active.map((term) => term.id), [active]);
  const labelOf = useCallback(
    (id: string) => byId.get(id)?.label.en ?? "term",
    [byId],
  );
  const onCommit = useCallback(
    (order: string[]) =>
      orderFetcher.submit(
        {
          csrfToken,
          intent: "reorder",
          vocabulary,
          ids: JSON.stringify(order),
        },
        { method: "post" },
      ),
    [orderFetcher, csrfToken, vocabulary],
  );
  const reorder = useKeyboardReorder({ ids, labelOf, onCommit });
  const current = vocabularies.find((item) => item.key === vocabulary);

  return (
    <StudioPage
      title="Taxonomies"
      breadcrumb={<Link to="/studio/settings">Settings</Link>}
    >
      <nav className="studio-taxonomy__tabs" aria-label="Vocabularies">
        {vocabularies.map((item) => (
          <Link
            key={item.key}
            className="studio-taxonomy__tab"
            to={`/studio/settings/taxonomies?vocabulary=${item.key}`}
            aria-current={item.key === vocabulary ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="studio-hint">
        {VOCABULARY_HINT[vocabulary]} Changes are live on save. Archive a term
        that is in use; delete only unused ones.
      </p>
      <section
        className="studio-taxonomy"
        aria-label={current?.label ?? "Terms"}
      >
        {active.length === 0 ? (
          <p className="studio-taxonomy__empty">
            No terms yet. Add the first one below.
          </p>
        ) : (
          <ol className="studio-taxonomy__list">
            {reorder.order.map((id, index) => {
              const term = byId.get(id);
              if (!term) return null;
              return (
                <TermRow
                  key={term.id}
                  term={term}
                  vocabulary={vocabulary}
                  onDelete={setDeleting}
                  handle={
                    <OrderControls
                      label={labelOf(id)}
                      index={index}
                      total={reorder.order.length}
                      picked={reorder.picked === id}
                      onMove={(delta) => reorder.move(id, delta)}
                      handleProps={reorder.handleProps(id)}
                    />
                  }
                />
              );
            })}
          </ol>
        )}
        <p className="visually-hidden" aria-live="assertive">
          {reorder.announcement}
        </p>
        <AddTerm vocabulary={vocabulary} />
        {archived.length > 0 ? (
          <details className="studio-taxonomy__archived">
            <summary className="studio-section-label">
              Archived ({archived.length})
            </summary>
            <ol className="studio-taxonomy__list">
              {archived.map((term) => (
                <TermRow
                  key={term.id}
                  term={term}
                  vocabulary={vocabulary}
                  onDelete={setDeleting}
                />
              ))}
            </ol>
          </details>
        ) : null}
      </section>
      {deleting ? (
        <ConfirmDialog
          open
          tone="danger"
          title={`Delete “${deleting.label.en || deleting.label.zh}”?`}
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="studio-btn studio-btn--danger-filled studio-btn--compact"
                onClick={() => {
                  deleteFetcher.submit(
                    { csrfToken, intent: "delete", id: deleting.id },
                    { method: "post" },
                  );
                  setDeleting(null);
                }}
              >
                Delete term
              </button>
            </>
          }
        >
          <p>
            Nothing uses this term. Deleting removes it for good; archive keeps
            it recoverable.
          </p>
        </ConfirmDialog>
      ) : null}
    </StudioPage>
  );
}
