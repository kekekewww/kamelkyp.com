import type { LoaderFunctionArgs } from "react-router";
import { cloudflareContext } from "../cloudflare/context";
import { isLocale } from "../i18n/locale";

export function getPublicLoaderContext({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  if (!params.lang || !isLocale(params.lang)) {
    throw new Response("Not Found", { status: 404 });
  }

  const cloudflare = context.get(cloudflareContext);
  return {
    locale: params.lang,
    db: cloudflare.env.DB,
    env: cloudflare.env,
  };
}
