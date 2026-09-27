import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { StudioHome } from "../../app/components/studio/home/studio-home";
import { HomepageControl } from "../../app/components/studio/homepage/homepage-control";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import type { HomepageModel } from "../../app/lib/cms/repositories/homepage.server";
import type { StudioHomeModel } from "../../app/lib/cms/repositories/studio-home.server";
import { DEFAULT_BRAND_SETTINGS } from "../../app/lib/cms/schemas/brand-settings";
import { DEFAULT_SITE_SETTINGS } from "../../app/lib/cms/schemas/site-settings";

function render(element: React.ReactNode, path: string) {
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

const count = (
  type: StudioHomeModel["counts"][number]["type"],
  label: string,
) => ({
  type,
  label,
  href: `/studio/${type === "project" ? "projects" : type}`,
  published: 2,
  draft: 3,
  archived: 0,
  todo: 1,
});

function homeModel(overrides: Partial<StudioHomeModel> = {}): StudioHomeModel {
  return {
    now: "2026-09-25T10:00:00.000Z",
    counts: [count("project", "Projects"), count("music", "Music")],
    recent: [
      {
        kind: "project",
        id: "p1",
        label: "Signal Garden",
        status: "draft",
        updatedAt: "2026-09-25T09:30:00.000Z",
        href: "/studio/projects/p1",
      },
      {
        kind: "settings",
        id: "brand",
        label: "Brand settings",
        status: null,
        updatedAt: "2026-09-24T09:00:00.000Z",
        href: "/studio/settings/brand",
      },
    ],
    attention: [
      {
        key: "contact-email",
        severity: "high",
        title: "Review the public contact email",
        detail: "Confirm the address or change it.",
        href: "/studio/settings/brand#contact",
        action: "Open brand settings",
      },
      {
        key: "todo:project",
        severity: "low",
        title: "6 projects still sample content",
        href: "/studio/projects?status=draft",
        action: "Open drafts",
        count: 6,
      },
    ],
    homepage: {
      showreel: { id: "t1", label: "Reel", status: "published" },
      featuredProjects: [
        { id: "p1", label: "Signal Garden", status: "published" },
        { id: "p2", label: "Tide Engine", status: "draft" },
      ],
      featuredProjectLimit: 4,
      featuredCounts: { music: 1, recognition: 0, writing: 2, service: 3 },
      sections: { visible: ["showreel", "selectedWork"], hidden: ["writing"] },
    },
    commissions: {
      pendingReview: 2,
      awaitingDeposit: 1,
      inProduction: 0,
      studentReviews: 0,
      cleanupDue: 0,
    },
    ...overrides,
  };
}

describe("StudioHome", () => {
  it("offers the seven quick actions", () => {
    const html = render(<StudioHome model={homeModel()} />, "/studio");
    const actions: Array<[string, string]> = [
      ["New Project", "/studio/projects/new"],
      ["New Music Entry", "/studio/music/new"],
      ["New Recognition", "/studio/recognition/new"],
      ["New Writing", "/studio/writing/new"],
      ["Upload Media", "/studio/media"],
      ["Edit Homepage", "/studio/homepage"],
      ["Preview Site", "/studio/preview/home?drafts=1"],
    ];
    for (const [label, href] of actions) {
      expect(html).toContain(label);
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("lists what needs attention with a link to each fix", () => {
    const html = render(<StudioHome model={homeModel()} />, "/studio");
    expect(html).toContain("Review the public contact email");
    expect(html).toContain('href="/studio/settings/brand#contact"');
    expect(html).toContain("Open drafts");
  });

  it("says when nothing needs attention", () => {
    const html = render(
      <StudioHome model={homeModel({ attention: [] })} />,
      "/studio",
    );
    expect(html).toContain("Nothing needs attention");
  });

  it("shows counts that link to filtered lists, recent changes and the homepage", () => {
    const html = render(<StudioHome model={homeModel()} />, "/studio");
    expect(html).toContain('href="/studio/projects?status=published"');
    expect(html).toContain('href="/studio/projects?status=draft"');
    expect(html).toContain("Signal Garden");
    expect(html).toContain("30 min ago");
    expect(html).toContain("Tide Engine");
    expect(html).toContain("Reel");
    expect(html).toContain('href="/studio/commissions"');
    expect(html).not.toMatch(/analytics|visitors|page views/i);
  });
});

function homepageModel(): HomepageModel {
  const entry = (id: string, label: string, status: "draft" | "published") => ({
    id,
    label,
    secondary: null,
    status,
    todoContent: false,
  });
  const group = (type: HomepageModel["featured"]["project"]["type"]) => ({
    type,
    items: [] as ReturnType<typeof entry>[],
    candidates: [] as ReturnType<typeof entry>[],
  });
  return {
    brand: {
      value: structuredClone(DEFAULT_BRAND_SETTINGS),
      revision: 1,
      updatedAt: "2026-09-24T00:00:00Z",
    },
    site: {
      value: structuredClone(DEFAULT_SITE_SETTINGS),
      revision: 2,
      updatedAt: "2026-09-24T00:00:00Z",
    },
    showreel: {
      current: null,
      candidates: [{ ...entry("t1", "Reel", "draft"), playable: true }],
    },
    featured: {
      project: {
        type: "project",
        items: [
          entry("p1", "Signal Garden", "published"),
          entry("p2", "Tide Engine", "draft"),
        ],
        candidates: [entry("p3", "Loom", "draft")],
      },
      music: group("music"),
      recognition: group("recognition"),
      writing: group("writing"),
      service: group("service"),
    },
  };
}

describe("HomepageControl", () => {
  it("renders every curation block with its own save", () => {
    const html = render(
      <HomepageControl model={homepageModel()} />,
      "/studio/homepage",
    );
    expect(html).toContain('value="save-hero"');
    expect(html).toContain('value="save-availability"');
    expect(html).toContain('value="save-sections"');
    expect(html).toContain('value="save-contact"');
    expect(html).toContain('name="heroStatement.zh"');
    expect(html).toContain('name="homepage.sections.showreel:bool"');
    expect(html).toContain('name="homepage.contactBandBody.en"');
    expect(html).toContain("goes live immediately");
  });

  it("orders featured projects and marks drafts as not live", () => {
    const html = render(
      <HomepageControl model={homepageModel()} />,
      "/studio/homepage",
    );
    expect(html.indexOf("Signal Garden")).toBeLessThan(
      html.indexOf("Tide Engine"),
    );
    expect(html).toContain("Not live until published");
    expect(html).toContain("Reorder: Signal Garden, position 1 of 2");
    expect(html).toContain("Loom");
    expect(html).toContain('id="featured-project"');
  });

  it("offers tracks with audio for the showreel", () => {
    const html = render(
      <HomepageControl model={homepageModel()} />,
      "/studio/homepage",
    );
    expect(html).toContain('id="showreel"');
    expect(html).toContain("No showreel selected");
    expect(html).toContain('value="set-showreel"');
    expect(html).toContain("Reel");
  });
});
