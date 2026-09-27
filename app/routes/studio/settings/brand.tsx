/** `/studio/settings/brand`: brand settings (live on save). */
import { useLoaderData } from "react-router";
import { BrandSettingsForm } from "../../../components/studio/settings/brand-form";
import {
  handleBrandSettingsAction,
  loadBrandScreen,
} from "../../../lib/cms/settings-write.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [{ rel: "stylesheet", href: settingsStyles }];

export const loader = withOwner(({ db, env }) => loadBrandScreen(db, env));

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleBrandSettingsAction({ db, formData, intent, now }),
);

export default function BrandSettingsRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <BrandSettingsForm
      brand={data.brand}
      contactNeedsReview={data.contactNeedsReview}
      assets={data.assets}
      categories={data.categories}
    />
  );
}
