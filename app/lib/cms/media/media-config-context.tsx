/**
 * Media configuration for components (client-safe). The public layout and the
 * Studio root provide it from loader data; without a provider components get
 * `DEFAULT_MEDIA_CONFIG` (today's behaviour), so nothing breaks in isolation.
 */
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_MEDIA_CONFIG, type MediaConfig } from "./urls";

const MediaConfigContext = createContext<MediaConfig>(DEFAULT_MEDIA_CONFIG);

export function MediaConfigProvider({
  value,
  children,
}: {
  value: MediaConfig | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <MediaConfigContext.Provider value={value ?? DEFAULT_MEDIA_CONFIG}>
      {children}
    </MediaConfigContext.Provider>
  );
}

export function useMediaConfig(): MediaConfig {
  return useContext(MediaConfigContext);
}

/** Approved R2 hosts as a Set (what `parseMediaUrl` expects). */
export function useR2Hosts(): ReadonlySet<string> {
  const config = useMediaConfig();
  return useMemo(
    () => new Set(config.r2Hosts.map((host) => host.toLowerCase())),
    [config.r2Hosts],
  );
}
