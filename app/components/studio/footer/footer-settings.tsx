/**
 * KAMEL STUDIO → Settings → Footer (wp3 spec §4.5). Save = live. The owner
 * orders every footer group, shows or hides it, edits its labels, and keeps
 * the links of custom groups; the preview shows the saved public footer.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBlocker, useFetcher, useRevalidator } from "react-router";
import type {
  FooterScreenSources,
  StudioFooterGroup,
} from "../../../lib/cms/schemas/footer";
import { FOOTER_LIMITS } from "../../../lib/cms/schemas/footer";
import { StudioPage } from "../shell/studio-page";
import {
  ConfirmDialog,
  LocalizedTextField,
  StudioForm,
  serializeForm,
  useKeyboardReorder,
  useStudioSession,
  useToast,
} from "../ui";
import type { FooterFailure } from "./footer-group-editor";
import { FooterGroupRow, type FooterResult } from "./footer-group-row";
import { footerGroupName } from "./footer-model";
import { FooterPreview } from "./footer-preview";

type Reorder = ReturnType<typeof useKeyboardReorder>;

/**
 * Owns only the reorder state and hands it to the list. The list keys it by
 * the failed-reorder count, so a failed reorder restarts it from the server
 * order (the hook's reducer resets only when the server id list changes,
 * which a failure does not do) while the rows stay mounted: open editors
 * keep their unsaved edits and a save in flight still gets its answer.
 */
function ReorderState({
  ids,
  labelOf,
  onCommit,
  onChange,
}: {
  ids: string[];
  labelOf: (id: string) => string;
  onCommit: (ids: string[]) => void;
  onChange: (reorder: Reorder) => void;
}) {
  const { order, picked, move, handleProps, announcement } = useKeyboardReorder(
    { ids, labelOf, onCommit },
  );
  // Before paint, so the list never shows an order the hook has left.
  useLayoutEffect(() => {
    onChange({ order, picked, move, handleProps, announcement });
  }, [order, picked, move, handleProps, announcement, onChange]);
  return null;
}

/** The ordered list; `resetKey` restarts only the reorder state. */
function FooterGroupList({
  groups,
  sources,
  resetKey,
  onCommit,
  openIds,
  onOpenChange,
  onDirty,
  onDelete,
  deletingId,
}: {
  groups: readonly StudioFooterGroup[];
  sources: FooterScreenSources;
  resetKey: number;
  onCommit: (ids: string[]) => void;
  openIds: ReadonlySet<string>;
  onOpenChange: (id: string, open: boolean) => void;
  onDirty: (id: string, dirty: boolean) => void;
  onDelete: (group: StudioFooterGroup) => void;
  deletingId: string | null;
}) {
  const ids = useMemo(() => groups.map((group) => group.id), [groups]);
  const byId = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const labelOf = useCallback(
    (id: string) => {
      const group = byId.get(id);
      return group ? footerGroupName(group) : id;
    },
    [byId],
  );
  // Null until the reorder state has rendered once (server render, hydration).
  const [reorder, setReorder] = useState<Reorder | null>(null);
  const ordered = (reorder?.order ?? ids)
    .map((id) => byId.get(id))
    .filter((group): group is StudioFooterGroup => Boolean(group));
  return (
    <>
      <ReorderState
        key={resetKey}
        ids={ids}
        labelOf={labelOf}
        onCommit={onCommit}
        onChange={setReorder}
      />
      <ol className="studio-footer__list" aria-label="Footer groups">
        {ordered.map((group, index) => (
          <FooterGroupRow
            key={group.id}
            group={group}
            sources={sources}
            order={{
              index,
              total: ordered.length,
              picked: reorder?.picked === group.id,
              onMove: (delta) => reorder?.move(group.id, delta),
              handleProps: reorder?.handleProps(group.id) ?? {},
            }}
            open={openIds.has(group.id)}
            onOpenChange={onOpenChange}
            onDirty={onDirty}
            onDelete={onDelete}
            deleting={deletingId === group.id}
          />
        ))}
      </ol>
      <p className="visually-hidden" aria-live="assertive">
        {reorder?.announcement ?? ""}
      </p>
    </>
  );
}

function AddGroup({
  customCount,
  onDirty,
}: {
  customCount: number;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const fetcher = useFetcher<FooterResult>();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const handled = useRef<unknown>(null);
  const [epoch, setEpoch] = useState(0);
  const full = customCount >= FOOTER_LIMITS.customGroups;

  // Each fresh form is the baseline: the first one, the one after an add and
  // the one that comes back when a deletion brings the footer under the cap.
  // Without a form (at the cap) nothing here is unsaved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-baseline each fresh form
  useEffect(() => {
    const form = full ? null : formRef.current;
    baseline.current = form ? serializeForm(new FormData(form)) : null;
    if (!form) onDirty("new", false);
  }, [epoch, full, onDirty]);

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (result.ok && result.group) {
      onDirty("new", false);
      toast.show({ message: `Added “${footerGroupName(result.group)}”` });
      setEpoch((value) => value + 1);
    } else if (!result.ok && !result.issues?.length) {
      toast.show({ tone: "error", message: result.message });
    }
  }, [fetcher.state, fetcher.data, toast, onDirty]);

  const failed: FooterFailure | null =
    fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const issueFor = (locale: "zh" | "en") =>
    failed?.issues?.find(
      (issue) => issue.field === "label" && issue.locale === locale,
    )?.message;
  const errors =
    issueFor("zh") || issueFor("en")
      ? {
          ...(issueFor("zh") ? { zh: issueFor("zh") } : {}),
          ...(issueFor("en") ? { en: issueFor("en") } : {}),
        }
      : undefined;
  const adding = fetcher.state !== "idle";

  return (
    <section className="studio-footer__add" aria-labelledby="studio-footer-add">
      <h2 className="studio-section-label" id="studio-footer-add">
        Add a group
      </h2>
      {full ? (
        <p className="studio-hint">
          The footer holds at most 20 custom groups.
        </p>
      ) : (
        <StudioForm
          key={epoch}
          fetcher={fetcher as never}
          ref={formRef}
          className="studio-footer__add-form"
          data-footer-group=""
          aria-label="New footer group"
          noValidate
          onInput={(event) =>
            onDirty(
              "new",
              serializeForm(new FormData(event.currentTarget)) !==
                baseline.current,
            )
          }
        >
          <LocalizedTextField
            name="label"
            label="Group label"
            maxLength={FOOTER_LIMITS.groupLabel}
            errors={errors as Partial<Record<"zh" | "en", string>> | undefined}
            hint="Required in ZH and EN. New groups go before Find Me, Contact and Legal. A group appears in the footer once it has a shown link."
          />
          <div className="studio-footer__actions">
            <label className="studio-footer__enable">
              <input type="hidden" name="enabled:bool" value="false" />
              <input
                type="checkbox"
                name="enabled:bool"
                value="true"
                defaultChecked
              />
              Show on the site
            </label>
            <button
              type="submit"
              name="intent"
              value="save-group"
              className="studio-btn studio-btn--primary studio-btn--compact"
              aria-busy={adding || undefined}
            >
              {adding ? "Adding…" : "Add group"}
            </button>
          </div>
        </StudioForm>
      )}
    </section>
  );
}

export function FooterSettings({
  groups,
  sources,
}: {
  groups: readonly StudioFooterGroup[];
  sources: FooterScreenSources;
}) {
  const reorderFetcher = useFetcher<FooterResult>();
  const remover = useFetcher<FooterResult>();
  const revalidator = useRevalidator();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const [dirtyRows, setDirtyRows] = useState<ReadonlySet<string>>(new Set());
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [resetKey, setResetKey] = useState(0);
  const reordered = useRef<unknown>(null);
  const removed = useRef<unknown>(null);
  const removing = useRef<string>("");

  const onDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyRows((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onOpenChange = useCallback((id: string, open: boolean) => {
    setOpenIds((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const commit = useCallback(
    (ids: string[]) =>
      reorderFetcher.submit(
        { csrfToken, intent: "reorder", ids: JSON.stringify(ids) },
        { method: "post", preventScrollReset: true },
      ),
    [reorderFetcher, csrfToken],
  );

  useEffect(() => {
    const result = reorderFetcher.data;
    if (
      reorderFetcher.state !== "idle" ||
      !result ||
      reordered.current === result
    ) {
      return;
    }
    reordered.current = result;
    if (result.ok) toast.show({ message: "Order saved" });
    else {
      toast.show({ tone: "error", message: result.message });
      setResetKey((value) => value + 1);
    }
  }, [reorderFetcher.state, reorderFetcher.data, toast]);

  const onDelete = useCallback(
    (group: StudioFooterGroup) => {
      removing.current = footerGroupName(group);
      remover.submit(
        { csrfToken, intent: "delete-group", id: group.id },
        { method: "post", preventScrollReset: true },
      );
    },
    [remover, csrfToken],
  );

  useEffect(() => {
    const result = remover.data;
    if (remover.state !== "idle" || !result || removed.current === result) {
      return;
    }
    removed.current = result;
    toast.show(
      result.ok
        ? { message: `Deleted “${removing.current}”` }
        : { tone: "error", message: result.message },
    );
    // Gone elsewhere: show the current list.
    if (!result.ok && result.code === "not_found") revalidator.revalidate();
  }, [remover.state, remover.data, toast, revalidator]);

  // Mod+S saves the group form that has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      const form = (
        document.activeElement as HTMLElement | null
      )?.closest<HTMLFormElement>("form[data-footer-group]");
      const button = form?.querySelector<HTMLButtonElement>(
        'button[type="submit"][name="intent"]',
      );
      if (form && button) form.requestSubmit(button);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dirty = dirtyRows.size > 0;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const deletingId =
    remover.state !== "idle"
      ? String(remover.formData?.get("id") ?? "") || null
      : null;
  const visible = useMemo(
    () => groups.filter((group) => group.id !== deletingId),
    [groups, deletingId],
  );
  const customCount = groups.filter((group) => group.kind === "custom").length;

  return (
    <StudioPage title="Footer">
      <p className="p3-intro">
        Every change is live when you save it. Groups appear in the site footer
        in this order; hidden groups and groups without links are left out.
      </p>
      <div className="studio-footer">
        <div className="studio-footer__main">
          <FooterGroupList
            resetKey={resetKey}
            groups={visible}
            sources={sources}
            onCommit={commit}
            openIds={openIds}
            onOpenChange={onOpenChange}
            onDirty={onDirty}
            onDelete={onDelete}
            deletingId={deletingId}
          />
          <AddGroup customCount={customCount} onDirty={onDirty} />
        </div>
        <FooterPreview groups={groups} sources={sources} />
      </div>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        onClose={() => blocker.reset?.()}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => blocker.reset?.()}
            >
              Stay
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => blocker.proceed?.()}
            >
              Discard changes
            </button>
          </>
        }
      >
        <p>
          {dirtyRows.size} {dirtyRows.size === 1 ? "group has" : "groups have"}{" "}
          unsaved edits. Save each group, or leave and lose them.
        </p>
      </ConfirmDialog>
    </StudioPage>
  );
}
