import {
  type LoaderFunctionArgs,
  type MetaFunction,
  Outlet,
  useLoaderData,
} from "react-router";
import { PublicShell } from "../../components/layout/public-shell";
import { cloudflareContext } from "../../lib/cloudflare/context";
import {
  getDefaultFooterGroups,
  listFooterGroups,
} from "../../lib/content/footer-repository.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import { isLocale, type Locale } from "../../lib/i18n/locale";

export interface PublicOutletContext {
  locale: Locale;
}

export const meta: MetaFunction = ({ params }) => {
  const copy = getSiteCopy(params.lang === "en" ? "en" : "zh");

  return [
    { title: copy.metaTitleHome },
    { name: "description", content: copy.metaDescription },
  ];
};

export async function loader({ params, context }: LoaderFunctionArgs) {
  if (!params.lang || !isLocale(params.lang)) {
    throw new Response("Not Found", { status: 404 });
  }

  const locale = params.lang;
  const provider = context as typeof context | undefined;
  const footerGroups = provider
    ? await listFooterGroups(provider.get(cloudflareContext).env.DB, locale)
    : getDefaultFooterGroups(locale);

  return { locale, footerGroups };
}

export default function PublicLayoutRoute() {
  const data = useLoaderData<typeof loader>();
  const outletContext: PublicOutletContext = { locale: data.locale };

  return (
    <PublicShell locale={data.locale} footerGroups={data.footerGroups}>
      <Outlet context={outletContext} />
    </PublicShell>
  );
}
