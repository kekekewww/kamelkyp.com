/**
 * Recognition preview (`/studio/preview/recognition/:id?locale=`): the entry
 * as its home row. GET = working copy; POST = unsaved form (nothing written).
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import { Recognition } from "../../../components/home/recognition";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewLocale,
  previewRecognition,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request, params }) => {
  const locale = previewLocale(request);
  const item = await previewRecognition(db, env, locale, params.id ?? "");
  if (!item) throw new Response("Not Found", { status: 404 });
  return { locale, item };
});

export const action = withOwnerMutation(
  async ({ db, env, request, params, formData }) => {
    const locale = previewLocale(request);
    try {
      const item = await previewRecognition(
        db,
        env,
        locale,
        params.id ?? "",
        formData ?? new FormData(),
      );
      if (!item) throw new Response("Not Found", { status: 404 });
      return { locale, item };
    } catch (error) {
      if (error instanceof PreviewFormError) {
        throw new Response("The form could not be previewed.", { status: 422 });
      }
      throw error;
    }
  },
);

export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  previewMeta(loaderData?.item.event);

export default function PreviewRecognitionRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, item } = actionData ?? loaderData;
  return (
    <main className="home-page" id="main-content">
      <Recognition items={[item]} locale={locale} />
    </main>
  );
}
