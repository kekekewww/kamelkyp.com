import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import {
  attachAnalyser,
  follow,
  isCorsAudioHost,
  readBands,
} from "../../lib/motion/audio-level";
import { loop } from "../../lib/motion/frame";
import { getMotionTier } from "../../lib/motion/reduced-motion";
import { DUR, EASE } from "../../lib/motion/tokens";
import { ExternalMediaLink } from "./external-media-link";
import { usePlayback } from "./playback-provider";

const WAVEFORM_BARS = Array.from({ length: 32 }, (_, index) => index);

export function enforcePreviewBounds(
  currentSeconds: number,
  startSeconds: number | null,
  endSeconds: number | null,
): "continue" | "stop" {
  if (endSeconds !== null && currentSeconds >= endSeconds) return "stop";
  if (startSeconds !== null && currentSeconds < startSeconds) return "stop";
  return "continue";
}

export function DirectAudioPreview({
  item,
  locale,
}: {
  item: MediaItem;
  locale: Locale;
}) {
  const coordinator = usePlayback();
  const streamAudio = useRef<HTMLAudioElement | null>(null);
  const fallbackAudio = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const stopBars = useRef<(() => void) | null>(null);
  const disposed = useRef(false);
  const [activated, setActivated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nativeFallback, setNativeFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);

  function markPaused() {
    setPlaying(false);
    coordinator.markPaused(item.id);
    coordinator.setLevelSource(item.id, {
      analyser: analyserRef.current,
      playing: false,
    });
    settleBars();
  }

  function markLevelPlaying() {
    coordinator.setLevelSource(item.id, {
      analyser: analyserRef.current,
      playing: true,
    });
    startBars();
  }

  /** Audio-reactive bars (motion-system §2.8): 30fps, only with an analyser. */
  function startBars() {
    const analyser = analyserRef.current;
    const waveform = waveformRef.current;
    if (!analyser || !waveform || stopBars.current) return;
    if (getMotionTier() === "static") return;
    const bars = Array.from(waveform.children) as HTMLElement[];
    const bands = new Float32Array(bars.length);
    const values = new Float32Array(bars.length).fill(1);
    let skip = false;
    stopBars.current = loop((_now, dt) => {
      skip = !skip;
      if (skip) return undefined;
      readBands(analyser, bands);
      bars.forEach((bar, index) => {
        const target = 0.15 + 0.85 * bands[index];
        values[index] = follow(values[index], target, dt * 2, 0.5, 0.12);
        bar.style.transform = `scaleY(${(values[index] * 1.6).toFixed(3)})`;
      });
      return undefined;
    });
  }

  function settleBars() {
    stopBars.current?.();
    stopBars.current = null;
    const waveform = waveformRef.current;
    if (!waveform) return;
    for (const bar of Array.from(waveform.children) as HTMLElement[]) {
      const from = bar.style.transform;
      bar.style.transform = "";
      if (from && typeof bar.animate === "function") {
        bar.animate([{ transform: from }, { transform: "none" }], {
          duration: DUR.d3,
          easing: EASE.weighted,
        });
      }
    }
  }

  function disposeStream(instance = streamAudio.current) {
    if (!instance) return;
    instance.onloadedmetadata = null;
    instance.onplay = null;
    instance.onpause = null;
    instance.onended = null;
    instance.ontimeupdate = null;
    instance.onerror = null;
    instance.pause();
    instance.removeAttribute("src");
    instance.load();
    if (streamAudio.current === instance) streamAudio.current = null;
    analyserRef.current = null;
    stopBars.current?.();
    stopBars.current = null;
    coordinator.setLevelSource(item.id, null);
  }

  function pauseCurrent() {
    streamAudio.current?.pause();
    fallbackAudio.current?.pause();
    markPaused();
  }

  function resetToStart(instance: HTMLAudioElement) {
    const start = item.startSeconds ?? 0;
    try {
      instance.currentTime = start;
    } catch {
      // Metadata can still be loading during the first click. The
      // loadedmetadata handler applies the same bound before playback.
    }
    setCurrentSeconds(Math.floor(start));
  }

  function handleTimeUpdate(seconds: number, instance: HTMLAudioElement) {
    setCurrentSeconds(Math.floor(seconds));
    if (item.startSeconds !== null && seconds < item.startSeconds) {
      resetToStart(instance);
      return;
    }
    if (
      enforcePreviewBounds(seconds, item.startSeconds, item.endSeconds) ===
      "stop"
    ) {
      pauseCurrent();
      resetToStart(instance);
    }
  }

  function showFallback(instance?: HTMLAudioElement) {
    if (disposed.current) return;
    if (instance && streamAudio.current !== instance) return;
    disposeStream(instance);
    setLoading(false);
    setPlaying(false);
    setNativeFallback(true);
    coordinator.markPaused(item.id);
  }

  useEffect(() => {
    disposed.current = false;
    const unregister = coordinator.register(item.id, () => {
      streamAudio.current?.pause();
      fallbackAudio.current?.pause();
      setPlaying(false);
      coordinator.markPaused(item.id);
    });
    return () => {
      disposed.current = true;
      unregister();
      const instance = streamAudio.current;
      if (instance) {
        instance.onloadedmetadata = null;
        instance.onplay = null;
        instance.onpause = null;
        instance.onended = null;
        instance.ontimeupdate = null;
        instance.onerror = null;
        instance.pause();
        instance.removeAttribute("src");
        instance.load();
        streamAudio.current = null;
      }
      fallbackAudio.current?.pause();
      stopBars.current?.();
      stopBars.current = null;
    };
  }, [coordinator, item.id]);

  async function startStream() {
    setActivated(true);
    setLoading(true);
    setCurrentSeconds(Math.floor(item.startSeconds ?? 0));

    const instance = new Audio();
    // CORS gate (motion-system §4.5): only allowlisted / same-origin hosts get
    // crossOrigin + Web Audio routing; routing a non-CORS element would silence it.
    const analysable = isCorsAudioHost(item.url);
    if (analysable) instance.crossOrigin = "anonymous";
    instance.preload = "metadata";
    instance.src = item.url;
    streamAudio.current = instance;
    // Still inside the click handler: AudioContext creation/resume is allowed.
    analyserRef.current = analysable ? attachAnalyser(instance) : null;
    instance.onloadedmetadata = () => resetToStart(instance);
    instance.onplay = () => {
      if (disposed.current || streamAudio.current !== instance) return;
      setLoading(false);
      setPlaying(true);
      coordinator.markPlaying(item.id);
      markLevelPlaying();
    };
    instance.onpause = () => {
      if (!disposed.current && streamAudio.current === instance) markPaused();
    };
    instance.onended = markPaused;
    instance.ontimeupdate = () =>
      handleTimeUpdate(instance.currentTime, instance);
    instance.onerror = () => showFallback(instance);

    resetToStart(instance);
    coordinator.markPlaying(item.id);
    try {
      await instance.play();
    } catch {
      showFallback(instance);
    }
  }

  async function togglePlayback() {
    if (!activated) {
      await startStream();
      return;
    }

    const instance = streamAudio.current;
    if (instance) {
      if (!instance.paused) {
        pauseCurrent();
        return;
      }
      if (
        enforcePreviewBounds(
          instance.currentTime,
          item.startSeconds,
          item.endSeconds,
        ) === "stop"
      ) {
        resetToStart(instance);
      }
      coordinator.markPlaying(item.id);
      try {
        await instance.play();
      } catch {
        showFallback(instance);
      }
      return;
    }

    if (nativeFallback && fallbackAudio.current) {
      if (!fallbackAudio.current.paused) {
        pauseCurrent();
        return;
      }
      resetToStart(fallbackAudio.current);
      coordinator.markPlaying(item.id);
      await fallbackAudio.current.play();
    }
  }

  const action = locale === "zh" ? "播放" : "Play";

  return (
    <div
      className="direct-audio"
      data-current-seconds={currentSeconds}
      data-player-state={loading ? "loading" : playing ? "playing" : "paused"}
    >
      <button
        type="button"
        aria-label={`${action} ${item.title}`}
        aria-pressed={playing}
        disabled={loading}
        onClick={togglePlayback}
      >
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
      </button>
      <div className="media-waveform" aria-hidden="true" ref={waveformRef}>
        {WAVEFORM_BARS.map((bar) => (
          <span key={bar} />
        ))}
      </div>
      {nativeFallback ? (
        <div className="direct-audio__fallback">
          <audio
            ref={fallbackAudio}
            src={item.url}
            controls
            controlsList="nodownload"
            preload="none"
            onPause={markPaused}
            onPlay={() => {
              setPlaying(true);
              coordinator.markPlaying(item.id);
              markLevelPlaying();
            }}
            onTimeUpdate={(event) =>
              handleTimeUpdate(
                event.currentTarget.currentTime,
                event.currentTarget,
              )
            }
          >
            <track kind="captions" />
          </audio>
          <ExternalMediaLink url={item.url} locale={locale} />
        </div>
      ) : null}
    </div>
  );
}
