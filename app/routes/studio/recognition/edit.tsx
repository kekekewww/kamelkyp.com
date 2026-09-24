/** `/studio/recognition/:id`: editor (save, publish, lifecycle, feature). */
import { useState } from "react";
import { useLoaderData } from "react-router";
import { RecognitionEditor } from "../../../components/studio/recognition/recognition-editor";
import {
  handleRecognitionEditorAction,
  loadRecognitionEditor,
} from "../../../lib/cms/repositories/recognition.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import recognitionStyles from "../../../styles/studio/recognition.css?url";

export const links = () => [{ rel: "stylesheet", href: recognitionStyles }];

export const loader = withOwner(loadRecognitionEditor);

export const action = withOwnerMutation(handleRecognitionEditorAction);

export default function EditRecognitionRoute() {
  const data = useLoaderData<typeof loader>();
  // Bumped after "Revert" / "Reload latest": remount with the server copy.
  const [epoch, setEpoch] = useState(0);
  return (
    <RecognitionEditor
      key={`${data.meta.id}:${epoch}`}
      data={data}
      onReset={() => setEpoch((value) => value + 1)}
    />
  );
}
