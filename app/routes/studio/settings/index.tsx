/** STUB (P4 Settings index). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function SettingsIndexRoute() {
  return <StubPanel title="Settings" />;
}
