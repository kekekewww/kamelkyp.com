import type { LoaderFunctionArgs } from "react-router";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getActivePriceRule } from "../../lib/pricing/price-repository.server";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import type { ServiceId } from "../../lib/services/service-id";

/**
 * Loader data for the four service detail pages: the public price context
 * (locale + FX snapshot) plus the student discount from the active D1 price
 * rule. A missing rule only hides the note; it never breaks the page.
 */
export async function loadServiceDetail(
  args: LoaderFunctionArgs,
  serviceId: ServiceId,
) {
  const priceContext = await getPublicPriceContext(args);
  let studentDiscountBps: number | null = null;
  try {
    const { db } = getPublicLoaderContext(args);
    const rule = await getActivePriceRule(
      db,
      serviceId,
      new Date().toISOString(),
    );
    studentDiscountBps = rule.studentDiscountBps;
  } catch (error) {
    const code = error instanceof Error ? error.message : "price_rule_unknown";
    console.warn("public_student_discount_unavailable", code);
  }
  return { ...priceContext, studentDiscountBps };
}
