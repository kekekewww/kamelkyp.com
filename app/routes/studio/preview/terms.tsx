/**
 * Legal page preview (`/studio/preview/terms/:documentId?locale=`): the real
 * `/terms` or `/privacy` page with this document's saved draft (GET; else
 * its live version) or the editor's unsaved form (POST; nothing is
 * written). A form posted for the other locale is refused (422).
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import { usePublicSite } from "../../../components/layout/use-public-site";
import { PrivacyPage, TermsPage } from "../../../components/legal/legal-pages";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewLocale,
  previewTerms,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, request, params, now }) => {
  const locale = previewLocale(request);
  const result = await previewTerms(db, locale, params.documentId ?? "", {
    now,
  });
  if (!result) throw new Response("Not Found", { status: 404 });
  return { locale, ...result };
});

export const action = withOwnerMutation(
  async ({ db, request, params, formData, now }) => {
    const locale = previewLocale(request);
    try {
      const result = await previewTerms(db, locale, params.documentId ?? "", {
        formData: formData ?? new FormData(),
        now,
      });
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
  previewMeta(
    loaderData?.page === "privacy"
      ? loaderData.locale === "en"
        ? "Privacy"
        : "隱私說明"
      : loaderData?.locale === "en"
        ? "Terms of service"
        : "服務條款",
  );

export default function PreviewTermsRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, page, terms, serviceNames } = actionData ?? loaderData;
  const { brandName } = usePublicSite().brand;
  return page === "privacy" ? (
    <PrivacyPage locale={locale} terms={terms} brandName={brandName} />
  ) : (
    <TermsPage
      locale={locale}
      terms={terms}
      serviceNames={serviceNames}
      brandName={brandName}
    />
  );
}
