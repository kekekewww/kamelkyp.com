/**
 * Remounting an editor with the server copy (after "Revert to published" or
 * "Reload latest"). Editor fields are uncontrolled, so only a remount shows a
 * copy that changed on the server, and the remount must render the loader
 * data that carries the change. Otherwise the fields keep the old text while
 * the controlled `expectedRevision` input follows the new data: the editor
 * reads SAVED, and its next save is accepted and writes the old text back.
 *
 * A revert therefore waits for the revision it produced. Its submission can
 * settle on an urgent render that still holds the previous loader data: the
 * fetcher's data is read outside the router state, before the transition
 * that carries the revalidated loader data commits (`fetcher-settle.ts`).
 */
export interface ReloadTarget {
  id: string;
  revision: number;
}

export interface EditorReload {
  /** Part of the editor's `key`: a new epoch remounts the editor. */
  epoch: number;
  /** The entry and revision the next remount waits for. */
  awaiting: ReloadTarget | null;
}

export const NO_RELOAD: EditorReload = { epoch: 0, awaiting: null };

/**
 * Asks for a remount once the loader data of `target.id` reaches
 * `target.revision`, or at once without a target.
 */
export function requestReload(
  state: EditorReload,
  target?: ReloadTarget,
): EditorReload {
  if (!target) return { epoch: state.epoch + 1, awaiting: null };
  return {
    epoch: state.epoch,
    awaiting: { id: target.id, revision: target.revision },
  };
}

/**
 * The state for the loader data being rendered: a new epoch once it carries
 * the awaited revision (or a newer one). Returns `state` itself when nothing
 * changes, so a render can compare identities.
 */
export function reloadFor(
  state: EditorReload,
  loaded: ReloadTarget,
): EditorReload {
  const { awaiting } = state;
  if (awaiting === null) return state;
  // Another entry is on screen: its editor mounts with its own data.
  if (awaiting.id !== loaded.id) return { epoch: state.epoch, awaiting: null };
  if (loaded.revision < awaiting.revision) return state;
  return { epoch: state.epoch + 1, awaiting: null };
}
