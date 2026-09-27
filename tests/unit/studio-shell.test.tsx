import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  activeNavItem,
  GO_TO_SHORTCUTS,
  STUDIO_NAV,
} from "../../app/components/studio/shell/nav";
import { StubPanel } from "../../app/components/studio/shell/stub-panel";
import { StudioShell } from "../../app/components/studio/shell/studio-shell";

function renderShell(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StudioShell ownerEmail="owner@example.com" attentionCount={3}>
        <p>Page body</p>
      </StudioShell>
    </MemoryRouter>,
  );
}

describe("Studio shell", () => {
  it("renders the wordmark, every section link and the page body", () => {
    const html = renderShell("/studio/projects");
    expect(html).toContain('aria-label="KAMEL STUDIO"');
    for (const item of STUDIO_NAV.flatMap((group) => group.items)) {
      expect(html).toContain(`href="${item.to}"`);
      expect(html).toContain(`>${item.label}<`);
    }
    expect(html).toContain('id="studio-main"');
    expect(html).toContain("Page body");
    expect(html).toContain('href="#studio-main"');
  });

  it("marks exactly the current section", () => {
    const html = renderShell("/studio/projects/abc");
    const current = html.match(/aria-current="page"/g) ?? [];
    expect(current).toHaveLength(1);
    const currentLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(currentLink).toContain('href="/studio/projects"');
  });

  it("links out to preview, live site and Access sign-out", () => {
    const html = renderShell("/studio");
    expect(html).toContain('href="/studio/preview/home?drafts=1"');
    expect(html).toContain('href="/zh"');
    expect(html).toContain('href="/cdn-cgi/access/logout"');
    expect(html).toContain("owner@example.com");
    expect(html).toMatch(/Needs attention[^<]*<\/span>|>3</);
  });

  it("resolves the active item by the longest matching path", () => {
    expect(activeNavItem("/studio")?.label).toBe("Home");
    expect(activeNavItem("/studio/projects/new")?.label).toBe("Projects");
    expect(activeNavItem("/studio/services/abc")?.label).toBe("Services");
    expect(activeNavItem("/studio/services/pricing")?.label).toBe("Pricing");
    expect(activeNavItem("/studio/settings/brand")?.label).toBe("Brand");
    expect(activeNavItem("/elsewhere")).toBeNull();
  });

  it("maps go-to shortcuts to sections", () => {
    expect(GO_TO_SHORTCUTS.get("p")).toBe("/studio/projects");
    expect(GO_TO_SHORTCUTS.get("h")).toBe("/studio");
    expect(GO_TO_SHORTCUTS.get(",")).toBe("/studio/settings/brand");
  });

  it("renders not-yet-built panels that point to the legacy admin", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StubPanel title="Projects" legacyHref="/admin/works" />
      </MemoryRouter>,
    );
    expect(html).toContain("Projects");
    expect(html).toContain("Not built yet");
    expect(html).toContain('href="/admin/works"');
  });
});
