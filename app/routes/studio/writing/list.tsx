/** `/studio/writing`: list, filters (platform, status, category, search), order. */
import { useLoaderData } from "react-router";
import { WritingList } from "../../../components/studio/writing/writing-list";
import {
  handleWritingListAction,
  loadWritingList,
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

export const loader = withOwner(async ({ db, request, now }) => ({
  ...(await loadWritingList({ db, request })),
  now: now.toISOString(),
}));

export const action = withOwnerMutation(handleWritingListAction);

export default function WritingListRoute() {
  const data = useLoaderData<typeof loader>();
  return <WritingList {...data} />;
}
