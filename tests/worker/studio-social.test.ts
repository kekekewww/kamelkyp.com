import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import {
  deleteSocialLink,
  getSocialLink,
  handleSocialAction,
  listSocialLinks,
  normalizeSocialUrl,
  reorderSocialLinks,
  saveSocialLink,
  setSocialLinkEnabled,
  socialLinkIssues,
} from "../../app/lib/cms/repositories/social-links.server";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const later = new Date("2026-09-24T11:00:00Z");
const label = (zh: string, en = zh) => ({ zh, en });

type Unwrapped = { status: number; body: Record<string, unknown> };

function unwrap(result: unknown): Unwrapped {
  const value = result as {
    data?: Record<string, unknown>;
    init?: ResponseInit | null;
  };
  return { status: value.init?.status ?? 200, body: value.data ?? {} };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

async function act(fields: Record<string, string>) {
  const formData = form(fields);
  return unwrap(
    await handleSocialAction({
      db: env.DB,
      formData,
      intent: fields.intent ?? null,
      now,
    }),
  );
}

describe("social link URL rules", () => {
  it("adds https:// to a bare web address and keeps https links", () => {
    expect(normalizeSocialUrl("instagram", "instagram.com/kamel")).toBe(
      "https://instagram.com/kamel",
    );
    expect(normalizeSocialUrl("github", " https://github.com/kamel ")).toBe(
      "https://github.com/kamel",
    );
  });

  it("turns a bare address into mailto: for the Email platform", () => {
    expect(normalizeSocialUrl("email", "hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(normalizeSocialUrl("email", "mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
  });

  it.each([
    ["instagram", "http://instagram.com/kamel", "url"],
    ["instagram", "javascript:alert(1)", "url"],
    ["github", "mailto:hello@example.com", "url"],
    ["email", "https://example.com/contact", "url"],
    ["email", "not an address", "url"],
    ["other", "https://user:secret@example.com", "url"],
  ] as const)("refuses %s with %s", (platform, url, field) => {
    const issues = socialLinkIssues({
      platform,
      label: label("連結", "Link"),
      url: normalizeSocialUrl(platform, url),
    });
    expect(issues.map((issue) => issue.field)).toContain(field);
    expect(issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("requires the label in both locales and a known icon", () => {
    const issues = socialLinkIssues({
      platform: "threads",
      label: label("", "Threads"),
      url: "https://www.threads.net/@kamel",
      icon: "sparkles",
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "label", locale: "zh" }),
        expect.objectContaining({ field: "icon" }),
      ]),
    );
    expect(issues.some((issue) => issue.locale === "en")).toBe(false);
  });
});

describe("social links store", () => {
  it("creates enabled links at the end of the order", async () => {
    const first = await saveSocialLink(
      env.DB,
      {
        platform: "instagram",
        label: label("Instagram"),
        url: "instagram.com/kamel-first",
      },
      now,
    );
    const second = await saveSocialLink(
      env.DB,
      {
        platform: "email",
        label: label("電子郵件", "Email"),
        url: "hello@example.com",
        username: "",
      },
      now,
    );
    expect(first.enabled).toBe(true);
    expect(first.url).toBe("https://instagram.com/kamel-first");
    expect(second.url).toBe("mailto:hello@example.com");
    expect(second.username).toBeNull();
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
    const ids = (await listSocialLinks(env.DB)).map((link) => link.id);
    expect(ids.indexOf(second.id)).toBeGreaterThan(ids.indexOf(first.id));
  });

  it("refuses to store an invalid link", async () => {
    await expect(
      saveSocialLink(
        env.DB,
        { platform: "github", label: label("GitHub"), url: "ftp://x" },
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_content", status: 422 });
  });

  it("keeps a disabled link disabled unless the owner enables it", async () => {
    const repository = await saveSocialLink(
      env.DB,
      {
        platform: "github",
        label: label("網站專案", "Website repository"),
        url: "https://github.com/example/site",
        enabled: false,
      },
      now,
    );
    expect(repository.enabled).toBe(false);

    // An edit that does not mention `enabled` never re-enables it.
    const edited = await saveSocialLink(
      env.DB,
      {
        id: repository.id,
        platform: "github",
        label: label("網站原始碼", "Website source"),
        url: "https://github.com/example/site",
      },
      later,
    );
    expect(edited.enabled).toBe(false);
    expect(edited.label.en).toBe("Website source");

    // Reordering other rows leaves it alone.
    const other = await saveSocialLink(
      env.DB,
      { platform: "youtube", label: label("YouTube"), url: "youtube.com/@k" },
      now,
    );
    await reorderSocialLinks(env.DB, [other.id, repository.id]);
    expect((await getSocialLink(env.DB, repository.id))?.enabled).toBe(false);

    await setSocialLinkEnabled(env.DB, repository.id, true, later);
    expect((await getSocialLink(env.DB, repository.id))?.enabled).toBe(true);
    await setSocialLinkEnabled(env.DB, repository.id, false, later);
    expect((await getSocialLink(env.DB, repository.id))?.enabled).toBe(false);
  });

  it("reorders by the full id list", async () => {
    const a = await saveSocialLink(
      env.DB,
      { platform: "threads", label: label("A"), url: "https://a.example" },
      now,
    );
    const b = await saveSocialLink(
      env.DB,
      { platform: "threads", label: label("B"), url: "https://b.example" },
      now,
    );
    const c = await saveSocialLink(
      env.DB,
      { platform: "threads", label: label("C"), url: "https://c.example" },
      now,
    );
    const all = (await listSocialLinks(env.DB)).map((link) => link.id);
    const others = all.filter((id) => ![a.id, b.id, c.id].includes(id));
    await reorderSocialLinks(env.DB, [c.id, ...others, a.id, b.id]);
    const order = (await listSocialLinks(env.DB)).map((link) => link.id);
    expect(order.indexOf(c.id)).toBe(0);
    expect(order.indexOf(a.id)).toBe(order.length - 2);
    expect(order.indexOf(b.id)).toBe(order.length - 1);
  });

  it("deletes a link and reports a missing one", async () => {
    const link = await saveSocialLink(
      env.DB,
      { platform: "other", label: label("Other"), url: "https://x.example" },
      now,
    );
    await deleteSocialLink(env.DB, link.id);
    expect(await getSocialLink(env.DB, link.id)).toBeNull();
    await expect(deleteSocialLink(env.DB, link.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("shows only enabled links on the public site", async () => {
    const shown = await saveSocialLink(
      env.DB,
      {
        platform: "spotify",
        label: label("Spotify"),
        url: "https://open.spotify.com/artist/visible",
      },
      now,
    );
    const hidden = await saveSocialLink(
      env.DB,
      {
        platform: "soundcloud",
        label: label("SoundCloud"),
        url: "https://soundcloud.com/hidden",
        enabled: false,
      },
      now,
    );
    const context = await getPublicSiteContext(env.DB, createTestEnv(), "en");
    const urls = context.socialLinks.map((link) => link.url);
    expect(urls).toContain(shown.url);
    expect(urls).not.toContain(hidden.url);
  });
});

describe("social links action", () => {
  it("creates, updates, toggles, reorders and deletes", async () => {
    const created = await act({
      intent: "create",
      platform: "linkedin",
      "label.zh": "LinkedIn",
      "label.en": "LinkedIn",
      url: "linkedin.com/in/kamel",
      username: "kamel",
      icon: "",
      "enabled:bool": "true",
    });
    expect(created.status).toBe(200);
    const link = created.body.link as { id: string; url: string };
    expect(link.url).toBe("https://linkedin.com/in/kamel");

    const updated = await act({
      intent: "update",
      id: link.id,
      platform: "linkedin",
      "label.zh": "領英",
      "label.en": "LinkedIn",
      url: "https://www.linkedin.com/in/kamel",
      username: "",
      icon: "linkedin",
    });
    expect(updated.status).toBe(200);
    expect((updated.body.link as { icon: string }).icon).toBe("linkedin");

    const toggled = await act({
      intent: "toggle",
      id: link.id,
      "enabled:bool": "false",
    });
    expect(toggled.status).toBe(200);
    expect((await getSocialLink(env.DB, link.id))?.enabled).toBe(false);

    const order = (await listSocialLinks(env.DB)).map((item) => item.id);
    const reordered = await act({
      intent: "reorder",
      ids: JSON.stringify([link.id, ...order.filter((id) => id !== link.id)]),
    });
    expect(reordered.status).toBe(200);
    expect((await listSocialLinks(env.DB))[0]?.id).toBe(link.id);

    const deleted = await act({ intent: "delete", id: link.id });
    expect(deleted.status).toBe(200);
    expect(await getSocialLink(env.DB, link.id)).toBeNull();
  });

  it("answers invalid input with field issues", async () => {
    const result = await act({
      intent: "create",
      platform: "instagram",
      "label.zh": "",
      "label.en": "Instagram",
      url: "http://instagram.com/kamel",
    });
    expect(result.status).toBe(422);
    const issues = result.body.issues as Array<{ field: string }>;
    expect(issues.map((issue) => issue.field).sort()).toEqual(["label", "url"]);
  });

  it("refuses malformed reorder lists and unknown intents", async () => {
    expect((await act({ intent: "reorder", ids: "not json" })).status).toBe(
      422,
    );
    expect((await act({ intent: "explode" })).status).toBe(422);
    expect((await act({ intent: "toggle", id: "missing" })).status).toBe(422);
    expect(
      (await act({ intent: "toggle", id: "missing", "enabled:bool": "true" }))
        .status,
    ).toBe(404);
  });
});
