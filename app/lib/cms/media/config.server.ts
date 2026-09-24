/**
 * Media configuration from the Worker environment (content-architecture
 * §3.11, §4). Misconfiguration fails safe: an invalid base URL disables
 * uploads and R2 URLs; CORS hosts fall back to today's GitHub-raw-only list.
 */
import type { Env } from "../../env.server";
import { DEFAULT_MEDIA_CONFIG, LEGACY_R2_HOST, type MediaConfig } from "./urls";

const HOST =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function parsePublicBaseUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function parseHostList(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return hosts.filter((host) => HOST.test(host));
}

export function readMediaConfig(
  env: Pick<
    Env,
    | "MEDIA"
    | "MEDIA_PUBLIC_BASE_URL"
    | "MEDIA_CORS_HOSTS"
    | "IMAGE_TRANSFORMATIONS"
  >,
): MediaConfig {
  const publicBaseUrl = parsePublicBaseUrl(env.MEDIA_PUBLIC_BASE_URL);
  const baseHost = publicBaseUrl ? new URL(publicBaseUrl).hostname : null;
  const r2Hosts = [
    ...new Set([...(baseHost ? [baseHost] : []), LEGACY_R2_HOST]),
  ];
  const corsHosts = parseHostList(env.MEDIA_CORS_HOSTS) ?? [
    ...DEFAULT_MEDIA_CONFIG.corsHosts,
  ];
  return {
    publicBaseUrl,
    uploadsEnabled: Boolean(env.MEDIA) && publicBaseUrl !== null,
    corsHosts,
    r2Hosts,
    imageTransformations: env.IMAGE_TRANSFORMATIONS === "on",
  };
}
