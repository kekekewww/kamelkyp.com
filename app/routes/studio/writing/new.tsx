/** `/studio/writing/new`: quick create → 303 to the editor. */
import { WritingNew } from "../../../components/studio/writing/writing-new";
import { handleWritingCreate } from "../../../lib/cms/repositories/writing.server";
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

export const loader = withOwner(() => null);

export const action = withOwnerMutation(handleWritingCreate);

export default function NewWritingRoute() {
  return <WritingNew />;
}
