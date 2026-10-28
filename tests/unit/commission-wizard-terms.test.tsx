import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerifyActions } from "../../app/components/commission/commission-wizard";

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
