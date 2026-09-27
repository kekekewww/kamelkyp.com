import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FlagBadge,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  NumberInput,
  OrderControls,
  PreviewPane,
  PublicationPanel,
  RowList,
  SaveStateIndicator,
  Select,
  SlugField,
  StatusBadge,
  StudioForm,
  StudioSessionProvider,
  TagInput,
  ToastProvider,
  TypeToConfirm,
  ValidationChecklist,
} from "../../app/components/studio/ui";
import type { EntityMeta } from "../../app/lib/cms/types";

function render(element: React.ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
}

const meta: EntityMeta = {
  id: "p1",
  type: "project",
  status: "draft",
  todoContent: false,
  featured: false,
  featuredOrder: null,
  sortOrder: 0,
  revision: 1,
  publishedRevision: null,
  hasUnpublishedChanges: false,
  slug: "signal-garden",
  publishedSlug: null,
  createdAt: "2026-09-24T00:00:00Z",
  updatedAt: "2026-09-24T00:00:00Z",
  publishedAt: null,
  firstPublishedAt: null,
  archivedAt: null,
};

describe("badges and state", () => {
  it("always names the status in words", () => {
    expect(render(<StatusBadge status="draft" />)).toContain(">Draft<");
    expect(render(<StatusBadge status="published" />)).toContain(
      "studio-badge--published",
    );
    expect(render(<FlagBadge flag="TODO_CONTENT" />)).toContain("TODO_CONTENT");
    expect(render(<FlagBadge flag="CHANGES" />)).toContain("Changes");
  });

  it("announces the save state politely", () => {
    const html = render(
      <SaveStateIndicator state={{ kind: "unsaved", lastSavedAt: null }} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("UNSAVED CHANGES");
  });
});

describe("fields", () => {
  it("renders localized pairs with lang attributes and the publish hint", () => {
    const html = render(
      <LocalizedTextField
        name="title"
        label="Title"
        required
        defaultValue={{ zh: "訊號", en: "" }}
      />,
    );
    expect(html).toContain('name="title.zh"');
    expect(html).toContain('name="title.en"');
    expect(html).toContain('lang="zh-Hant"');
    expect(html).toContain('lang="en"');
    expect(html).toContain("Required to publish");
    expect(html).toContain('value="訊號"');
    const area = render(
      <LocalizedTextArea name="story.context" label="Context" />,
    );
    expect(area).toContain('name="story.context.zh"');
    expect(area).toContain("<textarea");
  });

  it("types numbers, booleans and tags for form parsing", () => {
    expect(render(<NumberInput name="year" label="Year" />)).toContain(
      'name="year:number"',
    );
    const checkbox = render(
      <Checkbox name="listed" label="Listed" defaultChecked />,
    );
    expect(checkbox).toContain(
      'type="hidden" name="listed:bool" value="false"',
    );
    expect(checkbox).toMatch(
      /<input[^>]*type="checkbox"[^>]*name="listed:bool"[^>]*value="true"/,
    );
    const tags = render(
      <TagInput name="tools" label="Tools" defaultValue={["D1", "Vite"]} />,
    );
    expect(tags).toContain('name="tools:json"');
    expect(tags).toContain("D1");
    const select = render(
      <Select
        name="platform"
        label="Platform"
        options={[{ value: "internal", label: "Internal" }]}
        defaultValue="internal"
      />,
    );
    expect(select).toContain("<select");
  });

  it("shows the public URL prefix next to the slug", () => {
    const html = render(
      <SlugField
        entityType="project"
        name="slug"
        prefix="/en/works/"
        defaultValue="signal-garden"
      />,
    );
    expect(html).toContain("/en/works/");
    expect(html).toContain('name="slug"');
    expect(html).toContain('value="signal-garden"');
  });

  it("summarises the chosen media asset and offers the picker", () => {
    const html = render(
      <StudioSessionProvider
        initial={{ csrfToken: "t", csrfExpiresAt: "", ownerEmail: "o" }}
      >
        <MediaField
          name="coverImageId"
          label="Cover image"
          kind="image"
          value={{
            id: "a1",
            kind: "image",
            filename: "cover.jpg",
            url: "https://x.example/cover.jpg",
            alt: { zh: "", en: "" },
          }}
        />
      </StudioSessionProvider>,
    );
    expect(html).toContain('name="coverImageId"');
    expect(html).toContain('value="a1"');
    expect(html).toContain("cover.jpg");
    expect(html).toContain("Change…");
    expect(html).toContain("Alt text missing");
  });
});

describe("forms and dialogs", () => {
  it("adds the CSRF token to every Studio form", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <StudioSessionProvider
            initial={{
              csrfToken: "csrf-123",
              csrfExpiresAt: "",
              ownerEmail: "o",
            }}
          >
            <StudioForm>
              <button type="submit">Save</button>
            </StudioForm>
          </StudioSessionProvider>
        ),
      },
    ]);
    const html = renderToStaticMarkup(<Stub />);
    expect(html).toContain('name="csrfToken" value="csrf-123"');
    expect(html).toContain('method="post"');
  });

  it("keeps typed confirmation disabled until the text matches", () => {
    const html = render(
      <TypeToConfirm
        expected="signal-garden"
        label="Type the slug to confirm"
        confirmLabel="Delete permanently"
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain("Type the slug to confirm");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Delete permanently/);
    const dialog = render(
      <ConfirmDialog
        open
        title="Leave without saving?"
        onClose={() => {}}
        actions={<button type="button">Stay</button>}
      >
        <p>Your changes are not saved.</p>
      </ConfirmDialog>,
    );
    expect(dialog).toContain("<dialog");
    expect(dialog).toContain("Leave without saving?");
  });

  it("renders a status region for toasts", () => {
    const html = render(
      <ToastProvider>
        <p>child</p>
      </ToastProvider>,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("child");
  });
});

describe("publication", () => {
  it("offers state-appropriate actions", () => {
    const draft = render(<PublicationPanel meta={meta} />);
    expect(draft).toContain(">Publish<");
    expect(draft).toContain(">Archive<");
    expect(draft).toContain(">Duplicate<");
    expect(draft).toContain("Delete permanently");

    const changed = render(
      <PublicationPanel
        meta={{
          ...meta,
          status: "published",
          hasUnpublishedChanges: true,
          publishedAt: "2026-09-24T14:02:00Z",
        }}
      />,
    );
    expect(changed).toContain(">Publish changes<");
    expect(changed).toContain(">Revert to published<");
    expect(changed).toContain(">Unpublish<");
    expect(changed).not.toContain("Delete permanently");

    const archived = render(
      <PublicationPanel meta={{ ...meta, status: "archived" }} />,
    );
    expect(archived).toContain(">Restore to draft<");
  });

  it("explains why TODO_CONTENT rows cannot be published", () => {
    const html = render(
      <PublicationPanel meta={{ ...meta, todoContent: true }} />,
    );
    expect(html).toContain(
      "Seeded sample content. Replace the text, then clear the TODO_CONTENT flag.",
    );
    expect(html).toContain("This is real content");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Publish</);
  });

  it("never offers archive or delete for commission services", () => {
    const html = render(
      <PublicationPanel
        meta={{
          ...meta,
          type: "service",
          status: "published",
          commissionServiceId: "full_mix",
        }}
      />,
    );
    expect(html).not.toContain(">Archive<");
    expect(html).not.toContain("Delete permanently");
    expect(html).toContain("commission");
  });

  it("lists blocking issues before warnings", () => {
    const html = render(
      <ValidationChecklist
        issues={[
          {
            field: "story.reflection",
            code: "one_locale_only",
            severity: "warning",
            message: "Reflection is only in ZH.",
            locale: "en",
          },
          {
            field: "title",
            code: "required_locale",
            severity: "error",
            message: "Title is required in EN.",
            locale: "en",
          },
        ]}
      />,
    );
    expect(html).toContain("1 issue blocks publishing");
    expect(html.indexOf("Title is required")).toBeLessThan(
      html.indexOf("Reflection is only"),
    );
  });
});

describe("lists and preview", () => {
  it("shows empty states that invite the next action", () => {
    expect(
      render(
        <EmptyState
          title="No projects yet"
          action={<a href="/studio/projects/new">New project</a>}
        />,
      ),
    ).toContain("No projects yet");
    const list = render(
      <RowList
        label="Projects"
        rows={[]}
        empty={<EmptyState title="No results for “x”" />}
        renderRow={() => null}
      />,
    );
    expect(list).toContain("No results for");
  });

  it("labels order controls with the row and position", () => {
    const html = render(
      <OrderControls
        label="Signal Garden"
        index={2}
        total={12}
        onMove={() => {}}
      />,
    );
    expect(html).toContain(
      'aria-label="Reorder: Signal Garden, position 3 of 12"',
    );
    expect(html).toContain("Move up");
    expect(html).toContain("Move down");
  });

  it("frames the preview route for the chosen locale", () => {
    const html = render(
      <PreviewPane src="/studio/preview/projects/p1" title="Signal Garden" />,
    );
    expect(html).toContain('src="/studio/preview/projects/p1?locale=zh"');
    expect(html).toContain('name="studio-preview"');
    expect(html).toContain("Preview: Signal Garden");
  });
});
