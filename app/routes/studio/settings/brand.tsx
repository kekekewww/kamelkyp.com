/** STUB (P4 Brand settings). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function BrandSettingsRoute() {
  return <StubPanel title="Brand" />;
}
