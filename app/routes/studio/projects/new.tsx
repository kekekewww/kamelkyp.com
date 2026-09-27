/** `/studio/projects/new`: quick create → editor (P1). */
import { Link, useActionData, useLoaderData } from "react-router";
import { ProjectCreateForm } from "../../../components/studio/projects/project-create-form";
import type { ProjectActionData } from "../../../components/studio/projects/types";
import { StudioPage } from "../../../components/studio/shell/studio-page";
import {
  handleProjectCreate,
  loadProjectNew,
} from "../../../lib/cms/repositories/projects.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import projectStyles from "../../../styles/studio/projects.css?url";

export const loader = withOwner(loadProjectNew);
export const action = withOwnerMutation(handleProjectCreate);

export const links = () => [{ rel: "stylesheet", href: projectStyles }];

export default function NewProjectRoute() {
  const { categories } = useLoaderData<typeof loader>();
  const result = useActionData() as ProjectActionData | undefined;
  return (
    <StudioPage
      title="New project"
      breadcrumb={
        <Link className="studio-link" to="/studio/projects">
          Projects
        </Link>
      }
      width="narrow"
    >
      <ProjectCreateForm categories={categories} result={result} />
    </StudioPage>
  );
}
