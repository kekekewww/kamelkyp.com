/** `/studio/projects/:id`: the project editor (P1). */
import { useState } from "react";
import { type ShouldRevalidateFunctionArgs, useLoaderData } from "react-router";
import { ProjectEditor } from "../../../components/studio/projects/project-editor";
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
  // Bumped after a revert or "Reload latest": remount with the server copy.
  const [epoch, setEpoch] = useState(0);
  return (
    <ProjectEditor
      key={`${data.meta.id}:${epoch}`}
      data={data}
      onReload={() => setEpoch((value) => value + 1)}
    />
  );
}
