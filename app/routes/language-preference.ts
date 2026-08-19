import { type LoaderFunctionArgs, redirect } from "react-router";
import { isLocale } from "../lib/i18n/locale";
import { serializeLocaleCookie } from "../lib/i18n/locale-cookie.server";

export function loader({ params, request }: LoaderFunctionArgs) {
  if (!params.locale || !isLocale(params.locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("returnTo");
  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : `/${params.locale}`;

  return redirect(safeReturnTo, {
    headers: { "set-cookie": serializeLocaleCookie(params.locale) },
  });
}
