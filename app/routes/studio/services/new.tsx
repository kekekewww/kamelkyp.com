/** STUB (P4 Services): quick create. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function NewServiceRoute() {
  return <StubPanel title="New service" legacyHref="/admin/services" />;
}
