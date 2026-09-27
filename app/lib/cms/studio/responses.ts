/**
 * Studio action result shape (client-safe types + server helpers).
 *
 *   { ok: true, ...payload }                                 success
 *   { ok: false, code, message, issues?, details? }         failure
 *
 * Status codes (admin-architecture §3.5): 403 auth (thrown by the guard),
 * 409 stale revision / conflicts, 413 too large, 415 type not allowed,
 * 422 validation (with `issues`), 503 uploads not configured.
 */
import { data } from "react-router";
import {
  CMS_ERROR_MESSAGES,
  type CmsErrorCode,
  isCmsError,
} from "../db/errors";
import type { ValidationIssue } from "../types";

export type ActionOk<T extends object = object> = { ok: true } & T;

export type ActionError = {
  ok: false;
  code: string;
  message: string;
  issues?: ValidationIssue[];
  details?: unknown;
};

export type ActionResult<T extends object = object> = ActionOk<T> | ActionError;

export function isActionError(value: unknown): value is ActionError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false
  );
}

/** Success for route actions (serialized by React Router; fetchers read it). */
export function actionOk<T extends object>(payload?: T, init?: ResponseInit) {
  return data({ ok: true as const, ...(payload ?? ({} as T)) }, init);
}

/** Failure for route actions, with the HTTP status the client can branch on. */
export function actionError(
  code: string,
  options: {
    status?: number;
    message?: string;
    issues?: ValidationIssue[];
    details?: unknown;
  } = {},
) {
  const body: ActionError = {
    ok: false,
    code,
    message:
      options.message ??
      CMS_ERROR_MESSAGES[code as CmsErrorCode] ??
      "The action could not be completed.",
    ...(options.issues ? { issues: options.issues } : {}),
    ...(options.details !== undefined ? { details: options.details } : {}),
  };
  return data(body, { status: options.status ?? 422 });
}

function issuesOf(details: unknown): ValidationIssue[] | undefined {
  if (details && typeof details === "object" && "issues" in details) {
    const issues = (details as { issues?: unknown }).issues;
    return Array.isArray(issues) ? (issues as ValidationIssue[]) : undefined;
  }
  return undefined;
}

/** Maps a thrown CmsError to `actionError`; rethrows anything else. */
export function cmsErrorResult(error: unknown) {
  if (!isCmsError(error)) throw error;
  const issues = issuesOf(error.details);
  return actionError(error.code, {
    status: error.status,
    ...(issues ? { issues } : { details: error.details }),
  });
}

/** Runs a handler, turning CmsErrors into action results. */
export async function withCmsErrors<T>(
  run: () => Promise<T>,
): Promise<T | ReturnType<typeof actionError>> {
  try {
    return await run();
  } catch (error) {
    return cmsErrorResult(error);
  }
}

export function unknownIntent(intent: string | null) {
  return actionError("unknown_intent", {
    status: 422,
    message: `Unknown action${intent ? ` "${intent}"` : ""}.`,
  });
}

/** JSON helpers for /api/studio/* resource routes (fetch clients). */
export function jsonOk<T>(body: T, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) },
  });
}

export function jsonError(
  code: string,
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    {
      code,
      message:
        CMS_ERROR_MESSAGES[code as CmsErrorCode] ??
        "The request could not be completed.",
      ...extra,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** CmsError → JSON error response for API routes; rethrows anything else. */
export function cmsErrorJson(error: unknown): Response {
  if (!isCmsError(error)) throw error;
  const issues = issuesOf(error.details);
  return jsonError(error.code, error.status, issues ? { issues } : {});
}
