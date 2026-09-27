/** STUB (P3 Writing): quick create. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function NewWritingRoute() {
  return <StubPanel title="New writing" legacyHref="/admin/posts" />;
}
