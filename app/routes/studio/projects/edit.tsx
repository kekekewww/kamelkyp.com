/** `/studio/projects/:id`: the project editor (P1). */
import { useState } from "react";
import { type ShouldRevalidateFunctionArgs, useLoaderData } from "react-router";
import { ProjectEditor } from "../../../components/studio/projects/project-editor";
import {
  NO_RELOAD,
  reloadFor,
  requestReload,
} from "../../../components/studio/ui/editor-reload";
import {
  handleProjectEditorAction,
  loadProjectEditor,
} from "../../../lib/cms/repositories/projects.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import projectStyles from "../../../styles/studio/projects.css?url";

export const loader = withOwner(loadProjectEditor);
export const action = withOwnerMutation(handleProjectEditorAction);

export const links = () => [{ rel: "stylesheet", href: projectStyles }];

/** A deleted project has nothing left to load; the editor navigates away. */
export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    actionResult &&
    typeof actionResult === "object" &&
    (actionResult as { deleted?: unknown }).deleted === true
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

export default function EditProjectRoute() {
  const data = useLoaderData<typeof loader>();
  // After a revert or "Reload latest": remount with the server copy, rendered
  // from the loader data that carries it (editor-reload.ts). The check runs
  // while rendering, so the editor never commits that data with old fields.
  const [reload, setReload] = useState(NO_RELOAD);
  const current = reloadFor(reload, data.meta);
  if (current !== reload) setReload(current);
  return (
    <ProjectEditor
      key={`${data.meta.id}:${current.epoch}`}
      data={data}
      onReload={(target) => setReload((state) => requestReload(state, target))}
    />
  );
}
