import type { LoaderFunctionArgs } from "react-router";
import { getPublicLoaderContext } from "../content/public-loader.server";
import { getUsableFxSnapshot } from "./fx-repository.server";

export async function getPublicPriceContext(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  if (locale === "zh") return { locale, fxSnapshot: null };

  try {
    const fxSnapshot = await getUsableFxSnapshot(
      db,
      new Date().toISOString().slice(0, 10),
    );
    return { locale, fxSnapshot };
  } catch (error) {
    const code = error instanceof Error ? error.message : "fx_unknown_error";
    console.warn("public_price_unavailable", code);
    return { locale, fxSnapshot: null };
  }
}
