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
import { isLocale, type Locale } from "../../lib/i18n/locale";

export interface PublicOutletContext {
  locale: Locale;
}

export const meta: MetaFunction = ({ params }) => {
  const isZh = params.lang !== "en";

  return [
    {
      title: isZh
        ? "Kamel — 音樂混音與歌曲銜接"
        : "Kamel — Music Mixing & Song Transitions",
    },
    {
      name: "description",
      content: isZh
        ? "Kamel 的混音、Vocal 製作與歌曲銜接委託網站。"
        : "Kamel's commissions for mixing, vocal production and song transitions.",
    },
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
