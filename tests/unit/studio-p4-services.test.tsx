import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { PriceFields } from "../../app/components/studio/services/price-fields";
import { ServiceEditor } from "../../app/components/studio/services/service-editor";
import { ServiceList } from "../../app/components/studio/services/service-list";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import type { ServiceContent } from "../../app/lib/cms/schemas/service";
import type { Term } from "../../app/lib/cms/schemas/taxonomy";
import type { EntityMeta } from "../../app/lib/cms/types";

function renderInRouter(element: React.ReactNode, path = "/") {
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

const groups: Term[] = [
  {
    id: "term-service_group-mixing",
    vocabulary: "service_group",
    slug: "mixing",
    label: { zh: "混音", en: "Mixing" },
    data: { area: "mixing" },
    sortOrder: 10,
    archivedAt: null,
  },
  {
    id: "term-service_group-software-development",
    vocabulary: "service_group",
    slug: "software-development",
    label: { zh: "軟體開發", en: "Software Development" },
    data: { area: "software" },
    sortOrder: 40,
    archivedAt: null,
  },
];

const empty = { zh: "", en: "" };

function content(overrides: Partial<ServiceContent> = {}): ServiceContent {
  return {
    slug: "sound-design",
    groupTermId: "term-service_group-software-development",
    commissionServiceId: null,
    name: { zh: "聲音設計", en: "Sound Design" },
    shortDescription: empty,
    description: empty,
    priceMode: "custom_quote",
    priceAmount: null,
    currency: null,
    turnaround: empty,
    revisions: empty,
    deliverables: [],
    requirements: [],
    process: [],
    faq: [],
    inquirySubject: empty,
    ...overrides,
  };
}

function meta(overrides: Partial<EntityMeta> = {}): EntityMeta {
  return {
    id: "svc-1",
    type: "service",
    status: "draft",
    todoContent: false,
    featured: false,
    featuredOrder: null,
    sortOrder: 0,
    revision: 2,
    publishedRevision: null,
    hasUnpublishedChanges: false,
    slug: "sound-design",
    publishedSlug: null,
    commissionServiceId: null,
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    publishedAt: null,
    firstPublishedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("PriceFields", () => {
  it("shows a commission price read-only with a pointer to Pricing", () => {
    const html = renderInRouter(
      <PriceFields
        commissionLinked
        livePrice={{ baseTwd: 4321, versionId: "v-test" }}
        defaultMode="starting_from"
        defaultAmount={null}
        defaultCurrency={null}
      />,
    );
    expect(html).toContain("NT$4,321");
    expect(html).toContain("v-test");
    expect(html).toContain('href="/studio/services/pricing"');
    expect(html).toContain("Change in Pricing");
    expect(html).not.toContain('name="priceAmount:number"');
    expect(html).not.toContain('name="priceMode"');
  });

  it("says so when a commission service has no active price", () => {
    const html = renderInRouter(
      <PriceFields
        commissionLinked
        livePrice={null}
        defaultMode="starting_from"
        defaultAmount={null}
        defaultCurrency={null}
      />,
    );
    expect(html).toContain("No active price");
  });

  it("asks for no number in custom quote mode", () => {
    const html = renderInRouter(
      <PriceFields
        commissionLinked={false}
        livePrice={null}
        defaultMode="custom_quote"
        defaultAmount={null}
        defaultCurrency={null}
      />,
    );
    expect(html).toMatch(
      /<input[^>]*(checked=""[^>]*value="custom_quote"|value="custom_quote"[^>]*checked="")/,
    );
    expect(html).not.toContain('name="priceAmount:number"');
    expect(html).toContain("No number is shown");
  });

  it("offers an amount and currency for fixed prices, without a sample number", () => {
    const html = renderInRouter(
      <PriceFields
        commissionLinked={false}
        livePrice={null}
        defaultMode="fixed"
        defaultAmount={null}
        defaultCurrency={null}
      />,
    );
    expect(html).toContain('name="priceAmount:number"');
    expect(html).toContain('name="currency"');
    expect(html).not.toMatch(/placeholder="[^"]*\d/);
  });
});

describe("ServiceEditor", () => {
  it("renders the grouped editor with the publication panel", () => {
    const html = renderInRouter(
      <ServiceEditor
        data={{
          meta: meta(),
          content: content(),
          published: null,
          issues: [
            {
              field: "description",
              code: "required_locale",
              locale: "en",
              severity: "error",
              message: "Description is required in EN.",
            },
          ],
          groups,
          livePrice: null,
        }}
      />,
      "/studio/services/svc-1",
    );
    for (const section of ["Basic", "Pricing", "Details", "Publication"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("Sound Design");
    expect(html).toContain("Description is required in EN.");
    expect(html).toContain('name="expectedRevision" value="2"');
    expect(html).toContain("SAVED ");
  });

  it("locks the slug and hides archive for commission services", () => {
    const html = renderInRouter(
      <ServiceEditor
        data={{
          meta: meta({
            commissionServiceId: "full_mix",
            status: "published",
            publishedRevision: 2,
            publishedAt: "2026-09-24T00:00:00Z",
          }),
          content: content({
            commissionServiceId: "full_mix",
            groupTermId: "term-service_group-mixing",
            priceMode: "starting_from",
          }),
          published: content(),
          issues: [],
          groups,
          livePrice: { baseTwd: 4321, versionId: "v-test" },
        }}
      />,
      "/studio/services/svc-1",
    );
    expect(html).toContain("This slug is fixed for commission services.");
    expect(html).not.toContain('value="archive"');
    expect(html).toContain("NT$4,321");
    expect(html).toContain('href="/en/mixing/full"');
  });
});

describe("ServiceList", () => {
  it("groups rows, shows live prices and offers a new service", () => {
    const html = renderInRouter(
      <ServiceList
        now="2026-09-25T10:00:00Z"
        groups={groups}
        filters={{ q: "", status: "active", groupTermId: "" }}
        rows={[
          {
            id: "svc-full_mix",
            slug: "full-mix",
            name: { zh: "完整混音", en: "Full Mix" },
            status: "published",
            todoContent: false,
            featured: true,
            featuredOrder: 10,
            sortOrder: 10,
            groupTermId: "term-service_group-mixing",
            commissionServiceId: "full_mix",
            priceMode: "starting_from",
            priceAmount: null,
            currency: null,
            livePrice: { baseTwd: 4321, versionId: "v-test" },
            hasUnpublishedChanges: false,
            updatedAt: "2026-09-25T09:00:00Z",
          },
          {
            id: "svc-web",
            slug: "web",
            name: { zh: "網站", en: "Websites" },
            status: "draft",
            todoContent: false,
            featured: false,
            featuredOrder: null,
            sortOrder: 20,
            groupTermId: "term-service_group-software-development",
            commissionServiceId: null,
            priceMode: "custom_quote",
            priceAmount: null,
            currency: null,
            livePrice: null,
            hasUnpublishedChanges: false,
            updatedAt: "2026-09-20T09:00:00Z",
          },
        ]}
      />,
      "/studio/services",
    );
    expect(html).toContain("Mixing");
    expect(html).toContain("Software Development");
    expect(html).toContain("From NT$4,321");
    expect(html).toContain("Custom quote");
    expect(html).toContain('href="/studio/services/new"');
    expect(html).toContain('href="/studio/services/svc-web"');
    expect(html).toContain("1 h ago");
  });

  it("invites the first service when there are none", () => {
    const html = renderInRouter(
      <ServiceList
        now="2026-09-25T10:00:00Z"
        groups={groups}
        filters={{ q: "", status: "active", groupTermId: "" }}
        rows={[]}
      />,
      "/studio/services",
    );
    expect(html).toContain("No services yet");
  });
});
