/** `/studio/media/:id`: asset detail, metadata, usages, archive and delete. */
import { useLoaderData } from "react-router";
import { MediaDetailView } from "../../../components/studio/media/asset-detail";
import {
  handleMediaDetailAction,
  loadMediaDetail,
} from "../../../lib/cms/repositories/media-library.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import mediaStyles from "../../../styles/studio/media.css?url";

export const links = () => [{ rel: "stylesheet", href: mediaStyles }];

export const loader = withOwner(loadMediaDetail);

export const action = withOwnerMutation(handleMediaDetailAction);

export default function MediaDetailRoute() {
  const data = useLoaderData<typeof loader>();
  return <MediaDetailView key={data.asset.id} data={data} />;
}
