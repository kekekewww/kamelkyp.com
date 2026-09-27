/**
 * `StudioForm`: a React Router `<Form>` (or `fetcher.Form`) that always posts
 * with the current CSRF token. Actions dispatch on the submit button's
 * `intent` (`IntentButton`); unknown intents answer 422.
 */
import { forwardRef } from "react";
import { type FetcherWithComponents, Form, type FormProps } from "react-router";
import { useStudioSession } from "./studio-session";

type StudioFormProps = Omit<FormProps, "method"> & {
  method?: "post" | "put" | "patch" | "delete";
  /** Submit through a fetcher (no navigation). */
  fetcher?: FetcherWithComponents<unknown>;
};

export const StudioForm = forwardRef<HTMLFormElement, StudioFormProps>(
  function StudioForm({ fetcher, children, method = "post", ...rest }, ref) {
    const { csrfToken } = useStudioSession();
    const token = <input type="hidden" name="csrfToken" value={csrfToken} />;
    if (fetcher) {
      return (
        <fetcher.Form ref={ref} method={method} {...rest}>
          {token}
          {children}
        </fetcher.Form>
      );
    }
    return (
      <Form ref={ref} method={method} {...rest}>
        {token}
        {children}
      </Form>
    );
  },
);

export function CsrfField() {
  const { csrfToken } = useStudioSession();
  return <input type="hidden" name="csrfToken" value={csrfToken} />;
}

export function IntentButton({
  intent,
  variant = "secondary",
  compact = false,
  pending = false,
  pendingLabel,
  children,
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "name" | "value"> & {
  intent: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  compact?: boolean;
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      className={[
        "studio-btn",
        `studio-btn--${variant}`,
        compact ? "studio-btn--compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
