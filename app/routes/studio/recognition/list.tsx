/** STUB (P3 Recognition): list and filters. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function RecognitionListRoute() {
  return <StubPanel title="Recognition" />;
}
