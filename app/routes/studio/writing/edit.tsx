/** STUB (P3 Writing): editor. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function EditWritingRoute() {
  return <StubPanel title="Writing entry" legacyHref="/admin/posts" />;
}
