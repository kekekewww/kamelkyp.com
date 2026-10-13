/**
 * Studio → Terms screens (wp2 §4.9, §6.1): static markup only. Dirty
 * tracking, backup restore and dialogs need a DOM and are covered by the
 * Studio e2e (`tests/e2e-studio/wp2-pricing-terms.spec.ts`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { TermEditor } from "../../app/components/studio/terms/term-editor";
import { TermsIndex } from "../../app/components/studio/terms/terms-index";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import type {
  TermEditorData,
  TermLocaleState,
  TermsIndexData,
  TermVersionSummary,
} from "../../app/lib/cms/repositories/terms.server";
import { TERM_OUTLINE } from "../../app/lib/commission/term-outline";

function render(element: React.ReactNode, path = "/") {
  const Stub = createRoutesStub([
    {
      path,
      Component: () => (
        <StudioSessionProvider
          initial={{ csrfToken: "csrf", csrfExpiresAt: "", ownerEmail: "o" }}
        >
          <ToastProvider>{element}</ToastProvider>
        </StudioSessionProvider>
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

const NOW = "2026-10-13T10:00:00.000Z";
const EMPTY: TermLocaleState = {
  live: null,
  liveEffective: false,
  draft: null,
};

function indexData(): TermsIndexData {
  const documents: TermsIndexData["documents"] = [
    {
      id: "common",
      kind: "common",
      serviceId: null,
      label: "General terms",
      publicPath: "/terms",
      locales: {
        zh: {
          live: {
            id: "v-common-zh-1",
            versionNumber: 1,
            createdAt: "2026-10-13T09:00:00.000Z",
            effectiveFrom: "2026-10-13T10:02:00.000Z",
            clauseCount: 17,
            live: true,
          },
          liveEffective: true,
          draft: {
            revision: 2,
            updatedAt: "2026-10-13T06:02:00.000Z",
            baseVersionId: "v-common-zh-1",
            clauseCount: 18,
          },
        },
        en: EMPTY,
      },
    },
    {
      id: "privacy",
      kind: "privacy",
      serviceId: null,
      label: "Privacy notice",
      publicPath: "/privacy",
      locales: {
        zh: EMPTY,
        en: {
          live: {
            id: "v-privacy-en-1",
            versionNumber: 1,
            createdAt: "2026-10-13T09:00:00.000Z",
            effectiveFrom: "2027-01-01T00:00:00.000Z",
            clauseCount: 4,
            live: true,
          },
          liveEffective: false,
          draft: null,
        },
      },
    },
  ];
  return {
    documents,
    readiness: [
      {
        serviceId: "full_mix",
        serviceStatus: "published",
        price: { versionId: "full-2026-08-10", baseTwd: 8000 },
        terms: {
          zh: { ready: false, missing: ["privacy", "full-mix"] },
          en: { ready: false, missing: ["common", "privacy", "full-mix"] },
        },
        open: { zh: false, en: false },
      },
    ],
    serviceNames: { full_mix: { zh: "完整歌曲混音", en: "Full Song Mixing" } },
    now: NOW,
  };
}

describe("TermsIndex", () => {
  it("shows the document x locale matrix with live, draft and not-published words", () => {
    const html = render(<TermsIndex data={indexData()} />);
    expect(html).toContain("<title>Terms — KAMEL STUDIO</title>");
    expect(html).toContain(
      "Published versions never change: editing creates a draft",
    );
    expect(html).toContain("v1 · live since 2026-10-13 18:02");
    expect(html).toContain("Draft · edited 2026-10-13 14:02");
    expect(html).toContain("Not published");
    expect(html).toContain("Not yet effective (2027-01-01 08:00)");
    expect(html).toContain('href="/studio/services/terms/common/zh"');
    expect(html).toContain('href="/studio/services/terms/privacy/en"');
    expect(html).toContain("Commission form availability");
    expect(html).toContain(
      "terms missing: Privacy notice (ZH), Service terms (ZH)",
    );
  });
});

const LIVE: TermVersionSummary = {
  id: "v-common-zh-1",
  versionNumber: 1,
  createdAt: "2026-10-12T09:00:00.000Z",
  effectiveFrom: "2026-10-12T10:00:00.000Z",
  clauseCount: 1,
  live: true,
  clauses: [{ key: "deposit", title: "訂金", text: "示範條文。" }],
};

function editorData(
  locale: "zh" | "en",
  overrides: Partial<TermEditorData> = {},
): TermEditorData {
  return {
    document: {
      id: "common",
      kind: "common",
      serviceId: null,
      label: "General terms",
      publicPath: "/terms",
    },
    locale,
    otherLocale: locale === "zh" ? "en" : "zh",
    live: LIVE,
    liveEffective: true,
    draft: null,
    otherLocaleKeys: ["deposit", "final_payment"],
    history: [LIVE],
    issues: [],
    diff: null,
    expected: TERM_OUTLINE.common,
    activeAmounts: null,
    now: NOW,
    ...overrides,
  };
}

describe("TermEditor", () => {
  it("renders the ZH editor with language-tagged clause inputs and the legal gate", () => {
    const html = render(<TermEditor data={editorData("zh")} />);
    expect(html).toContain("<title>General terms · ZH — KAMEL STUDIO</title>");
    expect(html).toMatch(/name="clauses\.0\.key"/);
    expect(html).toMatch(
      /lang="zh-Hant"[^>]*name="clauses\.0\.title"|name="clauses\.0\.title"[^>]*lang="zh-Hant"/,
    );
    expect(html).toMatch(
      /name="clauses\.0\.text"[^>]*lang="zh-Hant"|lang="zh-Hant"[^>]*name="clauses\.0\.text"/,
    );
    expect(html).toContain('value="訂金"');
    // Legal review: present, never pre-checked, with the disclaimer.
    expect(html).toMatch(/<input[^>]*name="legalReviewConfirmed"[^>]*>/);
    expect(html).not.toMatch(
      /<input[^>]*name="legalReviewConfirmed"[^>]*checked/,
    );
    expect(html).toContain(
      "A qualified legal professional has reviewed this version.",
    );
    expect(html).toContain(
      "This confirmation does not replace professional legal advice.",
    );
    expect(html).toContain("Publish ZH version");
    expect(html).toContain("Preview changes");
    expect(html).toMatch(/name="locale"[^>]*value="zh"/);
    expect(html).toContain("LIVE v1");
    expect(html).toContain("Switch to EN");
    expect(html).toContain('href="/studio/services/terms/common/en"');
    // Expected outline with topics.
    expect(html).toContain("payment_methods");
    expect(html).toContain("Payment methods");
    // History with the LIVE marker.
    expect(html).toContain("History");
    expect(html).toMatch(/v1[\s\S]*LIVE/);
    expect(html).toContain("Use as starting point");
  });

  it("names the blocking issues on the Publish button", () => {
    const html = render(
      <TermEditor
        data={editorData("zh", {
          issues: [
            {
              field: "clauses",
              code: "unchanged",
              severity: "error",
              message: "Nothing to publish: this matches the live version.",
            },
          ],
        })}
      />,
    );
    expect(html).toContain("Publish · 1 issue");
    expect(html).not.toContain("Publish ZH version");
    expect(html).toContain(
      "Nothing to publish: this matches the live version.",
    );
  });

  it("tags EN clause inputs, offers start-over options without fixture text, and shows a draft", () => {
    const html = render(
      <TermEditor
        data={editorData("en", {
          live: null,
          history: [],
          liveEffective: false,
          draft: {
            clauses: [{ key: "scope", title: "Scope", text: "Draft text." }],
            revision: 3,
            updatedAt: "2026-10-13T09:30:00.000Z",
            baseVersionId: null,
          },
          diff: { added: ["scope"], removed: [], changed: [], unchanged: 0 },
          issues: [],
        })}
      />,
    );
    expect(html).toMatch(
      /name="clauses\.0\.title"[^>]*lang="en"|lang="en"[^>]*name="clauses\.0\.title"/,
    );
    expect(html).toContain("NOT PUBLISHED");
    expect(html).toContain("DRAFT");
    expect(html).toMatch(/name="expectedRevision"[^>]*value="3"/);
    expect(html).toContain("0 changed · 1 new · 0 removed");
    expect(html).toContain("Publish EN version");
    expect(html).toMatch(/name="locale"[^>]*value="en"/);
    expect(html).toContain("Start blank");
    expect(html).toContain("Copy clause keys from ZH");
    expect(html).toContain("Start from the expected outline");
    expect(html).toContain("Discard draft");
    // The e2e fixture text is never offered as a starting point.
    expect(html).not.toContain("接受銀行匯款或 PayPal");
    expect(html).not.toContain("付款方式");
  });
});
