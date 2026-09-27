/**
 * Service preview (`/studio/preview/services/:id?locale=`): a commission
 * service as its detail page (price = the active price rule), any other
 * service as its card on the area page. GET = working copy; POST = unsaved
 * form (nothing is written).
 */
import { type MetaFunction, useActionData, useLoaderData } from "react-router";
import { ServiceChoice } from "../../../components/services/service-choice";
import { ServiceOverview } from "../../../components/services/service-overview";
import { previewMeta } from "../../../lib/cms/public/meta";
import {
  PreviewFormError,
  previewFxSnapshot,
  previewLocale,
  previewService,
} from "../../../lib/cms/public/preview.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import { getService } from "../../../lib/services/catalog";
import { isServiceId } from "../../../lib/services/service-id";

export const loader = withOwner(async ({ db, env, request, params, now }) => {
  const locale = previewLocale(request);
  const [result, fxSnapshot] = await Promise.all([
    previewService(db, env, locale, params.id ?? "", { now }),
    previewFxSnapshot(db, locale, now),
  ]);
  if (!result) throw new Response("Not Found", { status: 404 });
  return { locale, fxSnapshot, ...result };
});

export const action = withOwnerMutation(
  async ({ db, env, request, params, formData, now }) => {
    const locale = previewLocale(request);
    try {
      const [result, fxSnapshot] = await Promise.all([
        previewService(db, env, locale, params.id ?? "", {
          formData: formData ?? new FormData(),
          now,
        }),
        previewFxSnapshot(db, locale, now),
      ]);
      if (!result) throw new Response("Not Found", { status: 404 });
      return { locale, fxSnapshot, ...result };
    } catch (error) {
      if (error instanceof PreviewFormError) {
        throw new Response("The form could not be previewed.", { status: 422 });
      }
      throw error;
    }
  },
);

export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  previewMeta(loaderData?.service.name);

export default function PreviewServiceRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { locale, fxSnapshot, service } = actionData ?? loaderData;
  const commissionId = service.commissionServiceId;
  if (commissionId && isServiceId(commissionId)) {
    return (
      <ServiceOverview
        service={service}
        category={getService(commissionId).category}
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    );
  }
  return (
    <main className="page service-select-page" id="main-content">
      <ServiceChoice
        services={[service]}
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    </main>
  );
}
