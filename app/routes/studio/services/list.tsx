/** STUB (P4 Services): grouped list with live prices. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function ServicesListRoute() {
  return <StubPanel title="Services" legacyHref="/admin/services" />;
}
