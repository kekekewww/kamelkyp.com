/** STUB (I Footer): footer link groups (port of /admin/links). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function FooterSettingsRoute() {
  return <StubPanel title="Footer" legacyHref="/admin/links" />;
}
