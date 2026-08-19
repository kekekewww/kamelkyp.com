import { type LoaderFunctionArgs, Outlet, useLoaderData } from "react-router";
import { isLocale, type Locale } from "../../lib/i18n/locale";

export interface PublicOutletContext {
  locale: Locale;
}

export function loader({ params }: LoaderFunctionArgs): PublicOutletContext {
  if (!params.lang || !isLocale(params.lang)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale: params.lang };
}

export default function PublicLayoutRoute() {
  const context = useLoaderData<typeof loader>();
  return <Outlet context={context} />;
}
