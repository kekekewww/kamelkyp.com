import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useLocation } from "react-router";
import { PlaybackCoordinator } from "../../lib/media/playback-coordinator";

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
