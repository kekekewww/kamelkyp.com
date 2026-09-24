/**
 * Music preview (`/studio/preview/music/:id?locale=`): the track in the home
 * hero's showreel slot (click to play, never autoplay) and as the track
 * sheet a project page shows. GET = working copy; POST = unsaved form.
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import { Hero } from "../../../components/home/hero";
import { usePublicSite } from "../../../components/layout/use-public-site";
import { MediaPreview } from "../../../components/media/media-preview";
import { TrackSheet } from "../../../components/work/case-study-section";
import { getWorkCopy } from "../../../components/work/project-meta";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewLocale,
  previewMusic,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request, params }) => {
  const locale = previewLocale(request);
  const track = await previewMusic(db, env, locale, params.id ?? "");
  if (!track) throw new Response("Not Found", { status: 404 });
  return { locale, track };
});

export const action = withOwnerMutation(
  async ({ db, env, request, params, formData }) => {
    const locale = previewLocale(request);
    try {
      const track = await previewMusic(
        db,
        env,
        locale,
        params.id ?? "",
        formData ?? new FormData(),
      );
      if (!track) throw new Response("Not Found", { status: 404 });
      return { locale, track };
    } catch (error) {
      if (error instanceof PreviewFormError) {
        throw new Response("The form could not be previewed.", { status: 422 });
      }
      throw error;
    }
  },
);

export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  previewMeta(loaderData?.track.title);

export default function PreviewMusicRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, track } = actionData ?? loaderData;
  const { brand } = usePublicSite();
  const copy = getWorkCopy(locale).track;

  return (
    <main className="home-page" id="main-content">
      <Hero locale={locale} brand={brand} showreel={track.media} />
      <div className="project-summary grid">
        <div className="project-summary__audio col-content">
          <TrackSheet
            label={track.title || copy.label}
            pending={copy.pending}
            rows={[
              { term: copy.track, value: track.title },
              { term: copy.artist, value: track.artist },
              { term: copy.role, value: track.role },
              { term: copy.year, value: track.year ? String(track.year) : "" },
              {
                term: copy.credits,
                value: track.credits
                  .map((credit) =>
                    [credit.role, credit.name].filter(Boolean).join(" "),
                  )
                  .join(" / "),
              },
            ]}
            player={
              track.media ? (
                <MediaPreview item={track.media} locale={locale} />
              ) : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
