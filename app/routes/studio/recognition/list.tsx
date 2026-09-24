/** `/studio/recognition`: list, filters (year, type, status, search), order. */
import { useLoaderData } from "react-router";
import { RecognitionList } from "../../../components/studio/recognition/recognition-list";
import {
  handleRecognitionListAction,
  loadRecognitionList,
} from "../../../lib/cms/repositories/recognition.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import recognitionStyles from "../../../styles/studio/recognition.css?url";

export const links = () => [{ rel: "stylesheet", href: recognitionStyles }];

export const loader = withOwner(async ({ db, request, now }) => ({
  ...(await loadRecognitionList({ db, request })),
  now: now.toISOString(),
}));

export const action = withOwnerMutation(handleRecognitionListAction);

export default function RecognitionListRoute() {
  const data = useLoaderData<typeof loader>();
  return <RecognitionList {...data} />;
}
