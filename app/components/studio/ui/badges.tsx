/**
 * Status and flag badges (admin-architecture §5.8) and the save-state
 * indicator (§4.6). Status is never conveyed by colour alone: the word is
 * always present.
 */
import type { EntryStatus } from "../../../lib/cms/types";
import { type SaveState, saveStateLabel } from "./editor-state";

const STATUS_LABEL: Record<EntryStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span className={`studio-badge studio-badge--${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export type Flag = "CHANGES" | "TODO_CONTENT" | "FEATURED" | "SHOWREEL";

const FLAG_LABEL: Record<Flag, string> = {
  CHANGES: "Changes",
  TODO_CONTENT: "TODO_CONTENT",
  FEATURED: "Featured",
  SHOWREEL: "Showreel",
};

const FLAG_TITLE: Record<Flag, string> = {
  CHANGES: "The working copy differs from the published version",
  TODO_CONTENT: "Seeded sample content; cannot be published",
  FEATURED: "Shown on the homepage",
  SHOWREEL: "The homepage showreel",
};

export function FlagBadge({ flag }: { flag: Flag }) {
  return (
    <span
      className={`studio-badge studio-flag studio-flag--${flag.toLowerCase().replace("_", "-")}`}
      title={FLAG_TITLE[flag]}
    >
      {FLAG_LABEL[flag]}
    </span>
  );
}

export function SaveStateIndicator({
  state,
  timeZone,
}: {
  state: SaveState;
  timeZone?: string;
}) {
  return (
    <span
      className={`studio-save-state studio-save-state--${state.kind}`}
      role="status"
      aria-live="polite"
    >
      {saveStateLabel(state, timeZone)}
    </span>
  );
}
