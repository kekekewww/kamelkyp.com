/**
 * Site settings (brief §17, content-schema §2.9, admin §4.4 "Site settings").
 * SEO · CONTACT · NAVIGATION · FOOTER · AVAILABILITY · HOMEPAGE · SERVICE
 * PAGES. The contact email lives in Brand settings and is shown here
 * read-only. Save applies to the live site at once.
 */
import { useState } from "react";
import { Link } from "react-router";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import {
  AVAILABILITY_STATUSES,
  formatCopyright,
  type NavKey,
  type SiteSettings,
} from "../../../lib/cms/schemas/site-settings";
import type { SettingsWithMeta } from "../../../lib/cms/settings-write.server";
import { HomepageSectionsFields } from "../homepage/sections-fields";
import {
  EditorSection,
  ListEditor,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  moveItem,
  Select,
  Switch,
  TextInput,
} from "../ui";
import { errorFor } from "./form-kit";
import { localizedErrors, SettingsEditor } from "./settings-editor";

const FORM_ID = "site-settings";
const STORAGE = "studio:sections:site";

const SECTIONS = [
  { id: "seo", label: "SEO" },
  { id: "contact", label: "Contact" },
  { id: "navigation", label: "Navigation" },
  { id: "footer", label: "Footer" },
  { id: "availability", label: "Availability" },
  { id: "homepage", label: "Homepage" },
  { id: "service-pages", label: "Service pages" },
];

const SECTION_FIELDS: Record<string, RegExp> = {
  seo: /^(siteTitle|siteDescription|seoDescription|ogImageId|defaultSocialImageId)\b/,
  navigation: /^navigation\b/,
  footer: /^(footerMessage|copyright)\b/,
  availability: /^availability\b/,
  homepage: /^homepage\b/,
  "service-pages": /^(serviceAreas|servicesPage|softwarePage)\b/,
};

const NAV_LABEL: Record<NavKey, string> = {
  work: "Work",
  services: "Services",
  about: "About",
  writing: "Writing",
};

export const AVAILABILITY_LABEL: Record<
  (typeof AVAILABILITY_STATUSES)[number],
  string
> = {
  unspecified: "Not shown",
  available: "Available for new work",
  limited: "Limited availability",
  unavailable: "Not taking new work",
};

const AREA_LABEL: Record<string, string> = {
  mixing: "Mixing",
  song_transition: "Song transition",
  software: "Software",
};

const blank = () => ({ zh: "", en: "" });

function NavigationField({
  items,
}: {
  items: SiteSettings["navigation"]["items"];
}) {
  const [order, setOrder] = useState(items.map((item) => item.key));
  const visible = new Map(items.map((item) => [item.key, item.visible]));
  return (
    <ol className="studio-settings-nav" aria-label="Navigation items in order">
      {order.map((key, index) => (
        <li className="studio-settings-nav__row" key={key}>
          <input
            type="hidden"
            name={`navigation.items.${index}.key`}
            value={key}
          />
          <Switch
            name={`navigation.items.${index}.visible`}
            label={NAV_LABEL[key]}
            defaultChecked={visible.get(key) ?? true}
          />
          <div className="studio-settings-nav__moves">
            <button
              type="button"
              className="studio-order__step"
              disabled={index === 0}
              onClick={() => setOrder(moveItem(order, index, index - 1))}
            >
              <span className="visually-hidden">Move {NAV_LABEL[key]} up</span>
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              className="studio-order__step"
              disabled={index === order.length - 1}
              onClick={() => setOrder(moveItem(order, index, index + 1))}
            >
              <span className="visually-hidden">
                Move {NAV_LABEL[key]} down
              </span>
              <span aria-hidden="true">↓</span>
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CopyrightField({
  value,
  brandName,
  error,
}: {
  value: SiteSettings["copyright"];
  brandName: string;
  error?: Partial<Record<"zh" | "en", string>>;
}) {
  const [template, setTemplate] = useState(value.en || value.zh);
  return (
    <div
      className="studio-settings-group"
      onInput={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.name === "copyright.en") setTemplate(target.value);
      }}
    >
      <LocalizedTextField
        name="copyright"
        label="Copyright line"
        hint="{year} becomes the current year and {brand} the brand name."
        maxLength={120}
        sameInBoth
        defaultValue={value}
        errors={error}
      />
      <p className="studio-hint">
        Reads as:{" "}
        <span className="studio-settings-sample">
          {formatCopyright(template, {
            year: new Date().getUTCFullYear(),
            brand: brandName,
          })}
        </span>
      </p>
    </div>
  );
}

export function SiteSettingsForm({
  site,
  contactEmail,
  assets,
  brandName = "Kamel",
}: {
  site: SettingsWithMeta<SiteSettings>;
  contactEmail: string;
  assets: Record<string, MediaSummary>;
  brandName?: string;
}) {
  const value = site.value;
  const asset = (id: string | null) => (id ? (assets[id] ?? null) : null);

  return (
    <SettingsEditor
      title="Site"
      formId={FORM_ID}
      backupType="site-settings"
      revision={site.revision}
      updatedAt={site.updatedAt}
      sections={SECTIONS}
      sectionOf={(field) =>
        Object.keys(SECTION_FIELDS).find((section) =>
          SECTION_FIELDS[section]?.test(field),
        ) ?? null
      }
    >
      {({ errors }) => (
        <>
          <EditorSection id="seo" label="SEO" defaultOpen storageKey={STORAGE}>
            <LocalizedTextField
              name="siteTitle"
              label="Site title"
              hint="The homepage title. Other pages read “Page — Kamel”."
              maxLength={120}
              defaultValue={value.siteTitle}
              errors={localizedErrors(errors, "siteTitle")}
            />
            <LocalizedTextArea
              name="siteDescription"
              label="Site description"
              hint="Used for social previews."
              rows={2}
              maxLength={400}
              defaultValue={value.siteDescription}
              errors={localizedErrors(errors, "siteDescription")}
            />
            <LocalizedTextArea
              name="seoDescription"
              label="Search description"
              hint="The default meta description for search results."
              rows={2}
              maxLength={400}
              defaultValue={value.seoDescription}
              errors={localizedErrors(errors, "seoDescription")}
            />
            <MediaField
              name="ogImageId"
              label="OpenGraph image"
              kind="image"
              hint="Shown when the homepage is shared. 1200 × 630 works best."
              value={asset(value.ogImageId)}
              error={errorFor(errors, "ogImageId")}
            />
            <MediaField
              name="defaultSocialImageId"
              label="Default social image"
              kind="image"
              hint="Used by pages that have no image of their own."
              value={asset(value.defaultSocialImageId)}
              error={errorFor(errors, "defaultSocialImageId")}
            />
          </EditorSection>

          <EditorSection
            id="contact"
            label="Contact"
            defaultOpen
            storageKey={STORAGE}
          >
            <div className="studio-settings-readonly">
              <p className="studio-field__label">Contact email</p>
              <p className="studio-settings-readonly__value">
                {contactEmail || "Not set"}
              </p>
              <Link className="studio-link" to="/studio/settings/brand#contact">
                Edit in Brand settings
              </Link>
            </div>
          </EditorSection>

          <EditorSection
            id="navigation"
            label="Navigation"
            storageKey={STORAGE}
          >
            <p className="studio-hint">
              Order and visibility of the main menu. The labels are part of the
              site’s interface copy.
            </p>
            <NavigationField items={value.navigation.items} />
            {errorFor(errors, "navigation.items") ? (
              <p className="studio-field__error" role="alert">
                {errorFor(errors, "navigation.items")}
              </p>
            ) : null}
          </EditorSection>

          <EditorSection id="footer" label="Footer" storageKey={STORAGE}>
            <LocalizedTextArea
              name="footerMessage"
              label="Footer message"
              rows={2}
              maxLength={400}
              defaultValue={value.footerMessage}
              errors={localizedErrors(errors, "footerMessage")}
            />
            <CopyrightField
              value={value.copyright}
              brandName={brandName}
              error={localizedErrors(errors, "copyright")}
            />
          </EditorSection>

          <EditorSection
            id="availability"
            label="Availability"
            storageKey={STORAGE}
          >
            <Select
              name="availability.status"
              label="Status"
              defaultValue={value.availability.status}
              options={AVAILABILITY_STATUSES.map((status) => ({
                value: status,
                label: AVAILABILITY_LABEL[status],
              }))}
              hint="“Not shown” makes no claim at all on the site."
            />
            <LocalizedTextField
              name="availability.message"
              label="Message"
              maxLength={200}
              defaultValue={value.availability.message}
              errors={localizedErrors(errors, "availability.message")}
            />
          </EditorSection>

          <EditorSection id="homepage" label="Homepage" storageKey={STORAGE}>
            <p className="studio-hint">
              Sections in page order. Featured entries and the showreel are
              chosen on the{" "}
              <Link className="studio-link" to="/studio/homepage">
                Homepage
              </Link>{" "}
              screen.
            </p>
            <HomepageSectionsFields
              homepage={value.homepage}
              errors={(field) => errorFor(errors, field)}
            />
          </EditorSection>

          <EditorSection
            id="service-pages"
            label="Service pages"
            storageKey={STORAGE}
          >
            {value.serviceAreas.map((area, index) => (
              <fieldset className="studio-settings-group" key={area.key}>
                <legend className="studio-section-label">
                  {AREA_LABEL[area.key] ?? area.key} area
                </legend>
                <input
                  type="hidden"
                  name={`serviceAreas.${index}.key`}
                  value={area.key}
                />
                <LocalizedTextField
                  name={`serviceAreas.${index}.name`}
                  label="Name"
                  maxLength={120}
                  defaultValue={area.name}
                />
                <LocalizedTextArea
                  name={`serviceAreas.${index}.summary`}
                  label="Summary"
                  rows={2}
                  maxLength={400}
                  defaultValue={area.summary}
                />
                <LocalizedTextField
                  name={`serviceAreas.${index}.linkLabel`}
                  label="Link label"
                  maxLength={120}
                  defaultValue={area.linkLabel}
                />
              </fieldset>
            ))}
            <ListEditor
              name="servicesPage.process"
              label="Services page: process steps"
              items={value.servicesPage.process}
              create={() => ({ title: blank() })}
              addLabel="Add step"
              max={8}
              itemLabel={(index) => `step ${index + 1}`}
              renderItem={(item, index) => (
                <LocalizedTextField
                  name={`servicesPage.process.${index}.title`}
                  label={`Step ${index + 1}`}
                  maxLength={120}
                  defaultValue={item.title}
                />
              )}
            />
            <ListEditor
              name="softwarePage.engagementModels"
              label="Software page: ways to work together"
              items={value.softwarePage.engagementModels}
              create={() => ({
                key: `model-${Date.now().toString(36)}`,
                label: "",
                title: blank(),
                description: blank(),
                priceNote: blank(),
              })}
              addLabel="Add engagement model"
              max={6}
              itemLabel={(index) => `model ${index + 1}`}
              renderItem={(item, index) => (
                <>
                  <input
                    type="hidden"
                    name={`softwarePage.engagementModels.${index}.key`}
                    value={item.key}
                  />
                  <TextInput
                    name={`softwarePage.engagementModels.${index}.label`}
                    label="Short label"
                    maxLength={40}
                    defaultValue={item.label}
                    className="studio-settings-short"
                  />
                  <LocalizedTextField
                    name={`softwarePage.engagementModels.${index}.title`}
                    label="Title"
                    maxLength={120}
                    defaultValue={item.title}
                  />
                  <LocalizedTextArea
                    name={`softwarePage.engagementModels.${index}.description`}
                    label="Description"
                    rows={2}
                    maxLength={600}
                    defaultValue={item.description}
                  />
                  <LocalizedTextField
                    name={`softwarePage.engagementModels.${index}.priceNote`}
                    label="Price note"
                    hint="Words only, for example “Quoted per project”."
                    maxLength={120}
                    defaultValue={item.priceNote}
                  />
                </>
              )}
            />
            <ListEditor
              name="softwarePage.process"
              label="Software page: process steps"
              items={value.softwarePage.process}
              create={() => ({ title: blank() })}
              addLabel="Add step"
              max={8}
              itemLabel={(index) => `step ${index + 1}`}
              renderItem={(item, index) => (
                <LocalizedTextField
                  name={`softwarePage.process.${index}.title`}
                  label={`Step ${index + 1}`}
                  maxLength={120}
                  defaultValue={item.title}
                />
              )}
            />
            <LocalizedTextField
              name="softwarePage.inquiry.subject"
              label="Software inquiry email subject"
              maxLength={200}
              defaultValue={value.softwarePage.inquiry.subject}
            />
            <ListEditor
              name="softwarePage.inquiry.include"
              label="What to include in an inquiry"
              items={value.softwarePage.inquiry.include}
              create={blank}
              addLabel="Add point"
              max={10}
              itemLabel={(index) => `point ${index + 1}`}
              renderItem={(item, index) => (
                <LocalizedTextField
                  name={`softwarePage.inquiry.include.${index}`}
                  label={`Point ${index + 1}`}
                  maxLength={200}
                  defaultValue={item}
                />
              )}
            />
          </EditorSection>
        </>
      )}
    </SettingsEditor>
  );
}
