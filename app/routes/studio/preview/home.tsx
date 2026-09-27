/** STUB (P5): home preview (`?locale&drafts=1`). */
import { PreviewStub } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewHomeRoute() {
  return <PreviewStub title="Home" />;
}
