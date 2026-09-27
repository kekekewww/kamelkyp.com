/**
 * Writing preview (`/studio/preview/writing/:id?locale=`): the detail page
 * when the entry has internal content in this locale, otherwise its outbound
 * card as it appears in the writing list. GET = working copy; POST = unsaved
 * form (nothing is written).
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import {
  WritingArticle,
  WritingEntry,
} from "../../../components/content/writing-entries";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewLocale,
  previewWriting,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request, params }) => {
  const locale = previewLocale(request);
  const result = await previewWriting(db, env, locale, params.id ?? "");
  if (!result) throw new Response("Not Found", { status: 404 });
  return { locale, ...result };
});

export const action = withOwnerMutation(
  async ({ db, env, request, params, formData }) => {
    const locale = previewLocale(request);
    try {
      const result = await previewWriting(
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
  previewMeta(loaderData?.item.title);

export default function PreviewWritingRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, item, writing } = actionData ?? loaderData;
  if (writing) return <WritingArticle writing={writing} locale={locale} />;
  return (
    <main className="page writing-page" id="main-content">
      <div className="grid">
        <ul className="writing-list">
          <WritingEntry item={item} locale={locale} />
        </ul>
      </div>
    </main>
  );
}
