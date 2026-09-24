import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import {
  RecognitionEditor,
  type RecognitionEditorData,
} from "../../app/components/studio/recognition/recognition-editor";
import {
  RecognitionList,
  type RecognitionListProps,
  type RecognitionListRow,
} from "../../app/components/studio/recognition/recognition-list";
import { SocialLinks } from "../../app/components/studio/social/social-links";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import {
  WritingEditor,
  type WritingEditorData,
} from "../../app/components/studio/writing/writing-editor";
import {
  WritingList,
  type WritingListRow,
} from "../../app/components/studio/writing/writing-list";
import type { SocialLink } from "../../app/lib/cms/schemas/social-link";
import type { Term } from "../../app/lib/cms/schemas/taxonomy";
import type { EntityMeta, ValidationIssue } from "../../app/lib/cms/types";

function render(element: React.ReactNode, path = "/studio/x") {
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

const text = (zh: string, en = zh) => ({ zh, en });
const AWARD: Term = {
  id: "term-recognition_type-award",
  vocabulary: "recognition_type",
  slug: "award",
  label: text("獎項", "Award"),
  data: {},
  sortOrder: 10,
  archivedAt: null,
};

function meta(overrides: Partial<EntityMeta> = {}): EntityMeta {
  return {
    id: "entry-1",
    type: "recognition",
    status: "draft",
    todoContent: false,
    featured: false,
    featuredOrder: null,
    sortOrder: 0,
    revision: 3,
    publishedRevision: null,
    hasUnpublishedChanges: false,
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-24T10:00:00Z",
    publishedAt: null,
    firstPublishedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

function recognitionRow(
  id: string,
  overrides: Partial<RecognitionListRow> = {},
): RecognitionListRow {
  return {
    id,
    status: "published",
    todoContent: false,
    featured: false,
    hasUnpublishedChanges: false,
    event: text(`活動 ${id}`, `Event ${id}`),
    organization: text(""),
    result: text(""),
    year: 2026,
    date: null,
    typeTermId: AWARD.id,
    updatedAt: "2026-09-24T09:00:00Z",
    ...overrides,
  };
}

const listProps = (
  rows: RecognitionListRow[],
  filters: Partial<RecognitionListProps["filters"]> = {},
): RecognitionListProps => ({
  rows,
  facets: { years: [2026, 2025], types: [AWARD] },
  filters: {
    q: "",
    status: "active",
    year: null,
    typeTermId: null,
    sort: "public",
    ...filters,
  },
  now: "2026-09-24T12:00:00Z",
});

describe("recognition list", () => {
  it("groups rows by year and offers reordering only inside ties", () => {
    const html = render(
      <RecognitionList
        {...listProps([
          recognitionRow("a", { featured: true }),
          recognitionRow("b"),
          recognitionRow("c", { year: 2025, date: "2025-03-01" }),
        ])}
      />,
    );
    expect(html).toContain(">2026<");
    expect(html).toContain(">2025<");
    expect(html).toContain("活動 a");
    expect(html).toContain("Featured");
    expect(html).toContain("Reorder: 活動 a, position 1 of 2");
    expect(html).toContain("Reorder: 活動 b, position 2 of 2");
    expect(html).not.toContain("Reorder: 活動 c");
    expect(html).toContain("p3-handle-spacer");
    expect(html).toContain('aria-keyshortcuts="n"');
    expect(html).toContain('href="/studio/recognition/new"');
    expect(html).toContain('name="year"');
    expect(html).toContain('name="type"');
    expect(html).toContain("Award");
    expect(html).toContain("3 h ago");
    expect(html).toContain('aria-label="Actions for 活動 a"');
  });

  it("drops the order controls while filtering", () => {
    const html = render(
      <RecognitionList
        {...listProps([recognitionRow("a"), recognitionRow("b")], {
          year: 2026,
        })}
      />,
    );
    expect(html).not.toContain("Reorder:");
  });

  it("invites the first entry, or clearing filters", () => {
    expect(render(<RecognitionList {...listProps([])} />)).toContain(
      "No recognition yet",
    );
    expect(
      render(<RecognitionList {...listProps([], { q: "prize" })} />),
    ).toContain("No results for “prize”");
  });
});

const recognitionData = (
  issues: ValidationIssue[] = [],
): RecognitionEditorData => ({
  meta: meta(),
  content: {
    typeTermId: null,
    disciplineTermId: null,
    projectId: null,
    year: null,
    date: null,
    organization: text(""),
    event: text("國際獎", ""),
    result: text(""),
    description: text(""),
    url: null,
    imageId: null,
  },
  issues,
  types: [AWARD],
  disciplines: [],
  projects: [{ id: "p1", label: "Signal Garden", status: "draft" }],
  assets: [],
  previewPath: "/studio/preview/recognition/entry-1",
});

describe("recognition editor", () => {
  it("renders the sections, save controls and publish readiness", () => {
    const issues: ValidationIssue[] = [
      {
        field: "event",
        locale: "en",
        code: "required_locale",
        severity: "error",
        message: "Event is required in EN.",
      },
      {
        field: "year",
        code: "required",
        severity: "error",
        message: "Year is required.",
      },
    ];
    const html = render(
      <RecognitionEditor data={recognitionData(issues)} onReset={() => {}} />,
    );
    expect(html).toContain("國際獎 — KAMEL STUDIO");
    expect(html).toContain('id="section-basic"');
    expect(html).toContain('id="section-details"');
    expect(html).toContain('id="section-publication"');
    expect(html).toContain('name="expectedRevision" value="3"');
    expect(html).toContain('name="event.zh"');
    expect(html).toContain('name="year:number"');
    expect(html).toContain('name="typeTermId"');
    expect(html).toContain("Add type…");
    expect(html).toContain("Signal Garden (draft)");
    expect(html).toContain("Publish · 2 issues");
    expect(html).toContain("Event is required in EN.");
    expect(html).toContain('form="recognition-editor-form"');
    expect(html).toContain("NO CHANGES");
    expect(html).toContain("Type DELETE to confirm");
    expect(html).toContain("Feature on homepage");
  });
});

function writingRow(
  id: string,
  overrides: Partial<WritingListRow> = {},
): WritingListRow {
  return {
    id,
    status: "draft",
    todoContent: false,
    featured: false,
    hasUnpublishedChanges: false,
    listed: true,
    title: text(`文章 ${id}`, `Post ${id}`),
    slug: `post-${id}`,
    date: "2026-09-01",
    platform: "internal",
    platformLabel: null,
    categoryTermId: null,
    externalUrl: null,
    hasContent: { zh: true, en: true },
    updatedAt: "2026-09-24T11:00:00Z",
    ...overrides,
  };
}

describe("writing list", () => {
  it("says where each entry goes", () => {
    const html = render(
      <WritingList
        rows={[
          writingRow("a"),
          writingRow("b", {
            platform: "threads",
            externalUrl: "https://www.threads.net/@kamel/post/1",
            hasContent: { zh: false, en: false },
          }),
          writingRow("c", {
            platform: "other",
            platformLabel: "Substack",
            date: null,
            listed: false,
          }),
        ]}
        facets={{ categories: [] }}
        filters={{
          q: "",
          platform: null,
          categoryTermId: null,
          status: "active",
          sort: "public",
        }}
        now="2026-09-24T12:00:00Z"
      />,
    );
    expect(html).toContain("2026.09.01 · Internal · Article");
    expect(html).toContain("Threads · Links out ↗");
    expect(html).toContain("Substack · Link missing");
    expect(html).toContain("Unlisted");
    expect(html).toContain(">No date<");
    expect(html).toContain("Reorder: 文章 a, position 1 of 2");
  });
});

const writingData = (
  overrides: Partial<WritingEditorData["content"]> = {},
): WritingEditorData => ({
  meta: meta({ type: "writing", slug: "notes", publishedSlug: null }),
  content: {
    slug: "notes",
    listed: true,
    date: "2026-09-01",
    platform: "internal",
    platformLabel: null,
    categoryTermId: null,
    title: text("筆記", "Notes"),
    excerpt: text(""),
    content: { zh: [{ type: "paragraph", text: "內文" }], en: [] },
    externalUrl: null,
    coverImageId: null,
    socialImageId: null,
    seo: { title: text(""), description: text("") },
    ...overrides,
  },
  issues: [],
  categories: [],
  assets: [],
  previewPath: "/studio/preview/writing/entry-1",
  liveUrls: null,
  outboundUrl: null,
});

describe("writing editor", () => {
  it("edits an internal article with blocks and says where it publishes", () => {
    const html = render(
      <WritingEditor data={writingData()} onReset={() => {}} />,
    );
    for (const id of ["basic", "source", "content", "media", "publication"]) {
      expect(html).toContain(`id="section-${id}"`);
    }
    expect(html).toContain("/en/writing/");
    expect(html).toContain('name="slug"');
    expect(html).toContain('name="platform"');
    expect(html).toContain('name="content.zh:json"');
    expect(html).toContain('name="content.en:json"');
    expect(html).toContain("<code>/zh/writing/notes</code>");
    expect(html).toContain('name="listed:bool"');
    expect(html).toContain('name="seo.title.zh"');
    expect(html).toContain("Add category…");
    expect(html).toContain('name="coverImageId"');
  });

  it("describes an external post as a card that links out", () => {
    const html = render(
      <WritingEditor
        data={writingData({
          platform: "medium",
          externalUrl: "https://medium.com/@kamel/notes",
        })}
        onReset={() => {}}
      />,
    );
    expect(html).toContain(
      "A card that links out to <code>https://medium.com/@kamel/notes</code>",
    );
    expect(html).toContain("Content blocks are kept but not shown");
  });
});

const social = (id: string, enabled: boolean, label: string): SocialLink => ({
  id,
  platform: "github",
  label: text(label),
  url: `https://github.com/${id}`,
  username: null,
  icon: null,
  enabled,
  sortOrder: 0,
});

describe("social links", () => {
  it("lists links with a show/hide switch and previews the footer", () => {
    const html = render(
      <SocialLinks
        links={[
          social("profile", true, "GitHub"),
          social("repository", false, "Website repository"),
        ]}
      />,
    );
    expect(html).toContain("1 of 2 links are shown in the footer.");
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).toContain("Hidden");
    const preview = html.slice(html.indexOf("p3-footer-preview"));
    expect(preview).toContain("GitHub");
    expect(preview).not.toContain("Website repository");
    expect(html).toContain('value="update"');
    expect(html).toContain('value="create"');
    expect(html).toContain("Reorder: GitHub, position 1 of 2");
    // Edits never carry the enabled flag; only the switch changes it.
    const rowForm = html.slice(
      html.indexOf('aria-label="Link: GitHub"'),
      html.indexOf("Add a link"),
    );
    expect(rowForm).not.toContain('name="enabled:bool"');
  });

  it("invites the first link", () => {
    expect(render(<SocialLinks links={[]} />)).toContain("No social links yet");
  });
});
