/** STUB (P2 Music): list, filters, showreel. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function MusicListRoute() {
  return <StubPanel title="Music" legacyHref="/admin/content" />;
}
