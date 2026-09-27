/** STUB (P1 Projects): quick create. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function NewProjectRoute() {
  return <StubPanel title="New project" legacyHref="/admin/works" />;
}
