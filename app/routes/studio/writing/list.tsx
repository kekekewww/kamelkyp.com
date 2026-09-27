/** STUB (P3 Writing): list and filters. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function WritingListRoute() {
  return <StubPanel title="Writing" legacyHref="/admin/posts" />;
}
