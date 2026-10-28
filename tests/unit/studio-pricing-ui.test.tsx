/**
 * Studio → Pricing screens (wp2 §4.9, §6.1): static markup only (the unit
 * environment has no DOM). The figures are the seeded price versions, as the
 * loaders would return them on a fresh database.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { PriceVersionEditor } from "../../app/components/studio/pricing/price-version-editor";
import { PricingIndex } from "../../app/components/studio/pricing/pricing-index";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import type {
  FxStatus,
  PriceEditorData,
  PricingIndexData,
  PricingServiceSummary,
  StudioPriceVersion,
} from "../../app/lib/cms/repositories/pricing.server";
import type { CommissionReadiness } from "../../app/lib/commission/availability.server";
import { EDITABLE_PRICE_FIELDS } from "../../app/lib/pricing/sample-quotes";
import type { ServiceId } from "../../app/lib/services/service-id";

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

const NOW = "2026-10-13T02:00:00.000Z";

const SEEDS: Record<ServiceId, [string, number, number]> = {
  full_mix: ["full-2026-08-10", 8000, 0],
  vocal_mix: ["vocal-2026-08-10", 4000, 0],
  simple_transition: ["simple-2026-08-10", 1000, 200],
  edit_transition: ["edit-2026-08-10", 4000, 800],
};

const NAMES: Record<ServiceId, [string, string]> = {
  full_mix: ["完整歌曲混音", "Full Song Mixing"],
  vocal_mix: ["Vocal 混音", "Vocal Mixing"],
  simple_transition: ["單純歌曲銜接", "Simple Song Transition"],
  edit_transition: ["編輯／剪輯歌曲銜接", "Edited Song Transition"],
};

function seed(serviceId: ServiceId): StudioPriceVersion {
  const [id, baseTwd, perSongAfterFiveTwd] = SEEDS[serviceId];
  return {
    id,
    serviceId,
    baseTwd,
    perSongAfterFiveTwd,
    studentDiscountBps: 3000,
    rushBps: 5000,
    consultationBps: 5000,
    sourcePrepBps: 500,
    effectiveFrom: "2026-08-10T00:00:00Z",
    retiredAt: null,
    publishedAt: null,
    action: null,
    replacesVersionId: null,
    state: "active",
  };
}

function summary(
  serviceId: ServiceId,
  overrides: Partial<PricingServiceSummary> = {},
): PricingServiceSummary {
  const [zh, en] = NAMES[serviceId];
  return {
    serviceId,
    category: serviceId.endsWith("_mix") ? "mixing" : "song_transition",
    name: { zh, en },
    serviceRow: { id: `svc-${serviceId}`, status: "published" },
    active: seed(serviceId),
    next: null,
    livePath:
      serviceId === "full_mix"
        ? "/mixing/full"
        : serviceId === "vocal_mix"
          ? "/mixing/vocal"
          : serviceId === "simple_transition"
            ? "/song-transition/simple"
            : "/song-transition/edit",
    ...overrides,
  };
}

const IDS: ServiceId[] = [
  "full_mix",
  "vocal_mix",
  "simple_transition",
  "edit_transition",
];

function readiness(open: boolean): CommissionReadiness[] {
  return IDS.map((serviceId) => ({
    serviceId,
    serviceStatus: "published",
    price: { versionId: SEEDS[serviceId][0], baseTwd: SEEDS[serviceId][1] },
    terms: {
      zh: open
        ? { ready: true, missing: [] }
        : { ready: false, missing: ["common"] },
      en: { ready: true, missing: [] },
    },
    open: { zh: open, en: true },
  }));
}

function indexData(fx: FxStatus, open = false): PricingIndexData {
  return {
    services: IDS.map((id) => summary(id)),
    readiness: readiness(open),
    fx,
    now: NOW,
  };
}

const FX_OK: FxStatus = {
  state: "ok",
  rateDate: "2026-10-12",
  rateScaled: 3250000,
  fetchedAt: "2026-10-13T01:15:00.000Z",
};

describe("PricingIndex", () => {
  it("shows the active seeded prices, rates, readiness and FX with words", () => {
    const html = render(<PricingIndex data={indexData(FX_OK)} />);
    expect(html).toContain("<title>Pricing — KAMEL STUDIO</title>");
    expect(html).toContain("NT$8,000");
    expect(html).toContain("NT$4,000");
    expect(html).toContain("NT$1,000");
    expect(html).toContain("NT$200 per song after the 5th");
    expect(html).toContain("NT$800 per song after the 5th");
    expect(html).toContain("Student 30%");
    expect(html).toContain("Rush 50%");
    expect(html).toContain("Source prep 5%");
    expect(html).toContain("Consultation 50%");
    expect(html).toContain("since 2026-08-10 08:00 Taipei");
    expect(html).toContain("full-2026-08-10");
    expect(html).toContain("No scheduled change");
    expect(html).toContain('href="/studio/services/pricing/full_mix"');
    expect(html).toContain('href="/studio/services/svc-full_mix"');
    expect(html).toContain('href="/zh/mixing/full"');
    expect(html).toContain("Commission form availability");
    expect(html).toContain("Closed");
    expect(html).toContain("terms missing: General terms (ZH)");
    expect(html).toContain("1 TWD = 0.0325 USD");
    expect(html).toContain("rate date 2026-10-12");
    expect(html).toContain("fetched 2026-10-13 09:15 Taipei");
    expect(html).toContain("Current");
    expect(html).toContain('value="refresh-fx"');
    expect(html).toContain("Refresh now");
  });

  it("states stale and missing FX in words and on the English readiness cells", () => {
    const stale = render(
      <PricingIndex data={indexData({ ...FX_OK, state: "stale" }, true)} />,
    );
    expect(stale).toContain("Stale (older than 3 business days)");
    expect(stale).toContain("USD unavailable (FX stale)");
    expect(stale).toContain("Open");
    const missing = render(
      <PricingIndex
        data={indexData({
          state: "missing",
          rateDate: null,
          rateScaled: null,
          fetchedAt: null,
        })}
      />,
    );
    expect(missing).toContain("Missing");
  });

  it("says when a service has no active price and the form is closed", () => {
    const data = indexData(FX_OK);
    data.services[0] = summary("full_mix", { active: null });
    const html = render(<PricingIndex data={data} />);
    expect(html).toContain("No active price");
    expect(html).toContain("The commission form for this service is closed.");
  });
});

function editorData(
  serviceId: ServiceId,
  extra: StudioPriceVersion[] = [],
): PriceEditorData {
  const history = [...extra, seed(serviceId)];
  const next = extra.find((row) => row.state === "scheduled") ?? null;
  return {
    service: summary(serviceId, { next }),
    editable: EDITABLE_PRICE_FIELDS[serviceId],
    history,
    versionCount: history.length,
    termMentions: [],
    now: NOW,
  };
}

const SCHEDULED: StudioPriceVersion = {
  ...seed("full_mix"),
  id: "v-scheduled",
  baseTwd: 8000,
  effectiveFrom: "2098-12-31T16:00:00.000Z",
  publishedAt: "2026-10-12T00:00:00.000Z",
  action: "publish",
  state: "scheduled",
};

describe("PriceVersionEditor", () => {
  it("prefills only the fields the full-mix quote uses and carries the rest as text", () => {
    const html = render(
      <PriceVersionEditor data={editorData("full_mix", [SCHEDULED])} />,
    );
    expect(html).toContain(
      "<title>Full Song Mixing pricing — KAMEL STUDIO</title>",
    );
    expect(html).toMatch(/name="baseTwd:number"[^>]*value="8000"/);
    expect(html).toMatch(/name="studentDiscountPercent"[^>]*value="30"/);
    expect(html).toMatch(/name="rushPercent"[^>]*value="50"/);
    expect(html).toMatch(/name="sourcePrepPercent"[^>]*value="5"/);
    expect(html).not.toContain('name="perSongAfterFiveTwd:number"');
    expect(html).not.toContain('name="consultationPercent"');
    expect(html).toContain("Not used by this service, carried over unchanged");
    expect(html).toContain("Consultation 50%");
    expect(html).not.toMatch(/placeholder="[^"]*\d/);
    expect(html).toContain("Publish now");
    expect(html).toMatch(/name="expectedVersionCount"[^>]*value="2"/);
    expect(html).toMatch(/name="basedOnVersionId"[^>]*value="full-2026-08-10"/);
    // The 8,680 sample (8,000 + rush 4,000 + source prep 400 − student 3,720).
    expect(html).toContain("NT$8,680");
    expect(html).not.toContain("Save and leave");
  });

  it("renders the history with state words and a separate cancel form per scheduled change", () => {
    const html = render(
      <PriceVersionEditor data={editorData("full_mix", [SCHEDULED])} />,
    );
    expect(html).toContain("Price history for Full Song Mixing");
    expect(html).toContain("Active");
    expect(html).toContain("Scheduled");
    expect(html).toContain("Replace…");
    expect(html).toContain("Cancel scheduled change");
    expect(html).toContain('value="cancel-scheduled"');
    expect(html).toMatch(/name="versionId"[^>]*value="v-scheduled"/);
    // No <form> is nested inside another.
    let depth = 0;
    let maxDepth = 0;
    for (const match of html.matchAll(/<(\/?)form\b/g)) {
      depth += match[1] ? -1 : 1;
      maxDepth = Math.max(maxDepth, depth);
    }
    expect(maxDepth).toBe(1);
    expect(html).toMatch(
      /<form[^>]*>(?:(?!<\/form>).)*value="cancel-scheduled"/s,
    );
  });

  it("names a cancelled change and its cancellation, with no actions on them", () => {
    const cancelled: StudioPriceVersion = {
      ...SCHEDULED,
      id: "v-cancelled",
      baseTwd: 9000,
      state: "cancelled",
    };
    const cancellation: StudioPriceVersion = {
      ...SCHEDULED,
      id: "v-cancellation",
      publishedAt: "2026-10-12T01:00:00.000Z",
      action: "cancel",
      replacesVersionId: "v-cancelled",
      state: "cancelled",
    };
    const html = render(
      <PriceVersionEditor
        data={editorData("full_mix", [cancellation, cancelled])}
      />,
    );
    expect(html).toContain("Cancellation");
    expect(html).toContain("Cancels the change of 2099-01-01 00:00");
    expect(html).toContain("Cancelled (never active)");
    expect(html).not.toContain("Cancel scheduled change");
    expect(html).not.toContain("Replace…");
    expect(html).not.toContain("Scheduled:");
  });

  it("shows every input for simple transitions", () => {
    const html = render(
      <PriceVersionEditor data={editorData("simple_transition")} />,
    );
    for (const name of [
      "baseTwd:number",
      "perSongAfterFiveTwd:number",
      "studentDiscountPercent",
      "rushPercent",
      "consultationPercent",
      "sourcePrepPercent",
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).not.toContain("carried over unchanged");
  });
});
