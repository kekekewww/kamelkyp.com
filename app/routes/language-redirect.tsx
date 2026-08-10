import { type LoaderFunctionArgs, redirect } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return redirect(language.startsWith("zh") ? "/zh" : "/en");
}
