/** `/studio/media`: library, uploads, URL registration, usage index. */
import { useLoaderData } from "react-router";
import { MediaLibraryView } from "../../../components/studio/media/library";
import {
  handleMediaLibraryAction,
  loadMediaLibrary,
} from "../../../lib/cms/repositories/media-library.server";
import { withOwner, withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import mediaStyles from "../../../styles/studio/media.css?url";

export const links = () => [{ rel: "stylesheet", href: mediaStyles }];

export const loader = withOwner(loadMediaLibrary);

export const action = withOwnerMutation(handleMediaLibraryAction);

export default function MediaLibraryRoute() {
  const data = useLoaderData<typeof loader>();
  return <MediaLibraryView data={data} />;
}
