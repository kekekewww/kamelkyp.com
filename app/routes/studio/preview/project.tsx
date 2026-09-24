/**
 * Project preview (`/studio/preview/projects/:id?locale=`): the public project
 * page from the working copy (GET) or from the editor's unsaved form (POST,
 * "Preview changes"; parsed with the draft schema, nothing is written).
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import { ProjectPage } from "../../../components/work/project-page";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewLocale,
  previewProject,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request, params }) => {
  const locale = previewLocale(request);
  const result = await previewProject(db, env, locale, params.id ?? "");
  if (!result) throw new Response("Not Found", { status: 404 });
  return { locale, ...result };
});

export const action = withOwnerMutation(
  async ({ db, env, request, params, formData }) => {
    const locale = previewLocale(request);
    try {
      const result = await previewProject(
        db,
        env,
        locale,
        params.id ?? "",
        formData ?? new FormData(),
      );
      if (!result) throw new Response("Not Found", { status: 404 });
      return { locale, ...result };
    } catch (error) {
      if (error instanceof PreviewFormError) {
        throw new Response("The form could not be previewed.", { status: 422 });
      }
      throw error;
    }
  },
);

export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  previewMeta(loaderData?.project.title);

export default function PreviewProjectRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, project, music } = actionData ?? loaderData;
  return (
    <ProjectPage
      project={project}
      music={music}
      locale={locale}
      index={undefined}
      next={null}
    />
  );
}
