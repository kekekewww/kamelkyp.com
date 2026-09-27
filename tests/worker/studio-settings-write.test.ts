import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CmsError } from "../../app/lib/cms/db/errors";
import {
  getBrandSettings,
  getSiteSettings,
} from "../../app/lib/cms/settings.server";
import {
  acknowledgeRedesignCopy,
  confirmContactEmail,
  contactEmailNeedsReview,
  handleBrandSettingsAction,
  handleSiteSettingsAction,
  loadBrandScreen,
  loadSiteScreen,
  patchBrandSettings,
  patchSiteSettings,
  readSettingsWithMeta,
  saveBrandSettings,
  saveSiteSettings,
} from "../../app/lib/cms/settings-write.server";
import {
  insertExternalAsset,
  restoreSettings,
  snapshotSettings,
} from "./studio-p4-fixtures";

const now = new Date("2026-09-25T10:00:00Z");
// Deny-list term assembled at runtime so no personal name is spelled out here.
const DENIED = ["Ya", "ng"].join("");

async function expectCmsError(run: Promise<unknown>, code: string) {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(CmsError);
  expect((error as CmsError).code).toBe(code);
  return error as CmsError;
}

// Storage persists across tests in a file: start each test from the seeds.
let seeded: Awaited<ReturnType<typeof snapshotSettings>>;
beforeAll(async () => {
  seeded = await snapshotSettings(env.DB);
});
beforeEach(async () => {
  await restoreSettings(env.DB, seeded);
});

function issueFields(error: CmsError): string[] {
  const details = error.details as { issues?: Array<{ field: string }> };
  return (details.issues ?? []).map((issue) => issue.field);
}

describe("settings documents with metadata", () => {
  it("reads both documents with revision and updated time", async () => {
    const settings = await readSettingsWithMeta(env.DB);
    expect(settings.brand.value.brandName).toBe("Kamel");
    expect(settings.brand.revision).toBe(0);
    expect(settings.brand.updatedAt).toBe("2026-09-24T00:00:00Z");
    expect(settings.site.value.homepage.featuredProjectCount).toBe(4);
  });
});

describe("saveBrandSettings", () => {
  it("saves a full document, bumps the revision and applies at once", async () => {
    const current = await getBrandSettings(env.DB);
    const result = await saveBrandSettings(
      env.DB,
      current.revision,
      {
        ...current.value,
        tagline: { zh: "聲音與系統", en: "Sound and systems" },
      },
      now,
    );
    expect(result.revision).toBe(current.revision + 1);
    const saved = await getBrandSettings(env.DB);
    expect(saved.value.tagline.en).toBe("Sound and systems");
    expect(saved.revision).toBe(current.revision + 1);
    const meta = await readSettingsWithMeta(env.DB);
    expect(meta.brand.updatedAt).toBe(now.toISOString());
  });

  it("refuses a stale revision (edited elsewhere)", async () => {
    const current = await getBrandSettings(env.DB);
    await saveBrandSettings(env.DB, current.revision, current.value, now);
    await expectCmsError(
      saveBrandSettings(env.DB, current.revision, current.value, now),
      "stale_revision",
    );
  });

  it("refuses invalid values with field issues", async () => {
    const current = await getBrandSettings(env.DB);
    const error = await expectCmsError(
      saveBrandSettings(
        env.DB,
        current.revision,
        {
          ...current.value,
          brandName: "",
          primaryCta: { label: current.value.primaryCta.label, href: "ftp:x" },
          contactEmail: "not-an-email",
        },
        now,
      ),
      "invalid_content",
    );
    expect(issueFields(error)).toEqual(
      expect.arrayContaining(["brandName", "primaryCta.href", "contactEmail"]),
    );
  });

  it("refuses public text with a personal-name variant", async () => {
    const current = await getBrandSettings(env.DB);
    const error = await expectCmsError(
      saveBrandSettings(
        env.DB,
        current.revision,
        { ...current.value, tagline: { zh: "聲音", en: `By ${DENIED}` } },
        now,
      ),
      "invalid_content",
    );
    const details = error.details as {
      issues: Array<{ field: string; code: string; locale?: string }>;
    };
    expect(details.issues).toContainEqual(
      expect.objectContaining({
        field: "tagline",
        code: "brand_name",
        locale: "en",
      }),
    );
  });

  it("refuses unknown and wrong-kind asset references", async () => {
    const current = await getBrandSettings(env.DB);
    const audio = await insertExternalAsset(env.DB, {
      kind: "audio",
      url: "https://media.example.com/a.mp3",
    });
    const error = await expectCmsError(
      saveBrandSettings(
        env.DB,
        current.revision,
        { ...current.value, portraitId: "missing-asset", logoId: audio },
        now,
      ),
      "invalid_content",
    );
    expect(issueFields(error)).toEqual(
      expect.arrayContaining(["portraitId", "logoId"]),
    );
  });

  it("indexes brand media as live usage", async () => {
    const current = await getBrandSettings(env.DB);
    const image = await insertExternalAsset(env.DB);
    await saveBrandSettings(
      env.DB,
      current.revision,
      { ...current.value, portraitId: image },
      now,
    );
    const usages = await env.DB.prepare(
      "SELECT entity_type, entity_id, field, scope FROM media_usages WHERE asset_id = ? ORDER BY scope",
    )
      .bind(image)
      .all();
    expect(usages.results).toEqual([
      {
        entity_type: "brand_settings",
        entity_id: "brand",
        field: "portraitId",
        scope: "published",
      },
      {
        entity_type: "brand_settings",
        entity_id: "brand",
        field: "portraitId",
        scope: "working",
      },
    ]);
  });

  it("creates the row when it is missing (fresh database)", async () => {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'brand'").run();
    const current = await getBrandSettings(env.DB);
    const result = await saveBrandSettings(env.DB, 0, current.value, now);
    expect(result.revision).toBe(1);
    expect((await getBrandSettings(env.DB)).value.brandName).toBe("Kamel");
  });
});

describe("patchBrandSettings", () => {
  it("merges a partial form into the stored document", async () => {
    const current = await getBrandSettings(env.DB);
    await patchBrandSettings(
      env.DB,
      current.revision,
      { heroSubtext: { zh: "副標", en: "Subtext" } },
      now,
    );
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.heroSubtext).toEqual({ zh: "副標", en: "Subtext" });
    expect(saved.heroStatement).toEqual(current.value.heroStatement);
    expect(saved.capabilities).toEqual(current.value.capabilities);
  });

  it("never lets a form set the review flags", async () => {
    const current = await getBrandSettings(env.DB);
    await patchBrandSettings(
      env.DB,
      current.revision,
      {
        contactEmailConfirmedAt: "2020-01-01T00:00:00Z",
        redesignCopyAcknowledgedAt: "2020-01-01T00:00:00Z",
      },
      now,
    );
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.contactEmailConfirmedAt).toBeNull();
    expect(saved.redesignCopyAcknowledgedAt).toBeNull();
  });

  it("keeps the seeded contact email untouched when other fields change", async () => {
    const current = await getBrandSettings(env.DB);
    await patchBrandSettings(
      env.DB,
      current.revision,
      {
        contactEmail: current.value.contactEmail,
        tagline: current.value.tagline,
      },
      now,
    );
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.contactEmail).toBe(current.value.contactEmail);
    expect(saved.contactEmailConfirmedAt).toBeNull();
  });

  it("treats a changed contact address as reviewed", async () => {
    const current = await getBrandSettings(env.DB);
    await patchBrandSettings(
      env.DB,
      current.revision,
      { contactEmail: "hello@kamelkyp.com" },
      now,
    );
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.contactEmail).toBe("hello@kamelkyp.com");
    expect(saved.contactEmailConfirmedAt).toBe(now.toISOString());
  });

  it("removes the secondary CTA when it is switched off", async () => {
    const current = await getBrandSettings(env.DB);
    expect(current.value.secondaryCta).not.toBeNull();
    await patchBrandSettings(
      env.DB,
      current.revision,
      {
        secondaryCtaEnabled: false,
        secondaryCta: { label: { zh: "", en: "" }, href: "" },
      },
      now,
    );
    expect((await getBrandSettings(env.DB)).value.secondaryCta).toBeNull();
  });
});

describe("contact email and redesign copy review", () => {
  it("flags the seeded contact address as containing a personal name", async () => {
    const current = await getBrandSettings(env.DB);
    expect(contactEmailNeedsReview(current.value.contactEmail)).toBe(true);
    expect(contactEmailNeedsReview("hello@kamelkyp.com")).toBe(false);
    expect(contactEmailNeedsReview("")).toBe(false);
  });

  it("confirms the address without changing it", async () => {
    const current = await getBrandSettings(env.DB);
    await confirmContactEmail(env.DB, current.revision, now);
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.contactEmail).toBe(current.value.contactEmail);
    expect(saved.contactEmailConfirmedAt).toBe(now.toISOString());
  });

  it("acknowledges the migrated redesign copy", async () => {
    const current = await getBrandSettings(env.DB);
    await acknowledgeRedesignCopy(env.DB, current.revision, now);
    expect(
      (await getBrandSettings(env.DB)).value.redesignCopyAcknowledgedAt,
    ).toBe(now.toISOString());
  });
});

describe("site settings", () => {
  it("saves homepage visibility and counts", async () => {
    const current = await getSiteSettings(env.DB);
    await patchSiteSettings(
      env.DB,
      current.revision,
      {
        homepage: {
          sections: { writing: false },
          featuredProjectCount: 6,
        },
      },
      now,
    );
    const saved = (await getSiteSettings(env.DB)).value;
    expect(saved.homepage.sections.writing).toBe(false);
    expect(saved.homepage.sections.showreel).toBe(true);
    expect(saved.homepage.featuredProjectCount).toBe(6);
    expect(saved.homepage.contactBandBody).toEqual(
      current.value.homepage.contactBandBody,
    );
  });

  it("refuses counts outside their range", async () => {
    const current = await getSiteSettings(env.DB);
    const error = await expectCmsError(
      patchSiteSettings(
        env.DB,
        current.revision,
        { homepage: { featuredProjectCount: 0, writingCount: 13 } },
        now,
      ),
      "invalid_content",
    );
    expect(issueFields(error)).toEqual(
      expect.arrayContaining([
        "homepage.featuredProjectCount",
        "homepage.writingCount",
      ]),
    );
  });

  it("refuses duplicate navigation items", async () => {
    const current = await getSiteSettings(env.DB);
    await expectCmsError(
      patchSiteSettings(
        env.DB,
        current.revision,
        {
          navigation: {
            items: [
              { key: "work", visible: true },
              { key: "work", visible: false },
            ],
          },
        },
        now,
      ),
      "invalid_content",
    );
  });

  it("saves the OpenGraph image and indexes it", async () => {
    const current = await getSiteSettings(env.DB);
    const image = await insertExternalAsset(env.DB);
    await saveSiteSettings(
      env.DB,
      current.revision,
      { ...current.value, ogImageId: image },
      now,
    );
    expect((await getSiteSettings(env.DB)).value.ogImageId).toBe(image);
    const usage = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM media_usages WHERE asset_id = ? AND entity_type = 'site_settings'",
    )
      .bind(image)
      .first<{ n: number }>();
    expect(usage?.n).toBe(2);
  });

  it("refuses a personal-name variant in the footer message", async () => {
    const current = await getSiteSettings(env.DB);
    await expectCmsError(
      patchSiteSettings(
        env.DB,
        current.revision,
        { footerMessage: { zh: "", en: `${DENIED} studio` } },
        now,
      ),
      "invalid_content",
    );
  });
});

describe("settings screen actions", () => {
  type Result = {
    data?: Record<string, unknown>;
    init?: { status?: number } | null;
  };
  const body = (result: unknown) =>
    ((result as Result).data ?? {}) as Record<string, unknown>;
  const status = (result: unknown) => (result as Result).init?.status ?? 200;
  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }

  it("loads the brand screen with the contact note flag and categories", async () => {
    const screen = await loadBrandScreen(env.DB, env as never);
    expect(screen.brand.value.brandName).toBe("Kamel");
    expect(screen.contactNeedsReview).toBe(true);
    expect(screen.categories.map((term) => term.slug)).toContain("software");
  });

  it("saves the brand form, turning empty asset pickers into none", async () => {
    const brand = await getBrandSettings(env.DB);
    const result = await handleBrandSettingsAction({
      db: env.DB,
      formData: form({
        expectedRevision: String(brand.revision),
        "tagline.zh": "新標語",
        "tagline.en": "New tagline",
        portraitId: "",
        "brandAssetIds.0": "",
        "secondaryCtaEnabled:bool": "true",
        "secondaryCta.label.zh": "作品",
        "secondaryCta.label.en": "Work",
        "secondaryCta.href": "/works",
      }),
      intent: "save",
      now,
    });
    expect(body(result)).toMatchObject({ ok: true });
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.tagline.en).toBe("New tagline");
    expect(saved.portraitId).toBeNull();
    expect(saved.brandAssetIds).toEqual([]);
    expect(saved.contactEmail).toBe(brand.value.contactEmail);
  });

  it("confirms the contact email together with the form's edits", async () => {
    const brand = await getBrandSettings(env.DB);
    const result = await handleBrandSettingsAction({
      db: env.DB,
      formData: form({
        expectedRevision: String(brand.revision),
        "tagline.zh": "保留",
        "tagline.en": "Kept edit",
        contactEmail: brand.value.contactEmail,
      }),
      intent: "confirm-contact-email",
      now,
    });
    expect(body(result).ok).toBe(true);
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.tagline.en).toBe("Kept edit");
    expect(saved.contactEmail).toBe(brand.value.contactEmail);
    expect(saved.contactEmailConfirmedAt).toBe(now.toISOString());
  });

  it("acknowledges the redesign copy from the brand screen", async () => {
    const brand = await getBrandSettings(env.DB);
    const result = await handleBrandSettingsAction({
      db: env.DB,
      formData: form({ expectedRevision: String(brand.revision) }),
      intent: "acknowledge-redesign-copy",
      now,
    });
    expect(body(result).ok).toBe(true);
    expect(
      (await getBrandSettings(env.DB)).value.redesignCopyAcknowledgedAt,
    ).toBe(now.toISOString());
  });

  it("answers 409 and 422 with the action result shape", async () => {
    const brand = await getBrandSettings(env.DB);
    const stale = await handleBrandSettingsAction({
      db: env.DB,
      formData: form({ expectedRevision: String(brand.revision + 5) }),
      intent: "save",
      now,
    });
    expect(status(stale)).toBe(409);
    const invalid = await handleBrandSettingsAction({
      db: env.DB,
      formData: form({
        expectedRevision: String(brand.revision),
        brandName: "",
      }),
      intent: "save",
      now,
    });
    expect(status(invalid)).toBe(422);
    expect(body(invalid).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "brandName" })]),
    );
  });

  it("saves the site form including navigation order and visibility", async () => {
    const site = await getSiteSettings(env.DB);
    const result = await handleSiteSettingsAction({
      db: env.DB,
      formData: form({
        expectedRevision: String(site.revision),
        "navigation.items.0.key": "writing",
        "navigation.items.0.visible:bool": "true",
        "navigation.items.1.key": "work",
        "navigation.items.1.visible:bool": "false",
        "navigation.items.2.key": "services",
        "navigation.items.2.visible:bool": "true",
        "navigation.items.3.key": "about",
        "navigation.items.3.visible:bool": "true",
        ogImageId: "",
        "copyright.zh": "© {year} {brand}",
        "copyright.en": "© {year} {brand}",
      }),
      intent: "save",
      now,
    });
    expect(body(result).ok).toBe(true);
    const saved = (await getSiteSettings(env.DB)).value;
    expect(saved.navigation.items).toEqual([
      { key: "writing", visible: true },
      { key: "work", visible: false },
      { key: "services", visible: true },
      { key: "about", visible: true },
    ]);
    expect(saved.ogImageId).toBeNull();
  });

  it("loads the site screen with the brand contact email read-only", async () => {
    const screen = await loadSiteScreen(env.DB, env as never);
    expect(screen.contactEmail).toBe(
      (await getBrandSettings(env.DB)).value.contactEmail,
    );
    expect(screen.site.value.homepage.featuredProjectCount).toBe(4);
  });
});
