import { useEffect, useRef } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback(token: string): void;
      "expired-callback"(): void;
      "error-callback"(): void;
      theme: "dark";
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
  onError,
}: {
  siteKey: string;
  action: string;
  onToken(token: string): void;
  onError(): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;

    function render() {
      if (!active || !containerRef.current || !window.turnstile || widgetId) {
        return;
      }
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "dark",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onErrorRef.current(),
        "error-callback": () => onErrorRef.current(),
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", render);
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      render();
    }

    return () => {
      active = false;
      script.removeEventListener("load", render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, siteKey]);

  return <div className="turnstile-widget" ref={containerRef} />;
}
