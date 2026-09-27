/**
 * Studio session (CSRF token) for every form and fetch (admin §3.4). The root
 * loader provides the first token; the provider refreshes it every 20 minutes
 * while the tab is visible and on window focus. React Router revalidation
 * after each action also brings a fresh token through `initial`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchStudioSession,
  SESSION_REFRESH_MS,
} from "../../../lib/cms/studio/session.client";

export interface StudioSessionValue {
  csrfToken: string;
  ownerEmail: string;
  /** Fetches a new token now (e.g. after a 403). */
  refresh: () => Promise<string | null>;
  setToken: (token: string) => void;
}

const StudioSessionContext = createContext<StudioSessionValue>({
  csrfToken: "",
  ownerEmail: "",
  refresh: async () => null,
  setToken: () => {},
});

export function StudioSessionProvider({
  initial,
  children,
}: {
  initial: { csrfToken: string; csrfExpiresAt: string; ownerEmail: string };
  children: React.ReactNode;
}) {
  const [csrfToken, setToken] = useState(initial.csrfToken);

  // A revalidated root loader brings a fresher token.
  useEffect(() => {
    setToken(initial.csrfToken);
  }, [initial.csrfToken]);

  const refresh = useCallback(async () => {
    const session = await fetchStudioSession();
    if (session) setToken(session.csrfToken);
    return session?.csrfToken ?? null;
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, SESSION_REFRESH_MS);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ csrfToken, ownerEmail: initial.ownerEmail, refresh, setToken }),
    [csrfToken, initial.ownerEmail, refresh],
  );
  return (
    <StudioSessionContext.Provider value={value}>
      {children}
    </StudioSessionContext.Provider>
  );
}

export function useStudioSession(): StudioSessionValue {
  return useContext(StudioSessionContext);
}
