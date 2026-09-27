/** STUB (P5): service preview (its area page). */
import { PreviewStub } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewServiceRoute() {
  return <PreviewStub title="Service" />;
}
