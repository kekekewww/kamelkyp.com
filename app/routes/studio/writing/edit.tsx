/** `/studio/writing/:id`: editor (blocks, slug, publish, lifecycle, feature). */
import { useState } from "react";
import { useLoaderData } from "react-router";
import { WritingEditor } from "../../../components/studio/writing/writing-editor";
import {
  handleWritingEditorAction,
  loadWritingEditor,
} from "../../../lib/cms/repositories/writing.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import recognitionStyles from "../../../styles/studio/recognition.css?url";
import writingStyles from "../../../styles/studio/writing.css?url";

export const links = () => [
  { rel: "stylesheet", href: recognitionStyles },
  { rel: "stylesheet", href: writingStyles },
];

export const loader = withOwner(loadWritingEditor);

export const action = withOwnerMutation(handleWritingEditorAction);

export default function EditWritingRoute() {
  const data = useLoaderData<typeof loader>();
  // Bumped after "Revert" / "Reload latest": remount with the server copy.
  const [epoch, setEpoch] = useState(0);
  return (
    <WritingEditor
      key={`${data.meta.id}:${epoch}`}
      data={data}
      onReset={() => setEpoch((value) => value + 1)}
    />
  );
}
