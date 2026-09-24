/** STUB (P5): project detail preview; POST previews an unsaved form. */
import { PreviewStub } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewProjectRoute() {
  return <PreviewStub title="Project" />;
}
