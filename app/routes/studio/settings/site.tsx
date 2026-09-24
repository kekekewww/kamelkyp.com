/** STUB (P4 Site settings). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function SiteSettingsRoute() {
  return <StubPanel title="Site" />;
}
