/** `/studio/music`: list, filters, order, featured and the homepage showreel. */
import { useLoaderData } from "react-router";
import { MusicListView } from "../../../components/studio/music/music-list";
import {
  handleMusicListAction,
  loadMusicList,
} from "../../../lib/cms/repositories/music.server";
import { withOwner, withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import mediaStyles from "../../../styles/studio/media.css?url";
import musicStyles from "../../../styles/studio/music.css?url";

export const links = () => [
  { rel: "stylesheet", href: mediaStyles },
  { rel: "stylesheet", href: musicStyles },
];

export const loader = withOwner(loadMusicList);

export const action = withOwnerMutation(handleMusicListAction);

export default function MusicListRoute() {
  const data = useLoaderData<typeof loader>();
  return <MusicListView data={data} />;
}
