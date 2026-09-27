/**
 * `POST /api/studio/media-register` (JSON, `X-Studio-CSRF`) registers an
 * external URL as a ready asset → `{ asset: MediaSummary }` (201). Always
 * available, with or without uploads (content-architecture §4.8).
 */
import { z } from "zod";
import { registerExternalAsset } from "../../../lib/cms/media/assets.server";
import { readMediaConfig } from "../../../lib/cms/media/config.server";
import { toMediaSummary } from "../../../lib/cms/media/summary";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import {
  cmsErrorJson,
  jsonError,
  jsonOk,
} from "../../../lib/cms/studio/responses";

const text = z
  .object({
    zh: z.string().trim().max(300).default(""),
    en: z.string().trim().max(300).default(""),
  })
  .default({ zh: "", en: "" });

const RegisterSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  title: text,
  alt: text,
});

export const action = withOwnerMutation(async ({ request, db, env, now }) => {
  if (request.method.toUpperCase() !== "POST") {
    return jsonError("method_not_allowed", 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", 400);
  }
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return jsonError("invalid_request", 422);
  const config = readMediaConfig(env);
  try {
    const asset = await registerExternalAsset(db, parsed.data, config, now);
    return jsonOk({ asset: toMediaSummary(asset, config) }, { status: 201 });
  } catch (error) {
    return cmsErrorJson(error);
  }
});
