/**
 * Home preview (`/studio/preview/home?locale=zh|en&drafts=1`): the public
 * home page component. With `drafts=1` featured drafts and working copies are
 * included (TODO_CONTENT samples badged); without it, the published home.
 */
import { useLoaderData } from "react-router";
import { HomePage } from "../../../components/home/home-page";
import { usePublicSite } from "../../../components/layout/use-public-site";
import { loadHome } from "../../../lib/cms/public/home.server";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  previewFxSnapshot,
  previewIncludesDrafts,
  previewLocale,
} from "../../../lib/cms/public/preview.server";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request, now }) => {
  const locale = previewLocale(request);
  const mode = previewIncludesDrafts(request) ? "preview" : "published";
  const [home, fxSnapshot] = await Promise.all([
    loadHome(db, env, locale, { mode, now }),
    previewFxSnapshot(db, locale, now),
  ]);
  return { locale, data: { ...home, fxSnapshot } };
});

export const meta = () => previewMeta("Home");

export default function PreviewHomeRoute() {
  const { locale, data } = useLoaderData<typeof loader>();
  const site = usePublicSite();
  return <HomePage locale={locale} site={site} data={data} />;
}
