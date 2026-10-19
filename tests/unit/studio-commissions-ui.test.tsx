/**
 * Studio Commissions inbox markup (wp1 §7.1): server-rendered with
 * react-dom/server inside a routes stub, the same way as the home tests.
 * Real data privacy (sentinels) is the worker and e2e tests' job; this
 * checks what the components themselves print.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import {
  CleanupDialog,
  cleanupSubmission,
} from "../../app/components/studio/commissions/cleanup-dialog";
import { CommissionsInbox } from "../../app/components/studio/commissions/commissions-inbox";
import { cleanupFeedback } from "../../app/components/studio/commissions/needs-action";
import {
  EMPTY_QUEUE,
  enqueueSubmission,
  queuedCaseIds,
  STALE_PAGE_CODES,
  settleSubmission,
  trackSubmission,
  useCommissionAction,
} from "../../app/components/studio/commissions/use-commission-action";
import { focusFallbackAfter } from "../../app/components/studio/commissions/use-focus-fallback";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import type {
  CleanupDueItem,
  CommissionCaseRow,
  CommissionsModel,
} from "../../app/lib/cms/schemas/commission";

function render(element: React.ReactNode, path = "/studio/commissions") {
  const Stub = createRoutesStub([
    {
      path: "/studio/commissions",
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

const SERVICES: CommissionsModel["services"] = [
  { id: "full_mix", name: { zh: "完整歌曲混音", en: "Full Song Mixing" } },
  { id: "vocal_mix", name: { zh: "Vocal 混音", en: "Vocal Mixing" } },
  {
    id: "simple_transition",
    name: { zh: "單純歌曲銜接", en: "Simple Song Transition" },
  },
  {
    id: "edit_transition",
    name: { zh: "編輯／剪輯歌曲銜接", en: "Edited Song Transition" },
  },
];

const ID_1 = "KAM-20261001-E2E0000001";
const ID_2 = "KAM-20261001-E2E0000002";
const ID_3 = "KAM-20261001-E2E0000003";
const ID_4 = "KAM-20261001-E2E0000004";
const ID_5 = "KAM-20261001-E2E0000005";

const DUE: CleanupDueItem = {
  caseId: ID_4,
  serviceId: "simple_transition",
  status: "delivered",
  submittedAt: "2026-10-01T04:00:00.000Z",
  cleanupDueAt: "2026-10-08T00:00:00.000Z",
  studentReviewPending: false,
};

const DELIVERED: CommissionCaseRow = {
  caseId: ID_4,
  serviceId: "simple_transition",
  lockedPriceMinor: 1000,
  currency: "TWD",
  submittedAt: "2026-10-01T04:00:00.000Z",
  status: "delivered",
  cleanupDueAt: "2026-10-08T00:00:00.000Z",
  studentReviewPending: false,
  temporaryRecords: "kept",
};

function model(overrides: Partial<CommissionsModel> = {}): CommissionsModel {
  return {
    now: "2026-10-13T10:00:00.000Z",
    query: { status: null, service: null, cursor: null },
    cursorRejected: false,
    services: SERVICES,
    cases: [
      DELIVERED,
      {
        caseId: ID_3,
        serviceId: "full_mix",
        lockedPriceMinor: 5600,
        currency: "TWD",
        submittedAt: "2026-10-01T03:00:00.000Z",
        status: "pending_review",
        cleanupDueAt: null,
        studentReviewPending: true,
        temporaryRecords: "kept",
      },
      {
        caseId: ID_2,
        serviceId: "full_mix",
        lockedPriceMinor: 26000,
        currency: "USD",
        submittedAt: "2026-10-01T02:00:00.000Z",
        status: "in_production",
        cleanupDueAt: null,
        studentReviewPending: false,
        temporaryRecords: "kept",
      },
      {
        caseId: ID_1,
        serviceId: "full_mix",
        lockedPriceMinor: 8000,
        currency: "TWD",
        submittedAt: "2026-10-01T01:00:00.000Z",
        status: "pending_review",
        cleanupDueAt: null,
        studentReviewPending: false,
        temporaryRecords: "kept",
      },
    ],
    nextCursor: null,
    studentReviews: [
      {
        caseId: ID_3,
        serviceId: "full_mix",
        submittedAt: "2026-10-01T03:00:00.000Z",
        currency: "TWD",
        standardPriceMinor: 8000,
        studentPriceMinor: 5600,
      },
    ],
    cleanupDue: [DUE],
    ...overrides,
  };
}

/** The markup of one `<section id=…>` (sections are never nested). */
function section(html: string, id: string): string {
  const start = html.lastIndexOf("<section", html.indexOf(`id="${id}"`));
  expect(start, `section #${id}`).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</section>", start));
}

/** The markup of the `<li>` that holds one case row. */
function row(html: string, caseId: string): string {
  const start = html.indexOf(`aria-label="Case ${caseId}"`);
  expect(start, `row ${caseId}`).toBeGreaterThanOrEqual(0);
  return html.slice(
    html.lastIndexOf("<li", start),
    html.indexOf("</li>", start),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("CommissionsInbox", () => {
  it("lists the permanent case fields with stored prices and service names", () => {
    const html = render(<CommissionsInbox data={model()} />);
    for (const id of [ID_1, ID_2, ID_3, ID_4]) expect(html).toContain(id);
    expect(row(html, ID_1)).toContain("NT$8,000");
    expect(row(html, ID_2)).toContain("US$260.00");
    expect(row(html, ID_4)).toContain("NT$1,000");
    expect(row(html, ID_1)).toContain("2026-10-01");
    expect(row(html, ID_1)).toMatch(/lang="zh-Hant"[^>]*>完整歌曲混音</);
    expect(row(html, ID_1)).toMatch(/lang="en"[^>]*>Full Song Mixing</);
    expect(row(html, ID_1)).toMatch(
      /translate="no"[^>]*>KAM-20261001-E2E0000001</,
    );
    expect(html).toContain("Submitted (UTC)");
  });

  it("shows status words and markers, never colour alone", () => {
    const html = render(<CommissionsInbox data={model()} />);
    expect(row(html, ID_1)).toContain("Pending review");
    expect(row(html, ID_2)).toContain("In production");
    expect(row(html, ID_3)).toContain("STUDENT PRICE");
    expect(row(html, ID_4)).toContain("Delivered");
    expect(row(html, ID_4)).toContain("CLEANUP DUE");
    const cleaned = render(
      <CommissionsInbox
        data={model({
          cases: [
            {
              ...DELIVERED,
              caseId: ID_5,
              cleanupDueAt: null,
              temporaryRecords: "removed",
            },
          ],
        })}
      />,
    );
    expect(row(cleaned, ID_5)).toContain("CLEANED");
  });

  it("labels each status control with its case and selects the current status", () => {
    const html = render(<CommissionsInbox data={model()} />);
    for (const [id, status] of [
      [ID_1, "pending_review"],
      [ID_2, "in_production"],
      [ID_4, "delivered"],
    ] as const) {
      const markup = row(html, id);
      const label = markup.match(
        new RegExp(
          `<label[^>]*for="([^"]+)"[^>]*>Status for ${escapeRegExp(id)}</label>`,
        ),
      );
      expect(label, id).not.toBeNull();
      const select = markup.match(
        new RegExp(
          `<select[^>]*id="${escapeRegExp(label?.[1] ?? "")}"[^>]*>([\\s\\S]*?)</select>`,
        ),
      );
      expect(select, id).not.toBeNull();
      expect(select?.[1].match(/<option /g) ?? []).toHaveLength(8);
      expect(select?.[1]).toMatch(
        new RegExp(`<option value="${status}" selected="">`),
      );
      // Server markup (before hydration): Update is disabled, so an early
      // click cannot submit the plain form as a GET filter navigation. Once
      // hydrated it is `aria-disabled` while the selection is unchanged (not
      // `disabled`), so focus stays on it after a change lands (wp1 §4.10).
      expect(markup).toMatch(
        /<button[^>]*type="submit"[^>]*disabled=""[^>]*>Update<span class="visually-hidden"> status of KAM-/,
      );
    }
  });

  it("lists pending student prices with both stored prices and two decisions", () => {
    const html = render(<CommissionsInbox data={model()} />);
    const queue = section(html, "student-reviews");
    expect(queue).toContain("Student prices to check");
    expect(queue).toContain(ID_3);
    expect(queue).toContain("NT$8,000");
    expect(queue).toContain("NT$5,600");
    expect(queue).toContain("Accept student price");
    expect(queue).toContain("Charge standard price");
    expect(queue).toContain(
      "Check the student proof in the Google Form first. The site never sees it.",
    );
    expect(queue).toMatch(/<h2[^>]*tabindex="-1"/);
  });

  it("lists due cleanups with a confirm button, blocked while a student price is open", () => {
    const html = render(<CommissionsInbox data={model()} />);
    const queue = section(html, "cleanup-due");
    expect(queue).toContain("Cleanup due");
    expect(queue).toContain(ID_4);
    expect(queue).toContain(
      'Confirm cleanup<span class="visually-hidden"> for KAM-20261001-E2E0000004</span>',
    );
    expect(queue).not.toContain("Decide the student price first");
    expect(queue).toMatch(/<h2[^>]*tabindex="-1"/);

    const blocked = section(
      render(
        <CommissionsInbox
          data={model({
            cleanupDue: [{ ...DUE, studentReviewPending: true }],
          })}
        />,
      ),
      "cleanup-due",
    );
    expect(blocked).toContain("Decide the student price first");
    expect(blocked).toContain('href="#student-reviews"');
    expect(blocked).toMatch(
      /<button[^>]*disabled=""[^>]*>Confirm cleanup<span class="visually-hidden"> for KAM-20261001-E2E0000004/,
    );
  });

  it("always renders both queues, with an empty line when there is nothing to do", () => {
    const html = render(
      <CommissionsInbox data={model({ studentReviews: [], cleanupDue: [] })} />,
    );
    expect(section(html, "student-reviews")).toContain(
      "No student prices to check.",
    );
    expect(section(html, "cleanup-due")).toContain("No cleanup due.");
  });

  it("states the privacy rule and prints no identity data or record links", () => {
    const html = render(<CommissionsInbox data={model()} />);
    expect(html).toContain(
      "The site keeps only the case ID, service, locked price, date and status.",
    );
    expect(html).not.toContain("@");
    expect(html).not.toMatch(/payload/i);
    expect(html).not.toMatch(/google_response/i);
    expect(html).not.toMatch(/href="https?:\/\//);
  });

  it("summarises the queues in the top bar", () => {
    const html = render(<CommissionsInbox data={model()} />);
    expect(html).toContain("1 student price");
    expect(html).toContain("1 cleanup due");
  });

  it("filters by status and service through a GET form without a cursor", () => {
    const html = render(
      <CommissionsInbox
        data={model({
          query: {
            status: "pending_review",
            service: "full_mix",
            cursor: null,
          },
        })}
      />,
      "/studio/commissions?status=pending_review&service=full_mix",
    );
    const at = html.indexOf('role="search"');
    expect(at).toBeGreaterThanOrEqual(0);
    const form = html.slice(
      html.lastIndexOf("<form", at),
      html.indexOf("</form>", at),
    );
    expect(form).toMatch(/<form[^>]*method="get"/);
    expect(form).toContain('aria-label="Filter cases"');
    expect(form).toMatch(/<select[^>]*name="status"/);
    expect(form).toMatch(/<select[^>]*name="service"/);
    expect(form).not.toContain('name="cursor"');
    expect(form).toMatch(/<option value="pending_review" selected="">/);
    expect(form).toMatch(/<option value="full_mix" selected="">/);
    expect(form).toContain("Full Song Mixing");
    expect(html).toContain("Clear filters");
  });

  it("pages to older cases with the filters kept, and back to the newest", () => {
    const html = render(
      <CommissionsInbox
        data={model({
          query: {
            status: "pending_review",
            service: "full_mix",
            cursor: "a.b",
          },
          nextCursor: "c-d.e_f",
        })}
      />,
    );
    expect(html).toContain(
      'href="/studio/commissions?status=pending_review&amp;service=full_mix&amp;cursor=c-d.e_f"',
    );
    expect(html).toContain("Older cases");
    expect(html).toContain(
      'href="/studio/commissions?status=pending_review&amp;service=full_mix"',
    );
    expect(html).toContain("Newest cases");
  });

  it("explains a rejected page link", () => {
    const html = render(
      <CommissionsInbox data={model({ cursorRejected: true })} />,
    );
    expect(html).toContain(
      "That page link is no longer valid. Showing the newest cases.",
    );
    expect(render(<CommissionsInbox data={model()} />)).not.toContain(
      "That page link is no longer valid",
    );
  });

  it("has an empty state for no cases and for no matches", () => {
    const empty = render(
      <CommissionsInbox
        data={model({ cases: [], studentReviews: [], cleanupDue: [] })}
      />,
    );
    expect(empty).toContain("No commissions yet");
    expect(empty).toContain(
      "Cases appear here when someone submits the commission form.",
    );
    const filtered = render(
      <CommissionsInbox
        data={model({
          cases: [],
          query: { status: "cancelled", service: null, cursor: null },
        })}
      />,
    );
    expect(filtered).toContain("No cases match these filters");
    expect(filtered).toContain("Clear filters");
  });

  it("says an empty older page has no older cases, not that there are none", () => {
    for (const status of [null, "cancelled"] as const) {
      const html = render(
        <CommissionsInbox
          data={model({
            cases: [],
            query: { status, service: null, cursor: "a.b" },
          })}
        />,
      );
      const cases = html.slice(html.indexOf('class="commissions-cases"'));
      expect(cases, String(status)).toContain("No older cases");
      expect(cases, String(status)).not.toContain("No commissions yet");
      expect(cases, String(status)).not.toContain(
        "No cases match these filters",
      );
      expect(cases, String(status)).toContain("Newest cases");
    }
  });
});

function DialogHarness({
  item,
  pending = [],
}: {
  item: CleanupDueItem;
  /** Cases whose cleanup is in flight or waiting on the queue's fetcher. */
  pending?: readonly string[];
}) {
  const real = useCommissionAction("/studio/commissions/cleanup", () => {});
  const action =
    pending.length > 0
      ? { ...real, busy: true, pendingCaseIds: new Set(pending) }
      : real;
  return (
    <CleanupDialog
      item={item}
      services={SERVICES}
      open
      action={action}
      error={null}
      onClose={() => {}}
    />
  );
}

describe("CleanupDialog", () => {
  it("ports the three-item checklist with a disabled confirm outside the form", () => {
    const html = render(<DialogHarness item={DUE} />);
    expect(html).toContain(`Confirm cleanup for ${ID_4}`);
    expect(html).toContain(
      "Delete these yourself first. The site cannot reach Google or Gmail data.",
    );
    const form = html.match(/<form[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/);
    expect(form).not.toBeNull();
    const [, formId, body] = form ?? [];
    expect(html).toMatch(/<form[^>]*action="\/studio\/commissions\/cleanup"/);
    for (const name of [
      "googleRecordsDeleted",
      "gmailDeleted",
      "otherSensitiveCopiesDeleted",
    ]) {
      const input = body?.match(
        new RegExp(`<input[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(input, name).toContain('type="checkbox"');
      expect(input, name).toContain('required=""');
    }
    expect(body).toMatch(
      new RegExp(
        `<input type="hidden" name="caseId" value="${escapeRegExp(ID_4)}"`,
      ),
    );
    expect(body).toContain("<fieldset");
    expect(body).toContain("<legend");
    const confirm = html.match(/<button[^>]*form="([^"]+)"[^>]*>/);
    expect(confirm?.[1]).toBe(formId);
    expect(confirm?.[0]).toContain('name="intent"');
    expect(confirm?.[0]).toContain('value="confirm-cleanup"');
    expect(confirm?.[0]).toContain('disabled=""');
    expect(html).toContain("Check all three to continue.");
    expect(html).toContain("The permanent record stays");
    expect(html).not.toMatch(/href="https?:\/\//);
  });

  it("says Confirming only while this case's cleanup is in flight", () => {
    const confirmButton = (html: string) =>
      html.match(/<button[^>]*form="[^"]+"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    // Another case's cleanup is in flight: this dialog has sent nothing.
    const other = confirmButton(
      render(<DialogHarness item={DUE} pending={[ID_5]} />),
    );
    expect(other).toContain("Confirm cleanup");
    expect(other).not.toContain("Confirming");
    expect(other).not.toContain("aria-busy");
    const own = confirmButton(
      render(<DialogHarness item={DUE} pending={[ID_5, ID_4]} />),
    );
    expect(own).toContain("Confirming…");
    expect(own).toContain('aria-busy="true"');
  });
});

describe("cleanupSubmission", () => {
  const fields = {
    intent: "confirm-cleanup",
    caseId: ID_4,
    googleRecordsDeleted: "on",
    gmailDeleted: "on",
    otherSensitiveCopiesDeleted: "on",
  };

  it("posts the confirmed checklist", () => {
    expect(cleanupSubmission(ID_4, true, new Set())).toEqual(fields);
  });

  it("still posts while another case's cleanup is in flight: the queue holds it", () => {
    expect(cleanupSubmission(ID_4, true, new Set([ID_5]))).toEqual(fields);
  });

  it("posts nothing twice for one case, nor before all three are checked", () => {
    expect(cleanupSubmission(ID_4, true, new Set([ID_4]))).toBeNull();
    expect(cleanupSubmission(ID_4, false, new Set())).toBeNull();
  });
});

describe("cleanupFeedback", () => {
  const sent = { intent: "confirm-cleanup", caseId: ID_4 };
  const failed = {
    ok: false as const,
    code: "cleanup_gateway_failed",
    message:
      "Nothing was deleted: the Apps Script ledger did not confirm. Try again in a moment.",
  };

  it("shows a failure in the open dialog, so Retry is one click", () => {
    expect(cleanupFeedback(failed, sent, ID_4)).toEqual({
      close: false,
      inlineError: failed.message,
      toast: null,
    });
  });

  it("toasts a failure that arrives after the dialog was closed", () => {
    for (const openCaseId of [null, ID_5]) {
      expect(cleanupFeedback(failed, sent, openCaseId)).toEqual({
        close: false,
        inlineError: null,
        toast: { tone: "error", message: failed.message },
      });
    }
  });

  it("closes only the dialog of the confirmed case", () => {
    const done = cleanupFeedback(
      { ok: true, intent: "confirm-cleanup", caseId: ID_4 },
      sent,
      ID_4,
    );
    expect(done.close).toBe(true);
    expect(done.toast?.message).toBe(
      `Temporary records removed for ${ID_4}. The permanent record stays.`,
    );
    expect(
      cleanupFeedback(
        { ok: true, intent: "confirm-cleanup", caseId: ID_4 },
        sent,
        ID_5,
      ).close,
    ).toBe(false);
    const stale = cleanupFeedback(
      {
        ok: false,
        code: "cleanup_not_due",
        message: "Cleanup is not due for this case.",
      },
      sent,
      ID_4,
    );
    expect(stale).toEqual({
      close: true,
      inlineError: null,
      toast: { tone: "error", message: "Cleanup is not due for this case." },
    });
  });
});

describe("submission queue", () => {
  const a = { intent: "set-status", caseId: ID_1, status: "pending_deposit" };
  const b = { intent: "set-status", caseId: ID_2, status: "preview_approval" };
  const c = { intent: "set-status", caseId: ID_3, status: "in_production" };

  it("posts at once when nothing is in flight", () => {
    const step = enqueueSubmission(EMPTY_QUEUE, a, true);
    expect(step.post).toBe(a);
    expect(step.queue).toEqual({ inFlight: a, waiting: [] });
  });

  it("never posts over a submission in flight: the next one waits for it", () => {
    // A second post on the same fetcher would abort the first one.
    const first = enqueueSubmission(EMPTY_QUEUE, a, true);
    const second = enqueueSubmission(first.queue, b, true);
    expect(second.post).toBeNull();
    const third = enqueueSubmission(second.queue, c, false);
    expect(third.post).toBeNull();
    expect(queuedCaseIds(third.queue)).toEqual(new Set([ID_1, ID_2, ID_3]));

    const settledA = settleSubmission(third.queue);
    expect(settledA.finished).toBe(a);
    expect(settledA.post).toBe(b);
    expect(queuedCaseIds(settledA.queue)).toEqual(new Set([ID_2, ID_3]));
    const settledB = settleSubmission(settledA.queue);
    expect(settledB.finished).toBe(b);
    expect(settledB.post).toBe(c);
    const settledC = settleSubmission(settledB.queue);
    expect(settledC.finished).toBe(c);
    expect(settledC.post).toBeNull();
    expect(settledC.queue).toEqual(EMPTY_QUEUE);
  });

  it("waits for a busy fetcher even with nothing of its own in flight", () => {
    const step = enqueueSubmission(EMPTY_QUEUE, a, false);
    expect(step.post).toBeNull();
    const settled = settleSubmission(step.queue);
    // The finished request was not made through the queue: not reported.
    expect(settled.finished).toBeNull();
    expect(settled.post).toBe(a);
  });

  it("reports a form submission it was told about", () => {
    const sent = { intent: "confirm-cleanup", caseId: ID_4 };
    const tracked = trackSubmission(EMPTY_QUEUE, sent);
    expect(queuedCaseIds(tracked)).toEqual(new Set([ID_4]));
    expect(settleSubmission(tracked)).toEqual({
      queue: EMPTY_QUEUE,
      finished: sent,
      post: null,
    });
  });
});

describe("focusFallbackAfter", () => {
  it("checks focus at once after a success: its revalidation already ran", () => {
    expect(
      focusFallbackAfter({ ok: true, intent: "set-status", caseId: ID_1 }),
    ).toBe("now");
  });

  it("waits for the reload that a stale-page code asks for", () => {
    for (const code of STALE_PAGE_CODES) {
      expect(focusFallbackAfter({ ok: false, code, message: "m" }), code).toBe(
        "after-reload",
      );
    }
  });

  it("leaves focus alone when nothing leaves the page", () => {
    for (const code of ["cleanup_gateway_failed", "no_answer"]) {
      expect(
        focusFallbackAfter({ ok: false, code, message: "m" }),
        code,
      ).toBeNull();
    }
  });
});
