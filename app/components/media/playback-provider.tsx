import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useLocation } from "react-router";
import {
  type LevelSource,
  PlaybackCoordinator,
} from "../../lib/media/playback-coordinator";

const PlaybackContext = createContext<PlaybackCoordinator | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <PlaybackBoundary key={location.pathname}>{children}</PlaybackBoundary>
  );
}

function PlaybackBoundary({ children }: { children: ReactNode }) {
  const coordinator = useMemo(() => new PlaybackCoordinator(), []);

  useEffect(() => {
    return () => coordinator.stopAll();
  }, [coordinator]);

  return (
    <PlaybackContext.Provider value={coordinator}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback(): PlaybackCoordinator {
  const coordinator = useContext(PlaybackContext);
  if (!coordinator) {
    throw new Error("playback_provider_required");
  }
  return coordinator;
}

const serverLevel = () => null;

/**
 * Re-renders on level-source changes (play / pause / dispose), not per frame.
 * For per-frame amplitude (hero canvas), subscribe inside an effect instead:
 *
 *   const playback = usePlayback();
 *   useEffect(() => playback.subscribeLevel((source) => { levelSource = source; }), [playback]);
 *   // in the rAF loop: source?.analyser && source.playing ? readLevel(source.analyser) : 0
 *   // (readLevel / readLowBand / follow from app/lib/motion/audio-level.ts)
 *   // playing && !analyser → state-only envelope (gain 1 → 1.35 over 1.2s).
 */
export function usePlaybackLevel(): LevelSource | null {
  const coordinator = usePlayback();
  const subscribe = useCallback(
    (onChange: () => void) => coordinator.subscribeLevel(() => onChange()),
    [coordinator],
  );
  return useSyncExternalStore(
    subscribe,
    () => coordinator.getLevelSource(),
    serverLevel,
  );
}
