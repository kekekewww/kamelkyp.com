import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  retryCaseAfterRefusal,
  VerifyActions,
} from "../../app/components/commission/commission-wizard";

const noop = () => {};

function actions(
  locale: "zh" | "en",
  overrides: Partial<Parameters<typeof VerifyActions>[0]> = {},
) {
  return renderToStaticMarkup(
    <VerifyActions
      locale={locale}
      termsChanged={false}
      reloading={false}
      canSubmit
      submitting={false}
      retrying={false}
      onBack={noop}
      onSubmit={noop}
      onReload={noop}
      {...overrides}
    />,
  );
}

describe("wizard verify actions", () => {
  it("submits by default", () => {
    const html = actions("en");
    expect(html).toContain("Back to review");
    expect(html).toContain("Submit commission");
    expect(html).not.toContain("Reload");
  });

  it("offers Reload instead of a submit that would fail again when the terms changed", () => {
    const zh = actions("zh", { termsChanged: true });
    expect(zh).toContain("返回複核");
    expect(zh).toContain("重新整理");
    expect(zh).not.toContain("送出委託");
    const en = actions("en", { termsChanged: true });
    expect(en).toMatch(/<button[^>]*type="button"[^>]*>Reload<\/button>/);
    expect(en).not.toContain("Submit commission");
    expect(en).not.toContain("Retry notification");
  });

  it("marks the reload as busy while the page data reloads", () => {
    const html = actions("en", { termsChanged: true, reloading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reload<\/button>/);
  });

  it("keeps the retry label for a pending notification", () => {
    expect(actions("zh", { retrying: true })).toContain("重試通知");
    expect(actions("en", { submitting: true })).toContain("Submitting…");
  });
});

describe("the pending retry after a refused submit", () => {
  const pending = "KAM-20260810-0000000003";

  it("stores the case a retry_required answer names", () => {
    expect(
      retryCaseAfterRefusal(null, {
        code: "retry_required",
        retryCaseId: pending,
      }),
    ).toBe(pending);
  });

  it("ends a pending retry when the terms changed", () => {
    // The case was hashed with the previous term versions; a retry with the
    // new ones can never match it, so the next submit starts a new case.
    expect(retryCaseAfterRefusal(pending, { code: "terms_changed" })).toBe(
      null,
    );
  });

  it("keeps a pending retry for every other refusal", () => {
    for (const code of ["validation_failed", "service_unavailable"]) {
      expect(retryCaseAfterRefusal(pending, { code })).toBe(pending);
    }
    expect(retryCaseAfterRefusal(pending, undefined)).toBe(pending);
    expect(retryCaseAfterRefusal(null, { code: "retry_required" })).toBe(null);
  });
});
