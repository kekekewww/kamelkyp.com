/**
 * Brand settings (brief §16, content-schema §2.9, admin §4.4 "Brand settings").
 * IDENTITY · HERO · ABOUT · CAPABILITIES · CONTACT · ASSETS · REVIEW.
 * The public identity is Kamel only: the server refuses personal-name
 * variants in any public text. The contact address is the one exception the
 * guard allows; when it contains a personal name the screen says so and
 * suggests a kamelkyp.com address, but it never changes the value itself.
 */
import { useState } from "react";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { BrandSettings } from "../../../lib/cms/schemas/brand-settings";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type { SettingsWithMeta } from "../../../lib/cms/settings-write.server";
import {
  EditorSection,
  IntentButton,
  ListEditor,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  Switch,
  TermMultiSelect,
  TextInput,
} from "../ui";
import { errorFor, type FieldErrors } from "./form-kit";
import { isoDay, localizedErrors, SettingsEditor } from "./settings-editor";

const FORM_ID = "brand-settings";
const STORAGE = "studio:sections:brand";

const SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "hero", label: "Hero" },
  { id: "about", label: "About" },
  { id: "capabilities", label: "Capabilities" },
  { id: "contact", label: "Contact" },
  { id: "assets", label: "Assets" },
  { id: "review", label: "Review" },
] as const;

const SECTION_FIELDS: Record<string, RegExp> = {
  identity: /^(brandName|tagline|roles|locationDisplay)\b/,
  hero: /^(heroStatement|heroSubtext|primaryCta|secondaryCta)\b/,
  about: /^(shortBio|longBio|aboutSections)\b/,
  capabilities: /^capabilities\b/,
  contact: /^contactEmail\b/,
  assets: /^(portraitId|logoId|faviconId|brandAssetIds)\b/,
};

let keyCounter = 0;
function newKey(prefix: string) {
  keyCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${keyCounter}`;
}

const blank = () => ({ zh: "", en: "" });

export function CtaFields({
  name,
  label,
  value,
  errors,
}: {
  name: "primaryCta" | "secondaryCta";
  label: string;
  value: BrandSettings["primaryCta"];
  errors: FieldErrors;
}) {
  return (
    <div className="studio-settings-cta">
      <LocalizedTextField
        name={`${name}.label`}
        label={`${label} label`}
        maxLength={60}
        defaultValue={value.label}
        errors={localizedErrors(errors, `${name}.label`)}
      />
      <TextInput
        name={`${name}.href`}
        label={`${label} link`}
        defaultValue={value.href}
        hint="A site path such as /commission (the language is added for you) or an https:// address."
        error={errorFor(errors, `${name}.href`)}
      />
    </div>
  );
}

export function SecondaryCta({
  value,
  errors,
}: {
  value: BrandSettings["secondaryCta"];
  errors: FieldErrors;
}) {
  const [enabled, setEnabled] = useState(value !== null);
  return (
    <div className="studio-settings-group">
      <Switch
        name="secondaryCtaEnabled"
        label="Show a second button"
        checked={enabled}
        onChange={(event) => setEnabled(event.currentTarget.checked)}
      />
      {enabled ? (
        <CtaFields
          name="secondaryCta"
          label="Second button"
          value={value ?? { label: blank(), href: "/works" }}
          errors={errors}
        />
      ) : null}
    </div>
  );
}

export function BrandSettingsForm({
  brand,
  contactNeedsReview,
  assets,
  categories,
}: {
  brand: SettingsWithMeta<BrandSettings>;
  contactNeedsReview: boolean;
  assets: Record<string, MediaSummary>;
  categories: Term[];
}) {
  const value = brand.value;
  const asset = (id: string | null) => (id ? (assets[id] ?? null) : null);

  return (
    <SettingsEditor
      title="Brand"
      formId={FORM_ID}
      backupType="brand-settings"
      revision={brand.revision}
      updatedAt={brand.updatedAt}
      sections={SECTIONS}
      sectionOf={(field) =>
        Object.keys(SECTION_FIELDS).find((section) =>
          SECTION_FIELDS[section]?.test(field),
        ) ?? null
      }
    >
      {({ errors, pendingIntent }) => {
        return (
          <>
            <EditorSection
              id="identity"
              label="Identity"
              defaultOpen
              storageKey={STORAGE}
            >
              <TextInput
                name="brandName"
                label="Brand name"
                defaultValue={value.brandName}
                maxLength={40}
                hint="The only public identity. Personal names are refused on save."
                error={errorFor(errors, "brandName")}
              />
              <LocalizedTextField
                name="tagline"
                label="Tagline"
                maxLength={200}
                defaultValue={value.tagline}
                errors={localizedErrors(errors, "tagline")}
              />
              <ListEditor
                name="roles"
                label="Roles (hero)"
                items={value.roles}
                create={blank}
                addLabel="Add role"
                max={6}
                itemLabel={(index) => `role ${index + 1}`}
                renderItem={(item, index) => (
                  <LocalizedTextField
                    name={`roles.${index}`}
                    label={`Role ${index + 1}`}
                    maxLength={80}
                    defaultValue={item}
                    errors={localizedErrors(errors, `roles.${index}`)}
                  />
                )}
              />
              <LocalizedTextField
                name="locationDisplay"
                label="Location line"
                hint="Shown in the footer."
                maxLength={120}
                defaultValue={value.locationDisplay}
                errors={localizedErrors(errors, "locationDisplay")}
              />
            </EditorSection>

            <EditorSection id="hero" label="Hero" storageKey={STORAGE}>
              <LocalizedTextArea
                name="heroStatement"
                label="Statement"
                rows={2}
                maxLength={300}
                defaultValue={value.heroStatement}
                errors={localizedErrors(errors, "heroStatement")}
              />
              <LocalizedTextArea
                name="heroSubtext"
                label="Subtext"
                rows={2}
                maxLength={600}
                defaultValue={value.heroSubtext}
                errors={localizedErrors(errors, "heroSubtext")}
              />
              <CtaFields
                name="primaryCta"
                label="Main button"
                value={value.primaryCta}
                errors={errors}
              />
              <SecondaryCta value={value.secondaryCta} errors={errors} />
            </EditorSection>

            <EditorSection id="about" label="About" storageKey={STORAGE}>
              <LocalizedTextArea
                name="shortBio"
                label="Short bio"
                hint="The About teaser on the homepage."
                rows={3}
                maxLength={2000}
                defaultValue={value.shortBio}
                errors={localizedErrors(errors, "shortBio")}
              />
              <LocalizedTextArea
                name="longBio"
                label="Long bio"
                hint="The opening paragraph of the About page."
                rows={5}
                maxLength={4000}
                defaultValue={value.longBio}
                errors={localizedErrors(errors, "longBio")}
              />
              <ListEditor
                name="aboutSections"
                label="About page sections"
                items={value.aboutSections}
                create={() => ({
                  key: newKey("about"),
                  heading: blank(),
                  body: blank(),
                })}
                addLabel="Add section"
                max={8}
                itemLabel={(index) => `section ${index + 1}`}
                renderItem={(item, index) => (
                  <>
                    <input
                      type="hidden"
                      name={`aboutSections.${index}.key`}
                      value={item.key}
                    />
                    <LocalizedTextField
                      name={`aboutSections.${index}.heading`}
                      label={`Section ${index + 1} heading`}
                      maxLength={120}
                      defaultValue={item.heading}
                    />
                    <LocalizedTextArea
                      name={`aboutSections.${index}.body`}
                      label="Body"
                      hint="Lines starting with “- ” become a list."
                      rows={4}
                      maxLength={6000}
                      defaultValue={item.body}
                    />
                  </>
                )}
              />
            </EditorSection>

            <EditorSection
              id="capabilities"
              label="Capabilities"
              storageKey={STORAGE}
            >
              <p className="studio-hint">
                Shown on the homepage and the About page. Each capability lists
                three to five items.
              </p>
              <ListEditor
                name="capabilities"
                label="Capabilities"
                items={value.capabilities}
                create={() => ({
                  key: newKey("capability"),
                  index: "",
                  title: blank(),
                  description: blank(),
                  items: [blank(), blank(), blank()],
                  categoryIds: [],
                })}
                addLabel="Add capability"
                max={6}
                itemLabel={(index) => `capability ${index + 1}`}
                renderItem={(item, index) => (
                  <>
                    <input
                      type="hidden"
                      name={`capabilities.${index}.key`}
                      value={item.key}
                    />
                    <TextInput
                      name={`capabilities.${index}.index`}
                      label="Number"
                      maxLength={4}
                      defaultValue={item.index}
                      className="studio-settings-short"
                    />
                    <LocalizedTextField
                      name={`capabilities.${index}.title`}
                      label={`Capability ${index + 1}`}
                      maxLength={120}
                      defaultValue={item.title}
                    />
                    <LocalizedTextArea
                      name={`capabilities.${index}.description`}
                      label="Description"
                      rows={2}
                      maxLength={600}
                      defaultValue={item.description}
                    />
                    <ListEditor
                      name={`capabilities.${index}.items`}
                      label="Items"
                      items={item.items}
                      create={blank}
                      addLabel="Add item"
                      max={5}
                      itemLabel={(row) => `item ${row + 1}`}
                      renderItem={(entry, row) => (
                        <LocalizedTextField
                          name={`capabilities.${index}.items.${row}`}
                          label={`Item ${row + 1}`}
                          maxLength={120}
                          defaultValue={entry}
                        />
                      )}
                    />
                    {errorFor(errors, `capabilities.${index}.items`) ? (
                      <p className="studio-field__error" role="alert">
                        {errorFor(errors, `capabilities.${index}.items`)}
                      </p>
                    ) : null}
                    <TermMultiSelect
                      name={`capabilities.${index}.categoryIds`}
                      label="Related project categories"
                      terms={categories}
                      defaultValue={item.categoryIds}
                    />
                  </>
                )}
              />
            </EditorSection>

            <EditorSection
              id="contact"
              label="Contact"
              defaultOpen
              storageKey={STORAGE}
            >
              <div id="contact" className="studio-settings-anchor" />
              <TextInput
                name="contactEmail"
                label="Contact email"
                type="email"
                autoComplete="off"
                defaultValue={value.contactEmail}
                hint="Shown on contact sections and used for inquiry links."
                error={errorFor(errors, "contactEmail")}
              />
              {contactNeedsReview ? (
                <div className="studio-settings-note" role="note">
                  <p>
                    This address contains a personal name, and the public brand
                    is Kamel only. Consider an address at kamelkyp.com instead
                    (for example hello@kamelkyp.com, set up with Cloudflare
                    Email Routing).
                  </p>
                  <p>
                    This is a suggestion only: the address stays exactly as it
                    is until you change it here.
                  </p>
                </div>
              ) : null}
              {value.contactEmailConfirmedAt ? (
                <p className="studio-settings-stamp">
                  Confirmed {isoDay(value.contactEmailConfirmedAt)}
                </p>
              ) : (
                <div className="studio-settings-group">
                  <p className="studio-hint">
                    Confirming keeps the address as it is and clears the
                    reminder on the Studio home. Any other edits on this page
                    are saved at the same time.
                  </p>
                  <IntentButton
                    intent="confirm-contact-email"
                    variant="secondary"
                    compact
                    pending={pendingIntent === "confirm-contact-email"}
                    pendingLabel="Confirming…"
                  >
                    Confirm this address
                  </IntentButton>
                </div>
              )}
            </EditorSection>

            <EditorSection id="assets" label="Assets" storageKey={STORAGE}>
              <MediaField
                name="portraitId"
                label="Portrait"
                kind="image"
                value={asset(value.portraitId)}
                error={errorFor(errors, "portraitId")}
              />
              <MediaField
                name="logoId"
                label="Logo"
                kind="image"
                value={asset(value.logoId)}
                error={errorFor(errors, "logoId")}
              />
              <MediaField
                name="faviconId"
                label="Favicon"
                kind="image"
                hint="A square PNG."
                value={asset(value.faviconId)}
                error={errorFor(errors, "faviconId")}
              />
              <ListEditor
                name="brandAssetIds"
                label="Other brand assets"
                items={value.brandAssetIds
                  .map((id) => asset(id))
                  .filter((item): item is MediaSummary => item !== null)}
                create={() => null as MediaSummary | null}
                addLabel="Add asset"
                max={20}
                itemLabel={(index) => `asset ${index + 1}`}
                renderItem={(item, index) => (
                  <MediaField
                    name={`brandAssetIds.${index}`}
                    label={`Asset ${index + 1}`}
                    kind="image"
                    value={item}
                  />
                )}
              />
            </EditorSection>

            <EditorSection
              id="review"
              label="Review"
              defaultOpen
              storageKey={STORAGE}
            >
              <div id="review" className="studio-settings-anchor" />
              {value.redesignCopyAcknowledgedAt ? (
                <p className="studio-settings-stamp">
                  Copy reviewed {isoDay(value.redesignCopyAcknowledgedAt)}
                </p>
              ) : (
                <div className="studio-settings-group">
                  <p>
                    Text carried over from the redesign went live as written:
                    the About page, capabilities, hero roles and statement, the
                    software services and the service area blurbs. Read it on
                    the live site, edit anything here or in Services, then mark
                    it as reviewed.
                  </p>
                  <p className="studio-settings-links">
                    <a
                      className="studio-link"
                      href="/zh/about"
                      target="_blank"
                      rel="noopener"
                    >
                      About (ZH)
                    </a>
                    <a
                      className="studio-link"
                      href="/en/about"
                      target="_blank"
                      rel="noopener"
                    >
                      About (EN)
                    </a>
                    <a
                      className="studio-link"
                      href="/en/services/software"
                      target="_blank"
                      rel="noopener"
                    >
                      Software services
                    </a>
                  </p>
                  <IntentButton
                    intent="acknowledge-redesign-copy"
                    variant="secondary"
                    compact
                    pending={pendingIntent === "acknowledge-redesign-copy"}
                    pendingLabel="Saving…"
                  >
                    Mark copy as reviewed
                  </IntentButton>
                </div>
              )}
            </EditorSection>
          </>
        );
      }}
    </SettingsEditor>
  );
}
