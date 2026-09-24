/** STUB (P5): music preview (hero + player card). */
import { PreviewStub } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewMusicRoute() {
  return <PreviewStub title="Music entry" />;
}
