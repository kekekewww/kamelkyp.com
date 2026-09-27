/** STUB (P2 Media): asset detail. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function MediaDetailRoute() {
  return <StubPanel title="Media asset" legacyHref="/admin/works" />;
}
