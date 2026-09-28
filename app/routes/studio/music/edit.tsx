/** `/studio/music/:id`: the music editor (save, publish, lifecycle, placement). */
import { useLoaderData } from "react-router";
import { MusicEditorView } from "../../../components/studio/music/music-editor";
import {
  handleMusicEditorAction,
  loadMusicEditor,
} from "../../../lib/cms/repositories/music.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import mediaStyles from "../../../styles/studio/media.css?url";
import musicStyles from "../../../styles/studio/music.css?url";

export const links = () => [
  { rel: "stylesheet", href: mediaStyles },
  { rel: "stylesheet", href: musicStyles },
];

export const loader = withOwner(loadMusicEditor);

export const action = withOwnerMutation(handleMusicEditorAction);

export default function EditMusicRoute() {
  const data = useLoaderData<typeof loader>();
  // A different entry (e.g. after Duplicate) gets a fresh editor.
  return <MusicEditorView key={data.meta.id} data={data} />;
}
