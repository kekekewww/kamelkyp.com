/**
 * P2 music: Studio list filters, form parsing, the editor lifecycle through
 * the route handlers, and the single homepage showreel.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEntity, getEntity } from "../../app/lib/cms/db/lifecycle.server";
import {
  getMusicFacets,
  getShowreelSummary,
  handleMusicCreate,
  handleMusicEditorAction,
  handleMusicListAction,
  listStudioMusic,
  loadMusicEditor,
  loadMusicList,
  parseDuration,
  parseMusicForm,
} from "../../app/lib/cms/repositories/music.server";
import { insertExternalAsset, uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });

type Result = {
  data: Record<string, unknown> & {
    ok?: boolean;
    code?: string;
    issues?: Array<{ field: string; code: string }>;
  };
  init: ResponseInit | null;
};

function form(fields: Record<string, string | string[]>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      body.append(key, item);
    }
  }
  return body;
}

const testEnv = () => createTestEnv({ DB: env.DB });

async function track(
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const meta = await createEntity(
    env.DB,
    "music",
    { title: text(title), artist: text("Kamel"), ...extra },
    { now },
  );
  return meta.id;
}

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown response");
}

function fullForm(
  overrides: Record<string, string | string[]> = {},
): Record<string, string | string[]> {
  return {
    expectedRevision: "0",
    "title.zh": "訊號花園",
    "title.en": "Signal Garden",
    "artist.zh": "Kamel",
    "artist.en": "Kamel",
    "role.zh": "混音",
    "role.en": "Mixing",
    "genre.zh": "電子",
    "genre.en": "Electronic",
    "description.zh": "",
    "description.en": "",
    "year:number": "2025",
    duration: "3:15",
    "previewStartSeconds:number": "30",
    "previewEndSeconds:number": "60",
    artworkId: "",
    audioPreviewId: "",
    fullAudioId: "",
    spotifyUrl: "",
    youtubeUrl: "https://www.youtube.com/watch?v=abc123",
    soundcloudUrl: "",
    projectId: "",
    "credits.0.role.zh": "製作",
    "credits.0.role.en": "Producer",
    "credits.0.name": "Kamel",
    "otherLinks.0.label.zh": "Bandcamp",
    "otherLinks.0.label.en": "Bandcamp",
    "otherLinks.0.url": "https://kamel.bandcamp.com/track/x",
    ...overrides,
  };
}

describe("music form parsing", () => {
  it("parses every field group, durations and the revision", () => {
    const parsed = parseMusicForm(form(fullForm()));
    expect(parsed.expectedRevision).toBe(0);
    expect(parsed.clearTodoContent).toBe(false);
    expect(parsed.content).toMatchObject({
      title: text("訊號花園", "Signal Garden"),
      artist: text("Kamel"),
      role: text("混音", "Mixing"),
      genre: text("電子", "Electronic"),
      year: 2025,
      durationMs: 195_000,
      previewStartSeconds: 30,
      previewEndSeconds: 60,
      youtubeUrl: "https://www.youtube.com/watch?v=abc123",
      spotifyUrl: null,
      artworkId: null,
      projectId: null,
      credits: [{ role: text("製作", "Producer"), name: "Kamel" }],
      otherLinks: [
        {
          label: text("Bandcamp"),
          url: "https://kamel.bandcamp.com/track/x",
        },
      ],
    });
  });

  it("reads durations as m:ss, h:mm:ss or seconds", () => {
    expect(parseDuration("3:15")).toBe(195_000);
    expect(parseDuration("1:02:03")).toBe(3_723_000);
    expect(parseDuration("95")).toBe(95_000);
    expect(parseDuration("  ")).toBeNull();
    expect(parseDuration("3:75")).toBeUndefined();
    expect(parseDuration("abc")).toBeUndefined();
  });

  it("reports structural problems as field issues", () => {
    let caught: unknown;
    try {
      parseMusicForm(
        form(
          fullForm({
            duration: "three minutes",
            "previewStartSeconds:number": "60",
            "previewEndSeconds:number": "30",
          }),
        ),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "invalid_content" });
    const fields = (
      caught as { details: { issues: Array<{ field: string }> } }
    ).details.issues.map((issue) => issue.field);
    expect(fields).toEqual(
      expect.arrayContaining(["duration", "previewEndSeconds"]),
    );
  });
});

describe("music list", () => {
  it("filters by search, artist, year, role, featured and status", async () => {
    const tag = uniqueId("mx").toLowerCase();
    const a = await track(`${tag} alpha`, {
      artist: text("Kamel"),
      year: 2024,
      role: text("混音", "Mixing"),
    });
    const b = await track(`${tag} beta`, {
      artist: text("Guest Artist"),
      year: 2025,
      role: text("製作", "Production"),
    });
    await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: b }),
      intent: "feature",
      now,
    });

    const ids = async (filters: Parameters<typeof listStudioMusic>[1]) =>
      (await listStudioMusic(env.DB, { q: tag, ...filters })).map(
        (row) => row.id,
      );
    expect(await ids({})).toEqual(expect.arrayContaining([a, b]));
    expect(await ids({ artist: "guest artist" })).toEqual([b]);
    expect(await ids({ year: 2024 })).toEqual([a]);
    expect(await ids({ role: "Mixing" })).toEqual([a]);
    expect(await ids({ featured: true })).toEqual([b]);
    expect(await ids({ status: "published" })).toEqual([]);

    const facets = await getMusicFacets(env.DB);
    expect(facets.years).toEqual(expect.arrayContaining([2024, 2025]));
    expect(facets.artists).toEqual(
      expect.arrayContaining(["Kamel", "Guest Artist"]),
    );
    expect(facets.roles).toEqual(expect.arrayContaining(["Mixing"]));
  });

  it("reorders, archives, restores and duplicates from the list", async () => {
    const tag = uniqueId("ord").toLowerCase();
    const first = await track(`${tag} one`);
    const second = await track(`${tag} two`);
    const reordered = (await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ ids: JSON.stringify([first, second]) }),
      intent: "reorder",
      now,
    })) as unknown as Result;
    expect(reordered.data.ok).toBe(true);
    expect(
      (await listStudioMusic(env.DB, { q: tag })).map((row) => row.id),
    ).toEqual([first, second]);

    await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: first }),
      intent: "archive",
      now,
    });
    expect(
      (await listStudioMusic(env.DB, { q: tag })).map((row) => row.id),
    ).toEqual([second]);
    expect(
      (await listStudioMusic(env.DB, { q: tag, status: "archived" })).map(
        (row) => row.id,
      ),
    ).toEqual([first]);
    await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: first }),
      intent: "restore",
      now,
    });

    const copy = (await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: second }),
      intent: "duplicate",
      now,
    })) as unknown as Result;
    expect(copy.data).toMatchObject({ ok: true, id: expect.any(String) });
    expect((await listStudioMusic(env.DB, { q: tag })).length).toBe(3);
  });

  it("loads rows, facets, filters and the current showreel", async () => {
    const data = await loadMusicList({
      request: new Request(
        "https://kamelkyp.com/studio/music?status=all&featured=1",
      ),
      db: env.DB,
    });
    expect(data.filters).toMatchObject({ status: "all", featured: true });
    expect(data.manualOrder).toBe(false);
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data).toHaveProperty("showreel");
  });
});

describe("homepage showreel", () => {
  it("keeps exactly one showreel through the handlers", async () => {
    const a = await track("Reel A", {
      youtubeUrl: "https://www.youtube.com/watch?v=reelA",
    });
    const b = await track("Reel B", {
      youtubeUrl: "https://www.youtube.com/watch?v=reelB",
    });
    const set = async (id: string) =>
      (await handleMusicListAction({
        db: env.DB,
        env: testEnv(),
        formData: form({ id }),
        intent: "set-showreel",
        now,
      })) as unknown as Result;

    expect((await set(a)).data.ok).toBe(true);
    expect((await getShowreelSummary(env.DB))?.id).toBe(a);
    expect((await set(b)).data.ok).toBe(true);
    const flagged = await env.DB.prepare(
      "SELECT id FROM music_tracks WHERE is_showreel = 1",
    ).all<{ id: string }>();
    expect(flagged.results.map((row) => row.id)).toEqual([b]);
    expect(await getShowreelSummary(env.DB)).toMatchObject({
      id: b,
      title: "Reel B",
      status: "draft",
    });

    const cleared = (await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: b }),
      intent: "clear-showreel",
      now,
    })) as unknown as Result;
    expect(cleared.data.ok).toBe(true);
    expect(await getShowreelSummary(env.DB)).toBeNull();
  });

  it("refuses a track with nothing to play and archived tracks", async () => {
    const silent = await track("Silent");
    const refused = (await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: silent }),
      intent: "set-showreel",
      now,
    })) as unknown as Result;
    expect(refused.init?.status).toBe(409);
    expect(refused.data).toMatchObject({ ok: false, code: "invalid_state" });

    const archived = await track("Archived reel", {
      youtubeUrl: "https://youtu.be/archived1",
    });
    await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: archived }),
      intent: "archive",
      now,
    });
    const archivedRefused = (await handleMusicListAction({
      db: env.DB,
      env: testEnv(),
      formData: form({ id: archived }),
      intent: "set-showreel",
      now,
    })) as unknown as Result;
    expect(archivedRefused.data).toMatchObject({ ok: false });
  });
});

describe("music editor", () => {
  it("creates an entry and redirects to its editor", async () => {
    const response = await thrown(
      handleMusicCreate({
        db: env.DB,
        env: testEnv(),
        formData: form({ "title.zh": "新曲", "title.en": "New track" }),
        intent: "create",
        now,
      }),
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/studio\/music\/[0-9a-f-]{36}$/);
    const id = location.split("/").pop() ?? "";
    const loaded = await getEntity(env.DB, "music", id);
    expect(loaded?.content.title).toEqual(text("新曲", "New track"));
    expect(loaded?.content.artist).toEqual(text("Kamel"));
  });

  it("saves drafts freely, refuses publish with issues, then publishes", async () => {
    const id = await track("Draft only");
    const saved = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(
        fullForm({
          "artist.en": "",
          youtubeUrl: "",
          "credits.0.name": "",
        }),
      ),
      intent: "save",
      now,
    })) as unknown as Result;
    expect(saved.data).toMatchObject({ ok: true });

    const refused = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(
        fullForm({
          expectedRevision: "1",
          "artist.en": "",
          youtubeUrl: "",
        }),
      ),
      intent: "publish",
      now,
    })) as unknown as Result;
    // The draft is saved (state "Saved"); publishing waits for the checklist.
    expect(refused.data).toMatchObject({
      ok: true,
      published: false,
      meta: { status: "draft", revision: 2 },
    });
    expect(refused.data.issues?.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["artist", "audioPreviewId"]),
    );

    const published = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(fullForm({ expectedRevision: "2" })),
      intent: "publish",
      now,
    })) as unknown as Result;
    expect(published.data).toMatchObject({
      ok: true,
      meta: { status: "published" },
    });
  });

  it("answers 409 for a stale revision", async () => {
    const id = await track("Stale");
    const stale = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(fullForm({ expectedRevision: "7" })),
      intent: "save",
      now,
    })) as unknown as Result;
    expect(stale.init?.status).toBe(409);
    expect(stale.data.code).toBe("stale_revision");
  });

  it("loads the editor with asset summaries, project options and issues", async () => {
    const audio = await insertExternalAsset(env.DB, {
      kind: "audio",
      url: "https://raw.githubusercontent.com/kamel/audio/main/reel.mp3",
    });
    const id = await track("With audio", { audioPreviewId: audio });
    const data = await loadMusicEditor({
      params: { id },
      db: env.DB,
      env: testEnv(),
    });
    expect(data.meta.id).toBe(id);
    expect(data.assets[audio]).toMatchObject({ id: audio, kind: "audio" });
    expect(Array.isArray(data.projectOptions)).toBe(true);
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.previewUrl).toBe(`/studio/preview/music/${id}`);

    const missing = await thrown(
      loadMusicEditor({ params: { id: "nope" }, db: env.DB, env: testEnv() }),
    );
    expect(missing.status).toBe(404);
  });

  it("deletes a draft after the typed confirmation and leaves for the list", async () => {
    const id = await track("To delete");
    const mismatch = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form({ confirm: "delete" }),
      intent: "delete",
      now,
    })) as unknown as Result;
    expect(mismatch.data.code).toBe("confirmation_mismatch");
    // The editor navigates once its save state settles (no unsaved-changes prompt).
    const deleted = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form({ confirm: "DELETE" }),
      intent: "delete",
      now,
    })) as unknown as Result;
    expect(deleted.data).toMatchObject({
      ok: true,
      redirectTo: "/studio/music?deleted=1",
    });
    expect(await getEntity(env.DB, "music", id)).toBeNull();
  });

  it("saves pending edits before archiving or duplicating from the editor", async () => {
    const id = await track("Before archive");
    const archived = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(fullForm({ "title.en": "Edited before archive" })),
      intent: "archive",
      now,
    })) as unknown as Result;
    expect(archived.data).toMatchObject({
      ok: true,
      meta: { status: "archived", revision: 1 },
    });
    const loaded = await getEntity(env.DB, "music", id);
    expect(loaded?.content.title.en).toBe("Edited before archive");

    const restored = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(fullForm({ expectedRevision: "1" })),
      intent: "restore",
      now,
    })) as unknown as Result;
    expect(restored.data).toMatchObject({ ok: true, meta: { status: "draft" } });

    const duplicated = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form(fullForm({ expectedRevision: "2" })),
      intent: "duplicate",
      now,
    })) as unknown as Result;
    expect(duplicated.data.redirectTo).toMatch(
      /^\/studio\/music\/[0-9a-f-]{36}\?duplicated=1$/,
    );
  });

  it("toggles featured and the showreel from the editor", async () => {
    const id = await track("Editor reel", {
      youtubeUrl: "https://www.youtube.com/watch?v=edreel",
    });
    for (const intent of ["feature", "set-showreel"]) {
      const result = (await handleMusicEditorAction({
        db: env.DB,
        env: testEnv(),
        params: { id },
        formData: form({}),
        intent,
        now,
      })) as unknown as Result;
      expect(result.data.ok).toBe(true);
    }
    const loaded = await getEntity(env.DB, "music", id);
    expect(loaded?.meta).toMatchObject({ featured: true, isShowreel: true });
    const unknown = (await handleMusicEditorAction({
      db: env.DB,
      env: testEnv(),
      params: { id },
      formData: form({}),
      intent: "explode",
      now,
    })) as unknown as Result;
    expect(unknown.init?.status).toBe(422);
  });
});
