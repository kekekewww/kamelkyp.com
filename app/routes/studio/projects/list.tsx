/** STUB (P1 Projects): list, filters, feature and reorder. */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function ProjectsListRoute() {
  return <StubPanel title="Projects" legacyHref="/admin/works" />;
}
