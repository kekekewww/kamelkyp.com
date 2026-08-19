import { createContext, RouterContextProvider } from "react-router";
import type { Env } from "../env.server";

export interface CloudflareContextValue {
  env: Env;
  ctx: ExecutionContext;
  security: {
    nonce: string;
    requestId: string;
  };
}

export const cloudflareContext = createContext<CloudflareContextValue>();

export function createCloudflareContextProvider(
  env: Env,
  ctx: ExecutionContext,
  security: CloudflareContextValue["security"],
) {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, { env, ctx, security });
  return provider;
}
