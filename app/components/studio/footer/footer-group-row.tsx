/**
 * One footer group in the Studio list (wp3 spec §4.5): order controls, name,
 * kind, the immediate Shown/Hidden switch with Undo (Legal: "Always shown"),
 * the editor disclosure and, for custom groups, Delete with confirmation.
 * Toasts and states follow the identity of each fetcher's `data`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type {
  FooterScreenSources,
  StudioFooterGroup,
} from "../../../lib/cms/schemas/footer";
import {
  ConfirmDialog,
  OrderControls,
  useStudioSession,
  useToast,
} from "../ui";
import { type FooterFailure, FooterGroupEditor } from "./footer-group-editor";
import {
  FOOTER_KIND_TAGS,
  footerGroupName,
  footerGroupZhName,
  isLeftOut,
  shownLinksSummary,
} from "./footer-model";

export type FooterResult =
  | { ok: true; intent: string; group?: StudioFooterGroup; id?: string }
  | FooterFailure;

export type OrderProps = {
  index: number;
  total: number;
  picked: boolean;
  onMove: (delta: number) => void;
  handleProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
};

function VisibilitySwitch({
  name,
  shown,
  onToggle,
}: {
  name: string;
  shown: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      className="p3-switch"
      onClick={() => onToggle(!shown)}
    >
      <span className="p3-switch__track" aria-hidden="true">
        <span className="p3-switch__thumb" />
      </span>
      <span className="p3-switch__label">
        {shown ? "Shown" : "Hidden"}
        <span className="visually-hidden">{` in the footer: ${name}`}</span>
      </span>
    </button>
  );
}

export function FooterGroupRow({
  group,
  sources,
  order,
  open,
  onOpenChange,
  onDirty,
  onDelete,
  deleting,
}: {
  group: StudioFooterGroup;
  sources: FooterScreenSources;
  order: OrderProps;
  open: boolean;
  onOpenChange: (id: string, open: boolean) => void;
  onDirty: (id: string, dirty: boolean) => void;
  /** Deletes through the list's fetcher (the row is gone when it answers). */
  onDelete: (group: StudioFooterGroup) => void;
  deleting: boolean;
}) {
  const saver = useFetcher<FooterResult>();
  const toggler = useFetcher<FooterResult>();
  const revalidator = useRevalidator();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  // The last failed save and the version of the group it was made from.
  const [failure, setFailure] = useState<{
    result: FooterFailure;
    fingerprint: string;
  } | null>(null);
  // Successful saves. Part of the editor's key: a save whose values normalize
  // to the stored ones keeps the fingerprint, yet the editor must still show
  // the stored values and count as clean.
  const [saves, setSaves] = useState(0);
  const saved = useRef<unknown>(null);
  const toggled = useRef<unknown>(null);
  const name = footerGroupName(group);
  const zhName = footerGroupZhName(group);
  const custom = group.kind === "custom";

  useEffect(() => {
    const result = saver.data;
    if (saver.state !== "idle" || !result || saved.current === result) return;
    saved.current = result;
    if (result.ok) {
      setFailure(null);
      setSaves((count) => count + 1);
      toast.show({
        message: `Saved “${result.group ? footerGroupName(result.group) : name}”`,
      });
      return;
    }
    setFailure({ result, fingerprint: group.fingerprint });
    if (result.code === "not_found") {
      toast.show({ tone: "error", message: result.message });
      revalidator.revalidate();
    }
  }, [saver.state, saver.data, toast, name, group.fingerprint, revalidator]);

  const toggle = useCallback(
    (enabled: boolean) =>
      toggler.submit(
        {
          csrfToken,
          intent: "toggle-group",
          id: group.id,
          "enabled:bool": String(enabled),
        },
        { method: "post", preventScrollReset: true },
      ),
    [toggler, csrfToken, group.id],
  );

  useEffect(() => {
    const result = toggler.data;
    if (toggler.state !== "idle" || !result || toggled.current === result) {
      return;
    }
    toggled.current = result;
    if (!result.ok) {
      toast.show({ tone: "error", message: result.message });
      if (result.code === "not_found") revalidator.revalidate();
      return;
    }
    const shown = result.group?.enabled ?? false;
    toast.show({
      message: shown
        ? `“${name}” is shown in the footer`
        : `“${name}” is hidden`,
      action: { label: "Undo", onAction: () => toggle(!shown) },
    });
  }, [toggler.state, toggler.data, toast, toggle, name, revalidator]);

  // Optimistic switch while the toggle is in flight.
  const pending = toggler.formData?.get("enabled:bool");
  const shown =
    typeof pending === "string" ? pending === "true" : group.enabled;
  const failed =
    failure && failure.fingerprint === group.fingerprint
      ? failure.result
      : null;
  const leftOut = shown && isLeftOut({ ...group, enabled: shown }, sources);

  return (
    <li
      className="studio-footer__row"
      data-enabled={shown ? "" : undefined}
      data-group-key={group.key}
    >
      <div className="studio-footer__order">
        <OrderControls
          label={name}
          index={order.index}
          total={order.total}
          picked={order.picked}
          onMove={order.onMove}
          handleProps={order.handleProps}
        />
      </div>
      <div className="studio-footer__body">
        <div className="studio-footer__summary">
          <h3 className="studio-footer__name">
            <span>{name}</span>
            {zhName && zhName !== name ? (
              <span className="studio-footer__zh" lang="zh-Hant">
                {zhName}
              </span>
            ) : null}
          </h3>
          <p className="studio-footer__kind">
            {FOOTER_KIND_TAGS[group.kind]}
            {custom ? ` · ${shownLinksSummary(group)}` : null}
          </p>
          <div className="studio-footer__visibility">
            {group.hideable ? (
              <VisibilitySwitch name={name} shown={shown} onToggle={toggle} />
            ) : (
              <span className="studio-footer__always">Always shown</span>
            )}
          </div>
        </div>
        {leftOut ? (
          <p className="studio-hint studio-footer__left-out">
            Left out of the footer: no link to show.
          </p>
        ) : null}
        <details
          className="studio-footer__details"
          open={open}
          onToggle={(event) => onOpenChange(group.id, event.currentTarget.open)}
        >
          <summary className="studio-footer__toggle">
            Edit<span className="visually-hidden"> {name}</span>
          </summary>
          <FooterGroupEditor
            key={`${group.fingerprint}:${saves}`}
            group={group}
            sources={sources}
            fetcher={saver as never}
            failed={failed}
            onDirty={onDirty}
          />
          {custom ? (
            <div className="studio-footer__danger">
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() => setConfirming(true)}
              >
                Delete…
                <span className="visually-hidden"> {name}</span>
              </button>
            </div>
          ) : null}
        </details>
      </div>
      {custom ? (
        <ConfirmDialog
          open={confirming}
          tone="danger"
          title={`Delete “${name}”?`}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              {shown ? (
                <button
                  type="button"
                  className="studio-btn studio-btn--secondary studio-btn--compact"
                  onClick={() => {
                    setConfirming(false);
                    toggle(false);
                  }}
                >
                  Hide it instead
                </button>
              ) : null}
              <button
                type="button"
                className="studio-btn studio-btn--danger-filled studio-btn--compact"
                aria-busy={deleting || undefined}
                onClick={() => {
                  onDirty(group.id, false);
                  onDelete(group);
                  setConfirming(false);
                }}
              >
                Delete permanently
              </button>
            </>
          }
        >
          <p>
            Its links leave the footer at once and cannot be restored. Hiding
            keeps the group here for later.
          </p>
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
