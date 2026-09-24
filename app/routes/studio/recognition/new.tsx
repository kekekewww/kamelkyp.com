/** `/studio/recognition/new`: quick create → 303 to the editor. */
import { useLoaderData } from "react-router";
import { RecognitionNew } from "../../../components/studio/recognition/recognition-new";
import {
  handleRecognitionCreate,
  loadRecognitionNew,
} from "../../../lib/cms/repositories/recognition.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import recognitionStyles from "../../../styles/studio/recognition.css?url";

export const links = () => [{ rel: "stylesheet", href: recognitionStyles }];

export const loader = withOwner(loadRecognitionNew);

export const action = withOwnerMutation(handleRecognitionCreate);

export default function NewRecognitionRoute() {
  const data = useLoaderData<typeof loader>();
  return <RecognitionNew types={data.types} />;
}
