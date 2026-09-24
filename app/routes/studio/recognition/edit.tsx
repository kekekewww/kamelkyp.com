/** STUB (P3 Recognition): editor. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function EditRecognitionRoute() {
  return <StubPanel title="Recognition entry" />;
}
