/**
 * Featured list for one content type (admin-architecture §4.2.1 item 4,
 * §4.12): explicit order controls (Move up / Move down, keyboard pick-up,
 * Alt+arrows), remove, and "Add…" from the other entries. Every change
 * saves at once; a failed reorder restores the saved order.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import type {
  FeaturedGroup,
  HomepageEntry,
} from "../../../lib/cms/repositories/homepage.server";
import type { EntityType } from "../../../lib/cms/types";
import { type ActionData, useActionToasts } from "../settings/form-kit";
import {
  OrderControls,
  StatusBadge,
  useKeyboardReorder,
  useStudioSession,
} from "../ui";

export const FEATURED_INFO: Record<
  EntityType,
  { title: string; noun: string; base: string; empty: string }
> = {
  project: {
    title: "Featured projects",
    noun: "project",
    base: "/studio/projects",
    empty:
      "No featured projects. Selected work stays hidden until one is live.",
  },
  music: {
    title: "Featured music",
    noun: "music entry",
    base: "/studio/music",
    empty: "No featured music.",
  },
  recognition: {
    title: "Featured recognition",
    noun: "recognition entry",
    base: "/studio/recognition",
    empty: "No featured recognition entries.",
  },
  writing: {
    title: "Featured writing",
    noun: "writing entry",
    base: "/studio/writing",
    empty: "No featured writing.",
  },
  service: {
    title: "Service highlights",
    noun: "service",
    base: "/studio/services",
    empty: "No service highlights.",
  },
};

function OrderedItems({
  type,
  items,
  limit,
  submit,
}: {
  type: EntityType;
  items: HomepageEntry[];
  limit?: number;
  submit: (fields: Record<string, string>) => void;
}) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items],
  );
  const labelOf = useCallback(
    (id: string) => byId.get(id)?.label ?? FEATURED_INFO[type].noun,
    [byId, type],
  );
  const onCommit = useCallback(
    (order: string[]) =>
      submit({ intent: "reorder-featured", type, ids: JSON.stringify(order) }),
    [submit, type],
  );
  const reorder = useKeyboardReorder({ ids, labelOf, onCommit });

  return (
    <>
      <ol className="studio-featured__list">
        {reorder.order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          const overLimit = limit !== undefined && index >= limit;
          return (
            <li
              className="studio-featured__row"
              key={id}
              data-over={overLimit ? "" : undefined}
            >
              <OrderControls
                label={item.label}
                index={index}
                total={reorder.order.length}
                picked={reorder.picked === id}
                onMove={(delta) => reorder.move(id, delta)}
                handleProps={reorder.handleProps(id)}
              />
              <span className="studio-featured__label">
                <Link to={`${FEATURED_INFO[type].base}/${id}`}>
                  {item.label}
                </Link>
                {item.secondary ? (
                  <span className="studio-featured__secondary" lang="en">
                    {item.secondary}
                  </span>
                ) : null}
              </span>
              <span className="studio-featured__state">
                <StatusBadge status={item.status} />
                {item.status !== "published" ? (
                  <span className="studio-featured__note">
                    Not live until published
                  </span>
                ) : overLimit ? (
                  <span className="studio-featured__note">
                    Not shown: over the limit of {limit}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() => submit({ intent: "unfeature", type, id })}
              >
                Remove
                <span className="visually-hidden"> {item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
    </>
  );
}

export function FeaturedList({
  group,
  limit,
}: {
  group: FeaturedGroup;
  /** Homepage count for this list (projects: featuredProjectCount). */
  limit?: number;
}) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const { csrfToken } = useStudioSession();
  const [epoch, setEpoch] = useState(0);
  const [choice, setChoice] = useState("");
  const info = FEATURED_INFO[group.type];

  const submit = useCallback(
    (fields: Record<string, string>) =>
      fetcher.submit({ csrfToken, ...fields }, { method: "post" }),
    [fetcher, csrfToken],
  );

  // A failed change (for example a stale order) falls back to the saved list.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      setEpoch((value) => value + 1);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="studio-featured">
      {limit !== undefined ? (
        <p className="studio-hint">
          The homepage shows the first {limit} published entries in this order.
          Change the number under Sections.
        </p>
      ) : null}
      {group.items.length === 0 ? (
        <p className="studio-featured__empty">{info.empty}</p>
      ) : (
        <OrderedItems
          key={epoch}
          type={group.type}
          items={group.items}
          limit={limit}
          submit={submit}
        />
      )}
      {group.candidates.length > 0 ? (
        <div className="studio-featured__add">
          <label className="studio-field">
            <span className="studio-field__label">Add a {info.noun}</span>
            <select
              className="studio-input studio-select"
              value={choice}
              onChange={(event) => setChoice(event.currentTarget.value)}
            >
              <option value="">Choose…</option>
              {group.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                  {candidate.status === "draft"
                    ? " (draft, not live until published)"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            disabled={!choice}
            onClick={() => {
              submit({ intent: "feature", type: group.type, id: choice });
              setChoice("");
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
