/** STUB (P3 Recognition): quick create. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function NewRecognitionRoute() {
  return <StubPanel title="New recognition" />;
}
