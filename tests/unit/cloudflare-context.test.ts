import { describe, expect, it } from "vitest";
import {
  cloudflareContext,
  createCloudflareContextProvider,
} from "../../app/lib/cloudflare/context";
import type { Env } from "../../app/lib/env.server";

describe("Cloudflare request context", () => {
  it("round-trips the Worker bindings and execution context", () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    const provider = createCloudflareContextProvider(env, ctx);

    expect(provider.get(cloudflareContext)).toEqual({ env, ctx });
  });
});
