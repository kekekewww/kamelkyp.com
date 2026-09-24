/** STUB (P2 Music): quick create. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function NewMusicRoute() {
  return <StubPanel title="New music entry" legacyHref="/admin/content" />;
}
