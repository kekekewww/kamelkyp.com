/** STUB (I Commissions): case list (port of /admin/cases). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function CommissionsRoute() {
  return <StubPanel title="Commissions" legacyHref="/admin/cases" />;
}
