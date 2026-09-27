/**
 * The homepage running order: every section in the order the page renders
 * it, a visibility switch each, and the item counts next to the sections
 * that list entries. Used by Homepage control and Site settings (both write
 * `site.homepage`).
 */
import {
  HOMEPAGE_SECTIONS,
  type HomepageSection,
  type SiteSettings,
} from "../../../lib/cms/schemas/site-settings";
import { Switch, TextInput } from "../ui";

type CountKey = "featuredProjectCount" | "writingCount" | "recognitionCount";

export const SECTION_INFO: Record<
  HomepageSection,
  {
    label: string;
    count?: { key: CountKey; min: number; max: number; noun: string };
  }
> = {
  showreel: { label: "Showreel" },
  selectedWork: {
    label: "Selected work",
    count: { key: "featuredProjectCount", min: 1, max: 12, noun: "projects" },
  },
  capabilities: { label: "Capabilities" },
  recognition: {
    label: "Recognition",
    count: { key: "recognitionCount", min: 0, max: 12, noun: "entries" },
  },
  services: { label: "Services" },
  pricing: { label: "Pricing" },
  about: { label: "About" },
  writing: {
    label: "Writing",
    count: { key: "writingCount", min: 0, max: 12, noun: "entries" },
  },
  contact: { label: "Contact" },
};

export function HomepageSectionsFields({
  homepage,
  errors,
}: {
  homepage: SiteSettings["homepage"];
  errors?: (field: string) => string | null;
}) {
  return (
    <ol
      className="studio-running-order"
      aria-label="Homepage sections in page order"
    >
      {HOMEPAGE_SECTIONS.map((key, index) => {
        const info = SECTION_INFO[key];
        const count = info.count;
        return (
          <li className="studio-running-order__row" key={key}>
            <span className="studio-running-order__position" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Switch
              name={`homepage.sections.${key}`}
              label={info.label}
              defaultChecked={homepage.sections[key]}
            />
            {count ? (
              <TextInput
                name={`homepage.${count.key}:number`}
                label={`Number of ${count.noun}`}
                type="number"
                inputMode="numeric"
                min={count.min}
                max={count.max}
                step={1}
                defaultValue={homepage[count.key]}
                className="studio-running-order__count"
                error={errors?.(`homepage.${count.key}`) ?? null}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
