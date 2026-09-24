import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { loadServiceDetail } from "../../components/services/service-detail-loader.server";
import { ServiceOverview } from "../../components/services/service-overview";
import { pageMeta } from "../../lib/cms/public/meta";

export async function loader(args: LoaderFunctionArgs) {
  return loadServiceDetail(args, "vocal_mix");
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.service.name,
    description: loaderData?.service.shortDescription,
  });

export default function VocalMixRoute() {
  const data = useLoaderData<typeof loader>();
  return <ServiceOverview {...data} />;
}
