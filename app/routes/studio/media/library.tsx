/** STUB (P2 Media): library, uploads, usage. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function MediaLibraryRoute() {
  return <StubPanel title="Media" legacyHref="/admin/works" />;
}
