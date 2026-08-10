import {
  createContext,
  RouterContextProvider,
} from "react-router";
import type { Env } from "../env.server";

export interface CloudflareContextValue {
  env: Env;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareContextValue>();

export function createCloudflareContextProvider(
  env: Env,
  ctx: ExecutionContext,
) {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, { env, ctx });
  return provider;
}
