import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { ExternalMediaLink } from "./external-media-link";
import { usePlayback } from "./playback-provider";

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
  const waveformContainer = useRef<HTMLDivElement>(null);
  const waveSurfer = useRef<WaveSurfer | null>(null);
  const nativeAudio = useRef<HTMLAudioElement>(null);
  const disposed = useRef(false);
  const playWhenReady = useRef(false);
  const waveformReady = useRef(false);
  const [activated, setActivated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nativeFallback, setNativeFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);

  function markPaused() {
    playWhenReady.current = false;
    setPlaying(false);
    coordinator.markPaused(item.id);
  }

  function pauseCurrent() {
    waveSurfer.current?.pause();
    nativeAudio.current?.pause();
    markPaused();
  }

  function resetToStart(instance: WaveSurfer | HTMLAudioElement) {
    const start = item.startSeconds ?? 0;
    if ("setTime" in instance) instance.setTime(start);
    else instance.currentTime = start;
    setCurrentSeconds(Math.floor(start));
  }

  function handleTimeUpdate(seconds: number) {
    setCurrentSeconds(Math.floor(seconds));
    if (waveSurfer.current && !waveformReady.current) return;
    if (item.startSeconds !== null && seconds < item.startSeconds) {
      const instance = waveSurfer.current ?? nativeAudio.current;
      if (instance) resetToStart(instance);
      return;
    }
    if (
      enforcePreviewBounds(seconds, item.startSeconds, item.endSeconds) ===
      "stop"
    ) {
      pauseCurrent();
      const instance = waveSurfer.current ?? nativeAudio.current;
      if (instance) resetToStart(instance);
    }
  }

  useEffect(() => {
    disposed.current = false;
    const unregister = coordinator.register(item.id, () => {
      waveSurfer.current?.pause();
      nativeAudio.current?.pause();
      playWhenReady.current = false;
      setPlaying(false);
      coordinator.markPaused(item.id);
    });
    return () => {
      disposed.current = true;
      unregister();
      waveSurfer.current?.destroy();
      waveSurfer.current = null;
      nativeAudio.current?.pause();
    };
  }, [coordinator, item.id]);

  async function initializeWaveform() {
    if (!waveformContainer.current || waveSurfer.current) return;
    setActivated(true);
    setLoading(true);
    setCurrentSeconds(Math.floor(item.startSeconds ?? 0));
    playWhenReady.current = true;

    try {
      const { default: WaveSurferModule } = await import("wavesurfer.js");
      if (disposed.current || !waveformContainer.current) return;

      const instance = WaveSurferModule.create({
        container: waveformContainer.current,
        url: item.url,
        height: 72,
        waveColor: "#A9B3BC",
        progressColor: "#FF5C4D",
        cursorColor: "#FF5C4D",
      });
      waveSurfer.current = instance;
      waveformReady.current = false;

      instance.on("ready", async () => {
        if (disposed.current || waveSurfer.current !== instance) return;
        setLoading(false);
        const shouldPlay = playWhenReady.current;
        setCurrentSeconds(Math.floor(item.startSeconds ?? 0));
        if (!shouldPlay) return;
        playWhenReady.current = true;
        coordinator.markPlaying(item.id);
        await instance.play(
          item.startSeconds ?? undefined,
          item.endSeconds ?? undefined,
        );
      });
      instance.on("play", () => {
        waveformReady.current = true;
        setPlaying(true);
        coordinator.markPlaying(item.id);
      });
      instance.on("pause", markPaused);
      instance.on("finish", markPaused);
      instance.on("timeupdate", handleTimeUpdate);
      instance.on("error", () => {
        if (disposed.current || waveSurfer.current !== instance) return;
        waveSurfer.current = null;
        waveformReady.current = false;
        instance.destroy();
        setLoading(false);
        setPlaying(false);
        setNativeFallback(true);
      });
    } catch {
      if (!disposed.current) {
        setLoading(false);
        setPlaying(false);
        setNativeFallback(true);
      }
    }
  }

  async function togglePlayback() {
    if (!activated) {
      await initializeWaveform();
      return;
    }

    const instance = waveSurfer.current;
    if (instance) {
      if (instance.isPlaying()) {
        pauseCurrent();
        return;
      }
      if (
        enforcePreviewBounds(
          instance.getCurrentTime(),
          item.startSeconds,
          item.endSeconds,
        ) === "stop"
      ) {
        resetToStart(instance);
      }
      playWhenReady.current = true;
      coordinator.markPlaying(item.id);
      await instance.play(undefined, item.endSeconds ?? undefined);
      return;
    }

    if (nativeFallback && nativeAudio.current) {
      if (!nativeAudio.current.paused) {
        pauseCurrent();
        return;
      }
      resetToStart(nativeAudio.current);
      coordinator.markPlaying(item.id);
      await nativeAudio.current.play();
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
      <div
        className="media-waveform"
        ref={waveformContainer}
        aria-hidden="true"
      />
      {nativeFallback ? (
        <div className="direct-audio__fallback">
          <audio
            ref={nativeAudio}
            src={item.url}
            controls
            controlsList="nodownload"
            preload="none"
            onPause={markPaused}
            onPlay={() => {
              setPlaying(true);
              coordinator.markPlaying(item.id);
            }}
            onTimeUpdate={(event) =>
              handleTimeUpdate(event.currentTarget.currentTime)
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
