/** `/studio/projects`: list, filters, homepage order, row actions (P1). */
import { useLoaderData } from "react-router";
import { ProjectsListView } from "../../../components/studio/projects/projects-list-view";
import {
  handleProjectsListAction,
  loadProjectsList,
} from "../../../lib/cms/repositories/projects.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import projectStyles from "../../../styles/studio/projects.css?url";

export const loader = withOwner(loadProjectsList);
export const action = withOwnerMutation(handleProjectsListAction);

export const links = () => [{ rel: "stylesheet", href: projectStyles }];

export default function ProjectsListRoute() {
  const data = useLoaderData<typeof loader>();
  return <ProjectsListView data={data} />;
}
