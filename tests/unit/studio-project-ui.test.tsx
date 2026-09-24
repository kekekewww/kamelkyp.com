import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { ProjectCreateForm } from "../../app/components/studio/projects/project-create-form";
import { ProjectEditor } from "../../app/components/studio/projects/project-editor";
import { ProjectsListView } from "../../app/components/studio/projects/projects-list-view";
import type {
  ProjectEditorData,
  ProjectsListData,
  StudioProjectRow,
} from "../../app/components/studio/projects/types";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import type { Term } from "../../app/lib/cms/schemas/taxonomy";
import type { EntityMeta } from "../../app/lib/cms/types";

function render(element: React.ReactNode, path = "/") {
  const Stub = createRoutesStub([
    {
      path,
      Component: () => (
        <StudioSessionProvider
          initial={{ csrfToken: "csrf-1", csrfExpiresAt: "", ownerEmail: "o" }}
        >
          <ToastProvider>{element}</ToastProvider>
        </StudioSessionProvider>
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

const terms: Term[] = [
  {
    id: "term-project_category-software",
    vocabulary: "project_category",
    slug: "software",
    label: { zh: "軟體", en: "Software" },
    data: {},
    sortOrder: 10,
    archivedAt: null,
  },
  {
    id: "term-project_category-ai",
    vocabulary: "project_category",
    slug: "ai",
    label: { zh: "AI", en: "AI" },
    data: {},
    sortOrder: 20,
    archivedAt: null,
  },
];

function row(overrides: Partial<StudioProjectRow>): StudioProjectRow {
  return {
    id: "p-1",
    title: { zh: "訊號花園", en: "Signal Garden" },
    label: "訊號花園",
    secondary: "Signal Garden",
    slug: "signal-garden",
    publishedSlug: null,
    status: "draft",
    todoContent: false,
    featured: false,
    featuredOrder: null,
    sortOrder: 0,
    hasUnpublishedChanges: false,
    listed: true,
    year: 2026,
    primaryCategoryId: "term-project_category-software",
    categoryIds: ["term-project_category-software", "term-project_category-ai"],
    updatedAt: "2026-09-24T09:00:00Z",
    ...overrides,
  };
}

function listData(overrides: Partial<ProjectsListData> = {}): ProjectsListData {
  return {
    query: {
      q: "",
      status: "active",
      categoryId: null,
      year: null,
      featured: null,
      sort: "order",
    },
    rows: [
      row({}),
      row({
        id: "p-2",
        label: "室內音",
        secondary: "Room Tone",
        title: { zh: "室內音", en: "Room Tone" },
        status: "published",
        publishedSlug: "room-tone",
        hasUnpublishedChanges: true,
        featured: true,
        todoContent: false,
        year: 2025,
        categoryIds: ["term-project_category-software"],
      }),
    ],
    featured: [
      row({
        id: "p-2",
        label: "室內音",
        status: "published",
        featured: true,
        featuredOrder: 0,
      }),
      row({
        id: "p-3",
        label: "草稿精選",
        status: "draft",
        featured: true,
        featuredOrder: 10,
      }),
      row({
        id: "p-4",
        label: "第二名",
        status: "published",
        featured: true,
        featuredOrder: 20,
      }),
      row({
        id: "p-5",
        label: "超出名額",
        status: "published",
        featured: true,
        featuredOrder: 30,
      }),
    ],
    facets: { years: [2026, 2025], categories: terms },
    categoryLabels: Object.fromEntries(terms.map((t) => [t.id, t.label])),
    manualOrder: true,
    featuredLimit: 2,
    now: "2026-09-24T12:00:00Z",
    ...overrides,
  };
}

describe("projects list", () => {
  it("renders ruled rows that link to the editor with status and meta", () => {
    const html = render(
      <ProjectsListView data={listData()} />,
      "/studio/projects",
    );
    expect(html).toContain('href="/studio/projects/p-1"');
    expect(html).toContain("訊號花園");
    expect(html).toContain("Signal Garden");
    expect(html).toContain("studio-badge--draft");
    expect(html).toContain("studio-badge--published");
    expect(html).toContain(">Changes<");
    expect(html).toContain(">Featured<");
    expect(html).toContain("2026 · Software +1");
    expect(html).toContain("3 h ago");
    expect(html).toContain('href="/studio/projects/new"');
  });

  it("offers keyboard reorder handles only in manual order", () => {
    const manual = render(
      <ProjectsListView data={listData()} />,
      "/studio/projects",
    );
    expect(manual).toContain('aria-label="Reorder: 訊號花園, position 1 of 2"');
    const filtered = render(
      <ProjectsListView
        data={listData({
          manualOrder: false,
          query: { ...listData().query, q: "signal" },
        })}
      />,
      "/studio/projects",
    );
    expect(filtered).not.toContain("Reorder: 訊號花園");
    expect(filtered).toContain("Clear filters");
  });

  it("shows the homepage order with the cut-off after the configured count", () => {
    const html = render(
      <ProjectsListView data={listData()} />,
      "/studio/projects",
    );
    expect(html).toContain("On the homepage");
    expect(html).toContain("Homepage shows the first 2");
    // Drafts never take a homepage slot; the third live row is cut.
    expect(html).toContain("Not live until published");
    expect(html.match(/Over the limit/g)).toHaveLength(1);
    expect(html).toMatch(/超出名額[\s\S]*Over the limit/);
    expect(html).toContain('aria-label="Reorder: 室內音, position 1 of 4"');
    expect(html).toContain("Remove from homepage");
  });

  it("invites the next action when the list is empty", () => {
    const empty = render(
      <ProjectsListView data={listData({ rows: [], featured: [] })} />,
      "/studio/projects",
    );
    expect(empty).toContain("No projects yet");
    const none = render(
      <ProjectsListView
        data={listData({
          rows: [],
          manualOrder: false,
          query: { ...listData().query, q: "nothing" },
        })}
      />,
      "/studio/projects",
    );
    expect(none).toContain("No results for “nothing”");
    expect(none).toContain('href="/studio/projects"');
  });

  it("puts row actions in a menu: preview, duplicate, feature, archive", () => {
    const html = render(
      <ProjectsListView data={listData()} />,
      "/studio/projects",
    );
    expect(html).toContain('aria-label="Actions for 訊號花園"');
    expect(html).toContain('href="/studio/preview/projects/p-1?locale=zh"');
    expect(html).toContain(">Duplicate<");
    expect(html).toContain(">Feature on homepage<");
    expect(html).toContain(">Archive<");
  });
});

const meta: EntityMeta = {
  id: "p-1",
  type: "project",
  status: "draft",
  todoContent: false,
  featured: false,
  featuredOrder: null,
  sortOrder: 0,
  revision: 4,
  publishedRevision: null,
  hasUnpublishedChanges: false,
  slug: "signal-garden",
  publishedSlug: null,
  listed: true,
  createdAt: "2026-09-24T00:00:00Z",
  updatedAt: "2026-09-24T10:02:00Z",
  publishedAt: null,
  firstPublishedAt: null,
  archivedAt: null,
};

function editorData(
  overrides: Partial<ProjectEditorData> = {},
): ProjectEditorData {
  return {
    meta,
    content: ProjectDraftSchema.parse({
      slug: "signal-garden",
      title: { zh: "訊號花園", en: "Signal Garden" },
      primaryCategoryId: "term-project_category-software",
      categoryIds: ["term-project_category-software"],
      tools: ["Ableton Live"],
      story: {
        context: { zh: "背景", en: "Context" },
        problem: { zh: "問題", en: "" },
      },
      body: { zh: [{ type: "paragraph", text: "舊段落" }], en: [] },
    }),
    issues: [
      {
        field: "year",
        code: "required",
        severity: "error",
        message: "Year is required.",
      },
      {
        field: "shortDescription",
        code: "required_locale",
        locale: "zh",
        severity: "error",
        message: "Short description is required in ZH.",
      },
      {
        field: "story.problem",
        code: "one_locale_only",
        locale: "en",
        severity: "warning",
        message: "Problem is only in ZH; it will not show on the English page.",
      },
    ],
    terms,
    assets: {},
    music: [],
    redirects: [],
    changedSections: [],
    urls: { preview: "/studio/preview/projects/p-1", live: null },
    featuredLimit: 4,
    now: "2026-09-24T12:00:00Z",
    ...overrides,
  };
}

describe("project editor", () => {
  it("groups fields into the seven sections with an index", () => {
    const html = render(
      <ProjectEditor data={editorData()} />,
      "/studio/projects/p-1",
    );
    for (const id of [
      "basic",
      "media",
      "classification",
      "case-study",
      "links",
      "credits",
      "publication",
    ]) {
      expect(html).toContain(`id="section-${id}"`);
      expect(html).toContain(`href="#section-${id}"`);
    }
    expect(html).toContain('name="title.zh"');
    expect(html).toContain('value="訊號花園"');
    expect(html).toContain("/en/works/");
    expect(html).toContain('name="year:number"');
    expect(html).toContain('name="story.reflection.en"');
    expect(html).toContain('name="links:json"');
    expect(html).toContain('name="credits:json"');
    expect(html).toContain('name="expectedRevision" value="4"');
  });

  it("shows the save state and a publish button that counts blocking issues", () => {
    const html = render(
      <ProjectEditor data={editorData()} />,
      "/studio/projects/p-1",
    );
    expect(html).toContain("SAVED");
    expect(html).toMatch(/Publish · 2 issues/);
    expect(html).toContain('value="save"');
    expect(html).toContain("Preview changes");
  });

  it("lists the checklist and keeps legacy content blocks", () => {
    const html = render(
      <ProjectEditor data={editorData()} />,
      "/studio/projects/p-1",
    );
    expect(html).toContain("Year is required.");
    expect(html).toContain("2 issues block publishing");
    expect(html).toContain('name="body:json"');
    expect(html).toContain("1 block in ZH");
  });

  it("frames the preview route for the working copy", () => {
    const html = render(
      <ProjectEditor data={editorData()} />,
      "/studio/projects/p-1",
    );
    expect(html).toContain('src="/studio/preview/projects/p-1?locale=zh"');
    expect(html).toContain('name="studio-preview"');
  });

  it("marks unpublished changes, live links and old slugs of a published project", () => {
    const html = render(
      <ProjectEditor
        data={editorData({
          meta: {
            ...meta,
            status: "published",
            publishedSlug: "signal-garden",
            publishedRevision: 3,
            hasUnpublishedChanges: true,
            publishedAt: "2026-09-24T09:00:00Z",
            featured: true,
            featuredOrder: 10,
          },
          changedSections: ["basic", "case-study"],
          redirects: [
            { fromSlug: "old-garden", createdAt: "2026-09-20T00:00:00Z" },
          ],
          urls: {
            preview: "/studio/preview/projects/p-1",
            live: {
              zh: "/zh/works/signal-garden",
              en: "/en/works/signal-garden",
            },
          },
        })}
      />,
      "/studio/projects/p-1",
    );
    expect(html).toContain("Unpublished changes in Basic, Case study");
    expect(html).toContain('href="/en/works/signal-garden"');
    expect(html).toContain("/en/works/old-garden");
    expect(html).toContain(">Publish changes<");
    expect(html).toContain("Remove from homepage");
  });

  it("explains seeded TODO_CONTENT rows", () => {
    const html = render(
      <ProjectEditor
        data={editorData({ meta: { ...meta, todoContent: true } })}
      />,
      "/studio/projects/p-1",
    );
    expect(html).toContain("This is real content");
  });
});

describe("quick create", () => {
  it("asks for a title, slug and primary category only", () => {
    const html = render(
      <ProjectCreateForm categories={terms} />,
      "/studio/projects/new",
    );
    expect(html).toContain('name="title.zh"');
    expect(html).toContain('name="title.en"');
    expect(html).toContain('name="slug"');
    expect(html).toContain("Auto from EN title");
    expect(html).toContain('name="primaryCategoryId"');
    expect(html).toContain('value="create"');
    expect(html).toContain("Create draft");
  });
});
