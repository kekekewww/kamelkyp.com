/** STUB (P2 Music): editor. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function EditMusicRoute() {
  return <StubPanel title="Music entry" legacyHref="/admin/content" />;
}
