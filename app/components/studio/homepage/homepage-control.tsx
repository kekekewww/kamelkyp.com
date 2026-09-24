/**
 * Homepage control (brief §21, admin-architecture §4.2.1). One page, ruled
 * sections, each saved on its own and live at once: hero text and buttons,
 * availability, the running order of sections with their counts, the
 * showreel, the featured lists per content type and the contact band.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useBlocker, useFetcher } from "react-router";
import type { HomepageModel } from "../../../lib/cms/repositories/homepage.server";
import { AVAILABILITY_STATUSES } from "../../../lib/cms/schemas/site-settings";
import { CtaFields, SecondaryCta } from "../settings/brand-form";
import {
  type ActionData,
  errorFor,
  LeaveGuard,
  useActionToasts,
} from "../settings/form-kit";
import { localizedErrors } from "../settings/settings-editor";
import { AVAILABILITY_LABEL } from "../settings/site-form";
import { StudioPage } from "../shell/studio-page";
import {
  EditorLayout,
  EditorSection,
  ListEditor,
  LocalizedTextArea,
  LocalizedTextField,
  Select,
  StatusBadge,
  useStudioSession,
} from "../ui";
import { FEATURED_INFO, FeaturedList } from "./featured-list";
import { SectionForm } from "./section-form";
import { HomepageSectionsFields } from "./sections-fields";

const STORAGE = "studio:sections:homepage";
const FEATURED_TYPES = [
  "project",
  "music",
  "recognition",
  "writing",
  "service",
] as const;

/** Leave guard over every block, and Mod+S for the block holding focus. */
function usePageGuard() {
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const anyDirty = Object.values(dirty).some(Boolean);
  const onDirtyChange = useCallback((id: string, value: boolean) => {
    setDirty((current) =>
      current[id] === value ? current : { ...current, [id]: value },
    );
  }, []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      anyDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s")
        return;
      event.preventDefault();
      const active = document.activeElement;
      const focused =
        active instanceof HTMLElement
          ? active.closest<HTMLFormElement>("form[data-section-form]")
          : null;
      const target =
        focused ??
        [
          ...document.querySelectorAll<HTMLFormElement>(
            "form[data-section-form]",
          ),
        ].find((form) => dirty[form.dataset.sectionForm ?? ""]);
      const button =
        target?.querySelector<HTMLButtonElement>("button[data-save]");
      target?.requestSubmit(button ?? undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty]);

  return { blocker, onDirtyChange };
}

function Showreel({ showreel }: { showreel: HomepageModel["showreel"] }) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const { csrfToken } = useStudioSession();
  const [choice, setChoice] = useState("");
  const current = showreel.current;
  const submit = (fields: Record<string, string>) =>
    fetcher.submit({ csrfToken, ...fields }, { method: "post" });

  return (
    <div className="studio-showreel">
      {current ? (
        <div className="studio-showreel__current">
          <p className="studio-showreel__title">
            <Link to={`/studio/music/${current.id}`}>{current.label}</Link>
            <StatusBadge status={current.status} />
          </p>
          {current.status !== "published" ? (
            <p className="studio-kit-warning" role="note">
              This track is not published, so visitors see the empty player.
              Publish it in Music.
            </p>
          ) : null}
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => submit({ intent: "clear-showreel" })}
          >
            Clear showreel
          </button>
        </div>
      ) : (
        <p className="studio-featured__empty">
          No showreel selected. The section shows its empty player.
        </p>
      )}
      {showreel.candidates.length > 0 ? (
        <div className="studio-featured__add">
          <label className="studio-field">
            <span className="studio-field__label">
              {current ? "Change to" : "Choose a track"}
            </span>
            <select
              className="studio-input studio-select"
              value={choice}
              onChange={(event) => setChoice(event.currentTarget.value)}
            >
              <option value="">Tracks with audio…</option>
              {showreel.candidates.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.label}
                  {track.status === "draft" ? " (draft)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            name="intent"
            value="set-showreel"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            disabled={!choice}
            onClick={() => {
              submit({ intent: "set-showreel", id: choice });
              setChoice("");
            }}
          >
            Set as showreel
          </button>
        </div>
      ) : (
        <p className="studio-hint">
          No music entries with audio yet. Add a preview or full audio file in{" "}
          <Link className="studio-link" to="/studio/music">
            Music
          </Link>
          .
        </p>
      )}
      <p className="studio-hint">The showreel never plays on its own.</p>
    </div>
  );
}

export function HomepageControl({ model }: { model: HomepageModel }) {
  const { blocker, onDirtyChange } = usePageGuard();
  const brand = model.brand.value;
  const site = model.site.value;

  const sections = [
    { id: "hero", label: "Hero" },
    { id: "sections", label: "Sections" },
    { id: "showreel", label: "Showreel" },
    ...FEATURED_TYPES.map((type) => ({
      id: `featured-${type}`,
      label: FEATURED_INFO[type].title,
    })),
    { id: "contact", label: "Contact CTA" },
  ];

  return (
    <StudioPage
      title="Homepage"
      actions={
        <a
          className="studio-btn studio-btn--ghost studio-btn--compact"
          href="/studio/preview/home?drafts=1"
          target="_blank"
          rel="noopener"
        >
          Preview homepage
        </a>
      }
    >
      <p className="studio-hint studio-homepage__intro">
        Everything here is live when saved: each block has its own Save, and
        featured lists, order and showreel change at once.
      </p>
      <EditorLayout sections={sections}>
        <div className="studio-homepage">
          <EditorSection
            id="hero"
            label="Hero"
            defaultOpen
            storageKey={STORAGE}
          >
            <div className="studio-settings-readonly">
              <p className="studio-field__label">Brand name</p>
              <p className="studio-settings-readonly__value">
                {brand.brandName}
              </p>
              <Link className="studio-link" to="/studio/settings/brand">
                Edit in Brand settings
              </Link>
            </div>
            <SectionForm
              id="hero"
              intent="save-hero"
              label="Hero"
              revision={model.brand.revision}
              updatedAt={model.brand.updatedAt}
              onDirtyChange={onDirtyChange}
            >
              {(errors) => (
                <>
                  <ListEditor
                    name="roles"
                    label="Roles"
                    items={brand.roles}
                    create={() => ({ zh: "", en: "" })}
                    addLabel="Add role"
                    max={6}
                    itemLabel={(index) => `role ${index + 1}`}
                    renderItem={(item, index) => (
                      <LocalizedTextField
                        name={`roles.${index}`}
                        label={`Role ${index + 1}`}
                        maxLength={80}
                        defaultValue={item}
                      />
                    )}
                  />
                  <LocalizedTextArea
                    name="heroStatement"
                    label="Statement"
                    rows={2}
                    maxLength={300}
                    defaultValue={brand.heroStatement}
                    errors={localizedErrors(errors, "heroStatement")}
                  />
                  <LocalizedTextArea
                    name="heroSubtext"
                    label="Subtext"
                    rows={2}
                    maxLength={600}
                    defaultValue={brand.heroSubtext}
                    errors={localizedErrors(errors, "heroSubtext")}
                  />
                  <CtaFields
                    name="primaryCta"
                    label="Main button"
                    value={brand.primaryCta}
                    errors={errors}
                  />
                  <SecondaryCta value={brand.secondaryCta} errors={errors} />
                </>
              )}
            </SectionForm>
            <SectionForm
              id="availability"
              intent="save-availability"
              label="Availability"
              revision={model.site.revision}
              updatedAt={model.site.updatedAt}
              onDirtyChange={onDirtyChange}
            >
              {(errors) => (
                <>
                  <Select
                    name="availability.status"
                    label="Availability"
                    defaultValue={site.availability.status}
                    options={AVAILABILITY_STATUSES.map((status) => ({
                      value: status,
                      label: AVAILABILITY_LABEL[status],
                    }))}
                    hint="“Not shown” makes no claim at all."
                  />
                  <LocalizedTextField
                    name="availability.message"
                    label="Availability message"
                    maxLength={200}
                    defaultValue={site.availability.message}
                    errors={localizedErrors(errors, "availability.message")}
                  />
                </>
              )}
            </SectionForm>
          </EditorSection>

          <EditorSection
            id="sections"
            label="Sections"
            defaultOpen
            storageKey={STORAGE}
          >
            <SectionForm
              id="sections"
              intent="save-sections"
              label="Sections"
              revision={model.site.revision}
              updatedAt={model.site.updatedAt}
              onDirtyChange={onDirtyChange}
            >
              {(errors) => (
                <HomepageSectionsFields
                  homepage={site.homepage}
                  errors={(field) => errorFor(errors, field)}
                />
              )}
            </SectionForm>
          </EditorSection>

          <EditorSection
            id="showreel"
            label="Showreel"
            defaultOpen
            storageKey={STORAGE}
          >
            <div id="showreel" className="studio-settings-anchor" />
            <Showreel showreel={model.showreel} />
          </EditorSection>

          {FEATURED_TYPES.map((type) => (
            <EditorSection
              key={type}
              id={`featured-${type}`}
              label={FEATURED_INFO[type].title}
              defaultOpen={type === "project"}
              storageKey={STORAGE}
            >
              <div id={`featured-${type}`} className="studio-settings-anchor" />
              <FeaturedList
                group={model.featured[type]}
                limit={
                  type === "project"
                    ? site.homepage.featuredProjectCount
                    : type === "writing"
                      ? site.homepage.writingCount
                      : type === "recognition"
                        ? site.homepage.recognitionCount
                        : undefined
                }
              />
            </EditorSection>
          ))}

          <EditorSection id="contact" label="Contact CTA" storageKey={STORAGE}>
            <SectionForm
              id="contact"
              intent="save-contact"
              label="Contact band"
              revision={model.site.revision}
              updatedAt={model.site.updatedAt}
              onDirtyChange={onDirtyChange}
            >
              {(errors) => (
                <>
                  <LocalizedTextArea
                    name="homepage.contactBandBody"
                    label="Homepage contact text"
                    rows={2}
                    maxLength={600}
                    defaultValue={site.homepage.contactBandBody}
                    errors={localizedErrors(errors, "homepage.contactBandBody")}
                  />
                  <LocalizedTextField
                    name="contactBand.default"
                    label="Contact band heading"
                    hint="Most pages."
                    maxLength={200}
                    defaultValue={site.contactBand.default}
                  />
                  <LocalizedTextField
                    name="contactBand.project"
                    label="On project pages"
                    maxLength={200}
                    defaultValue={site.contactBand.project}
                  />
                  <LocalizedTextField
                    name="contactBand.work"
                    label="On the work list"
                    maxLength={200}
                    defaultValue={site.contactBand.work}
                  />
                  <p className="studio-hint">
                    The button uses the main hero button; the email comes from{" "}
                    <Link
                      className="studio-link"
                      to="/studio/settings/brand#contact"
                    >
                      Brand settings
                    </Link>
                    .
                  </p>
                </>
              )}
            </SectionForm>
          </EditorSection>
        </div>
      </EditorLayout>
      <LeaveGuard blocker={blocker} />
    </StudioPage>
  );
}
