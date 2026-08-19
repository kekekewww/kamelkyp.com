import { type LoaderFunctionArgs, redirect } from "react-router";
import { getPreferredLocale } from "../lib/i18n/locale-cookie.server";

export function loader({ request }: LoaderFunctionArgs) {
  const locale = getPreferredLocale({
    cookieHeader: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  return redirect(`/${locale}`);
}
