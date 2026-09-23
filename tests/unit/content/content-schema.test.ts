import { describe, expect, it } from "vitest";
import {
  ABOUT,
  AboutContentSchema,
  CAPABILITIES,
  CapabilitySchema,
  containsInventedMetric,
  PROJECT_CATEGORIES,
  PROJECTS,
  ProjectSchema,
  RECOGNITION,
  RecognitionSchema,
  SOFTWARE_SERVICES,
  SoftwareServiceSchema,
  WRITING,
  WritingEntrySchema,
} from "../../../app/content";

describe("content schemas", () => {
  it("validates every project, recognition, writing and capability entry", () => {
    for (const project of PROJECTS) {
      expect(ProjectSchema.safeParse(project).error).toBeUndefined();
    }
    for (const entry of RECOGNITION) {
      expect(RecognitionSchema.safeParse(entry).error).toBeUndefined();
    }
    for (const entry of WRITING) {
      expect(WritingEntrySchema.safeParse(entry).error).toBeUndefined();
    }
    for (const capability of CAPABILITIES) {
      expect(CapabilitySchema.safeParse(capability).error).toBeUndefined();
    }
    expect(
      SoftwareServiceSchema.safeParse(SOFTWARE_SERVICES).error,
    ).toBeUndefined();
    expect(AboutContentSchema.safeParse(ABOUT).error).toBeUndefined();
  });

  it("ships the IA's placeholder inventory", () => {
    expect(PROJECTS).toHaveLength(6);
    expect(RECOGNITION).toHaveLength(3);
    expect(WRITING).toHaveLength(4);
    expect(CAPABILITIES.map((item) => item.index)).toEqual([
      "01",
      "02",
      "03",
      "04",
    ]);
    expect(SOFTWARE_SERVICES.offerings).toHaveLength(7);
  });

  it("has no duplicate slugs or ids", () => {
    const slugs = PROJECTS.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const ids = [
      ...PROJECTS.map((item) => item.id),
      ...RECOGNITION.map((item) => item.id),
      ...WRITING.map((item) => item.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefixes placeholder slugs and titles and never invents metrics", () => {
    for (const project of PROJECTS.filter((item) => item.placeholder)) {
      expect(project.slug.startsWith("sample-")).toBe(true);
      expect(project.title.en.startsWith("Sample:")).toBe(true);
      expect(project.title.zh.startsWith("示意：")).toBe(true);
      expect(project.links).toEqual([]);
      expect(project.credits).toEqual([]);
      expect(containsInventedMetric(project)).toBe(false);
    }
    for (const entry of WRITING.filter((item) => item.placeholder)) {
      expect(entry.title.en.startsWith("Sample:")).toBe(true);
      expect(entry.title.zh.startsWith("示意：")).toBe(true);
    }
  });

  it("covers every category and spans at least three with featured projects", () => {
    const covered = new Set(PROJECTS.flatMap((project) => project.categories));
    for (const category of PROJECT_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
    const featured = new Set(
      PROJECTS.filter((project) => project.featured).map(
        (project) => project.categories[0],
      ),
    );
    expect(featured.size).toBeGreaterThanOrEqual(3);
  });

  it("rejects placeholder rule violations", () => {
    const [first] = PROJECTS;
    expect(
      ProjectSchema.safeParse({ ...first, title: { zh: "作品", en: "Work" } })
        .success,
    ).toBe(false);
    expect(
      ProjectSchema.safeParse({
        ...first,
        description: { zh: "示意：NT$4,000", en: "Reached 10,000 users" },
      }).success,
    ).toBe(false);
    expect(
      WritingEntrySchema.safeParse({ ...WRITING[0], placeholder: false })
        .success,
    ).toBe(false);
  });

  it("keeps the real name and 'Kamel' headings out of About", () => {
    expect(
      AboutContentSchema.safeParse({
        ...ABOUT,
        lede: { zh: "我是楊子賢", en: "I am Kevin Yang" },
      }).success,
    ).toBe(false);
    expect(
      AboutContentSchema.safeParse({
        ...ABOUT,
        teaser: {
          ...ABOUT.teaser,
          heading: { zh: "關於 Kamel", en: "About Kamel" },
        },
      }).success,
    ).toBe(false);
  });

  it("never prices software services", () => {
    expect(containsInventedMetric(SOFTWARE_SERVICES)).toBe(false);
    for (const model of SOFTWARE_SERVICES.engagementModels) {
      expect(model.price).toEqual({
        zh: "依專案報價",
        en: "Contact for quote",
      });
    }
  });
});
