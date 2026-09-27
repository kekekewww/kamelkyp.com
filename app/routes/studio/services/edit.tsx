/** STUB (P4 Services): editor. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function EditServiceRoute() {
  return <StubPanel title="Service" legacyHref="/admin/services" />;
}
