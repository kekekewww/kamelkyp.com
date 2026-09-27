import type { LoaderFunctionArgs } from "react-router";
import {
  getCommissionServiceView,
  listPublicServices,
} from "../../lib/cms/public/services.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getActivePriceRule } from "../../lib/pricing/price-repository.server";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import { getService } from "../../lib/services/catalog";
import type { ServiceId } from "../../lib/services/service-id";

/**
 * Loader data for an area's service chooser (`/mixing`, `/song-transition`):
 * the published services of the area (commission rows priced from their
 * active rule) and the public price context.
 */
export async function loadServiceArea(
  args: LoaderFunctionArgs,
  area: "mixing" | "song_transition",
) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const [priceContext, services] = await Promise.all([
    getPublicPriceContext(args),
    listPublicServices(db, env, locale, { area }),
  ]);
  return { ...priceContext, services };
}

/**
 * Loader data for the four commission service pages: the published service
 * row (name, copy, deliverables; price = the active price rule), the public
 * price context (locale + FX snapshot) and the student discount of the same
 * rule. An unpublished service is a 404; a missing rule only hides the note.
 */
export async function loadServiceDetail(
  args: LoaderFunctionArgs,
  serviceId: ServiceId,
) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const now = new Date();
  const [priceContext, service] = await Promise.all([
    getPublicPriceContext(args),
    getCommissionServiceView(db, env, locale, serviceId, now),
  ]);
  if (!service) throw new Response("Not Found", { status: 404 });

  let studentDiscountBps: number | null = null;
  try {
    const rule = await getActivePriceRule(db, serviceId, now.toISOString());
    studentDiscountBps = rule.studentDiscountBps;
  } catch (error) {
    const code = error instanceof Error ? error.message : "price_rule_unknown";
    console.warn("public_student_discount_unavailable", code);
  }
  return {
    ...priceContext,
    service,
    category: getService(serviceId).category,
    studentDiscountBps,
  };
}
