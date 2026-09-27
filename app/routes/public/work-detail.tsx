import {
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  useLoaderData,
} from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import {
  ProjectPage,
  projectNeighbours,
} from "../../components/work/project-page";
import { pageMeta } from "../../lib/cms/public/meta";
import { listProjectMusic } from "../../lib/cms/public/music.server";
import {
  getPublicProject,
  listPublicProjects,
} from "../../lib/cms/public/projects.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "project", size: "large" },
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) => {
  const project = loaderData?.project;
  return pageMeta(matches, {
    title: project?.seo.title,
    description: project?.seo.description,
    image: project?.socialImage ?? project?.cover ?? null,
    type: "article",
  });
};

/**
 * Project detail by live slug (content-schema §2.10): an old published slug
 * answers 301 to the current one; drafts, archived rows, TODO_CONTENT samples
 * and rows without this locale's required text are 404.
 */
export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const result = await getPublicProject(db, env, locale, slug);
  if (result.kind === "redirect") throw redirect(result.to, 301);
  if (result.kind === "missing") {
    throw new Response("Not Found", { status: 404 });
  }
  const { project } = result;
  const [all, music] = await Promise.all([
    listPublicProjects(db, env, locale),
    listProjectMusic(db, env, locale, project.id),
  ]);
  return { locale, project, music, ...projectNeighbours(all, project.slug) };
}

export default function WorkDetailRoute() {
  const { locale, project, music, index, next } =
    useLoaderData<typeof loader>();
  return (
    <ProjectPage
      project={project}
      music={music}
      locale={locale}
      index={index}
      next={next}
    />
  );
}
