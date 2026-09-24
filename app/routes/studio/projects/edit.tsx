/** STUB (P1 Projects): editor. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function EditProjectRoute() {
  return <StubPanel title="Project" legacyHref="/admin/works" />;
}
