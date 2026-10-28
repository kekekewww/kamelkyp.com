/**
 * Studio → Settings → Footer (wp3 spec §4.5, §6.1): the screen rendered with
 * the six seeded groups (custom Work & Resources with GitHub shown and
 * "Website repository" hidden).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { FooterSettings } from "../../app/components/studio/footer/footer-settings";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import {
  FOOTER_SYSTEM_GROUPS,
  type FooterSystemKey,
} from "../../app/lib/cms/public/footer";
import type {
  FooterScreenSources,
  StudioFooterGroup,
  StudioFooterLink,
} from "../../app/lib/cms/schemas/footer";

const text = (zh: string, en = zh) => ({ zh, en });
const FINGERPRINT = "f".repeat(64);

function render(element: React.ReactNode, path = "/studio/settings/footer") {
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

function builtIn(key: FooterSystemKey): StudioFooterGroup {
  return {
    id: FOOTER_SYSTEM_GROUPS[key].seedId,
    key,
    kind: key,
    stored: true,
    label: { ...FOOTER_SYSTEM_GROUPS[key].label },
    enabled: true,
    hideable: FOOTER_SYSTEM_GROUPS[key].hideable,
    links: [],
    fingerprint: FINGERPRINT,
  };
}

function link(
  key: string,
  label: { zh: string; en: string },
  url: string,
  enabled: boolean,
  notes: string[] = [],
): StudioFooterLink {
  return {
    key,
    rows: {
      zh: { id: `${key}-zh`, url, enabled },
      en: { id: `${key}-en`, url, enabled },
    },
    label,
    url,
    enabled,
    notes,
  };
}

function workResources(links: StudioFooterLink[]): StudioFooterGroup {
  return {
    id: "seed-work-resources",
    key: "work_resources",
    kind: "custom",
    stored: true,
    label: text("作品與資源", "Work & Resources"),
    enabled: true,
    hideable: true,
    links,
    fingerprint: FINGERPRINT,
  };
}

const SEEDED_LINKS = [
  link("github", text("GitHub"), "https://github.com/kamel-fixture", true),
  link(
    "repository",
    text("網站專案", "Website repository"),
    "https://github.com/kamel-fixture/site",
    false,
  ),
];

function seededGroups(custom = workResources(SEEDED_LINKS)) {
  return [
    builtIn("navigate"),
    builtIn("services"),
    custom,
    builtIn("find_me"),
    builtIn("contact"),
    builtIn("legal"),
  ];
}

const SOURCES: FooterScreenSources = {
  navigation: [
    { key: "work", visible: true },
    { key: "services", visible: true },
    { key: "about", visible: true },
    { key: "writing", visible: true },
  ],
  serviceAreas: [],
  socialLinks: [
    {
      id: "social-1",
      label: text("IG", "Instagram"),
      url: "https://instagram.com/kamel-fixture",
    },
  ],
  contactEmail: "studio@example.com",
};

function screen(groups = seededGroups(), sources = SOURCES) {
  return render(<FooterSettings groups={groups} sources={sources} />);
}

function between(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = html.indexOf(end, from + start.length);
  return html.slice(from, to === -1 ? undefined : to);
}

describe("footer settings screen", () => {
  it("lists the groups in footer order with a switch for each but Legal", () => {
    const html = screen();
    expect(html).toContain("<title>Footer — KAMEL STUDIO</title>");
    const list = between(html, 'aria-label="Footer groups"', "Add a group");
    const positions = [
      "Navigate",
      "Services",
      "Work &amp; Resources",
      "Find Me",
      "Contact",
      "Legal",
    ].map((name) => list.indexOf(`studio-footer__name"><span>${name}</span>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.match(/Always shown/g)).toHaveLength(1);
    expect(html.match(/role="switch"/g)).toHaveLength(5);
    expect(html).toContain("Every change is live when you save it.");
  });

  it("links each built-in group to the screen that edits its links", () => {
    const html = screen();
    const section = (name: string, next: string) =>
      between(html, `Edit<span class="visually-hidden"> ${name}`, next);
    expect(section("Navigate", "Edit<span")).toContain(
      'href="/studio/settings/site"',
    );
    expect(section("Services", "Edit<span")).toContain(
      'href="/studio/settings/site"',
    );
    expect(section("Find Me", "Edit<span")).toContain('href="/studio/social"');
    expect(section("Contact", "Edit<span")).toContain(
      'href="/studio/settings/brand"',
    );
    expect(section("Legal", "Add a group")).toContain(
      'href="/studio/services/terms"',
    );
  });

  it("edits a custom group's links and only the labels of built-in groups", () => {
    const html = screen();
    const custom = between(
      html,
      'aria-label="Group: Work &amp; Resources"',
      "</form>",
    );
    expect(custom).toMatch(
      /name="links\.0\.label\.zh"[^>]*lang="zh-Hant"|lang="zh-Hant"[^>]*name="links\.0\.label\.zh"/,
    );
    expect(custom).toContain('name="links.1.url"');
    expect(custom).toContain('name="links.0.enabled:bool"');
    expect(custom).toMatch(/type="hidden" name="fingerprint" value="f{64}"/);
    expect(custom).toContain('value="save-group"');
    const navigate = between(html, 'aria-label="Group: Navigate"', "</form>");
    expect(navigate).toContain('value="save-group"');
    expect(navigate).not.toContain('name="links.');
    const legal = between(html, 'aria-label="Group: Legal"', "</form>");
    expect(legal).not.toContain('name="links.');
  });

  it("names each order handle with its position", () => {
    expect(screen()).toContain(
      "Reorder: Work &amp; Resources, position 3 of 6",
    );
  });

  it("previews the saved footer", () => {
    const html = screen();
    const preview = html.slice(html.indexOf("p3-footer-preview"));
    expect(preview).toContain("GitHub");
    expect(preview).not.toContain("Website repository");
    expect(preview).toContain("Legal");
    expect(preview).toContain('aria-label="Preview language"');
  });

  it("adds groups through save-group without an id", () => {
    const html = screen();
    const add = between(html, "Add a group", "</section>");
    expect(add).toContain('value="save-group"');
    expect(add).not.toContain('name="id"');
    expect(add).toContain('name="enabled:bool"');
    expect(html).toContain("1 of 2 links shown");
  });

  it("shows load notes of legacy rows", () => {
    const html = screen(
      seededGroups(
        workResources([
          link("legacy", text("只有中文", ""), "https://example.com/zh", true, [
            "EN label missing; add it before saving.",
          ]),
        ]),
      ),
    );
    expect(html).toContain("EN label missing; add it before saving.");
  });

  it("asks for both labels without the publish wording", () => {
    const html = screen();
    expect(html).not.toContain("Required to publish");
    expect(html).toContain("Required in ZH and EN.");
    expect(html).toContain("Default: 導覽 / Navigate.");
  });

  it("flags a shown group that would render nothing", () => {
    const html = screen(
      seededGroups(
        workResources([
          link("hidden", text("隱藏", "Hidden"), "https://example.com", false),
        ]),
      ),
    );
    expect(html).toContain("Left out of the footer: no link to show.");
    expect(screen()).not.toContain("Left out of the footer");
  });
});
