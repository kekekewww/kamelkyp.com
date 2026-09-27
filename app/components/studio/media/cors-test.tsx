/**
 * "Test CORS" (content-architecture §4.6): loads the audio's metadata in an
 * `<audio crossorigin="anonymous">`. Success means the host sends the CORS
 * header, so it can be added to `MEDIA_CORS_HOSTS` and the public player may
 * analyse it. Nothing plays: only metadata is requested.
 */
import { useEffect, useRef, useState } from "react";

type Result = "idle" | "testing" | "ok" | "failed";

const TIMEOUT_MS = 10_000;

export function CorsTest({ url, host }: { url: string; host: string }) {
  const [result, setResult] = useState<Result>("idle");
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const run = () => {
    cleanup.current?.();
    setResult("testing");
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    const timer = window.setTimeout(() => finish("failed"), TIMEOUT_MS);
    const finish = (outcome: Result) => {
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      cleanup.current = null;
      setResult(outcome);
    };
    cleanup.current = () => finish("idle");
    audio.onloadedmetadata = () => finish("ok");
    audio.onerror = () => finish("failed");
    audio.src = url;
  };

  return (
    <div className="studio-cors-test">
      <button
        type="button"
        className="studio-btn studio-btn--secondary studio-btn--compact"
        aria-busy={result === "testing" || undefined}
        disabled={result === "testing"}
        onClick={run}
      >
        {result === "testing" ? "Testing…" : "Test CORS"}
      </button>
      <p className="studio-hint" role="status">
        {result === "ok"
          ? `${host} sends CORS headers. Add it to MEDIA_CORS_HOSTS to turn on audio analysis there.`
          : result === "failed"
            ? `${host} did not answer with CORS headers (or the file did not load). Keep analysis off until the bucket's CORS rule is in place.`
            : result === "testing"
              ? "Loading the file's metadata with CORS…"
              : "Checks whether this file's host allows audio analysis."}
      </p>
    </div>
  );
}
