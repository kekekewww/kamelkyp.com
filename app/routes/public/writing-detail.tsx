import {
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  useLoaderData,
} from "react-router";
import { WritingArticle } from "../../components/content/writing-entries";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { pageMeta } from "../../lib/cms/public/meta";
import { getPublicWriting } from "../../lib/cms/public/writing.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "small" },
};

/**
 * Internal writing by live slug: an old published slug answers 301, entries
 * that only link out (no internal content in this locale) have no detail
 * page (404), as do drafts and archived rows.
 */
export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const result = await getPublicWriting(db, env, locale, slug);
  if (result.kind === "redirect") throw redirect(result.to, 301);
  if (result.kind === "missing") {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale, writing: result.writing };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) => {
  const writing = loaderData?.writing;
  return pageMeta(matches, {
    title: writing?.seo.title,
    description: writing?.seo.description,
    image: writing?.socialImage ?? writing?.cover ?? null,
    type: "article",
  });
};

export default function WritingDetailRoute() {
  const { locale, writing } = useLoaderData<typeof loader>();
  return <WritingArticle writing={writing} locale={locale} />;
}
