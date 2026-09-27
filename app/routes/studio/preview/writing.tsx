/** STUB (P5): writing preview (detail or outbound card). */
import { PreviewStub } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewWritingRoute() {
  return <PreviewStub title="Writing entry" />;
}
