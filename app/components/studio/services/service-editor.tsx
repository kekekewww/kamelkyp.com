/**
 * Service editor (admin-architecture §4.4 "Service", §4.5–4.7).
 * BASIC · PRICING · DETAILS · PUBLICATION, with a preview column from
 * 1200 px. Save stores the working copy; Publish saves, then publishes.
 * Commission services keep a fixed slug, show their live price read-only and
 * can be unpublished but never archived or deleted.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import type { ServiceEditorData } from "../../../lib/cms/repositories/services.server";
import type { LocalizedText, ValidationIssue } from "../../../lib/cms/types";
import {
  type ActionData,
  BackupBanner,
  errorFor,
  fieldErrors,
  LeaveGuard,
  SaveError,
  useActionToasts,
} from "../settings/form-kit";
import { StudioPage } from "../shell/studio-page";
import {
  EditorLayout,
  EditorSection,
  IntentButton,
  ListEditor,
  LocalizedTextArea,
  LocalizedTextField,
  PreviewPane,
  PublicationPanel,
  SaveStateIndicator,
  SlugField,
  StatusBadge,
  StudioForm,
  TermSelect,
  useEditorForm,
  ValidationChecklist,
} from "../ui";
import { PriceFields } from "./price-fields";

const FORM_ID = "service-editor";

const COMMISSION_PATHS: Record<string, string> = {
  full_mix: "/mixing/full",
  vocal_mix: "/mixing/vocal",
  simple_transition: "/song-transition/simple",
  edit_transition: "/song-transition/edit",
};

const AREA_PATHS: Record<string, string> = {
  mixing: "/mixing",
  song_transition: "/song-transition",
  software: "/services/software",
};

const SECTION_OF: Array<[RegExp, string]> = [
  [/^(name|slug|groupTermId|shortDescription|description)\b/, "basic"],
  [/^(priceMode|priceAmount|currency)\b/, "pricing"],
  [
    /^(turnaround|revisions|deliverables|requirements|process|faq|inquirySubject)\b/,
    "details",
  ],
];

function sectionOf(field: string): string {
  return (
    SECTION_OF.find(([pattern]) => pattern.test(field))?.[1] ?? "publication"
  );
}

function issueCount(issues: readonly ValidationIssue[], section: string) {
  return issues.filter(
    (issue) => issue.severity === "error" && sectionOf(issue.field) === section,
  ).length;
}

function localizedErrors(
  errors: ReturnType<typeof fieldErrors>,
  field: string,
): Partial<Record<"zh" | "en", string>> | undefined {
  const entry = errors.get(field);
  if (!entry) return undefined;
  return {
    zh: entry.zh ?? entry.message,
    en: entry.en ?? entry.message,
  };
}

function title(name: LocalizedText): string {
  return name.zh.trim() || name.en.trim() || "Untitled service";
}

const STATE_WORD = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Error",
} as const;

/**
 * Sticky bar at the end of the form: Save (the button Mod+S presses) and
 * Publish. On phones it is the main way to save (admin-architecture §4.14).
 */
function FormFooter({
  state,
  canPublish,
  published,
  todo,
  pendingIntent,
}: {
  state: keyof typeof STATE_WORD;
  canPublish: boolean;
  published: boolean;
  todo: boolean;
  pendingIntent: string | null;
}) {
  return (
    <div className="studio-kit-footer" data-state={state}>
      <span className="studio-kit-footer__state" aria-hidden="true">
        {STATE_WORD[state]}
      </span>
      <IntentButton
        intent="save"
        variant={canPublish ? "secondary" : "primary"}
        compact
        pending={pendingIntent === "save"}
        pendingLabel="Saving…"
      >
        Save
      </IntentButton>
      {canPublish ? (
        <IntentButton
          intent="publish"
          variant="primary"
          compact
          disabled={todo}
          pending={pendingIntent === "publish"}
          pendingLabel="Publishing…"
        >
          {published ? "Publish changes" : "Publish"}
        </IntentButton>
      ) : null}
    </div>
  );
}

export function ServiceEditor({ data }: { data: ServiceEditorData }) {
  const { meta, content, issues, groups, livePrice } = data;
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const editor = useEditorForm({
    type: "service",
    id: meta.id,
    updatedAt: meta.updatedAt,
    fetcher,
  });
  useActionToasts(fetcher);
  const [formKey, setFormKey] = useState(0);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const saveAndLeaveTarget = useRef<string | null>(null);

  const result = fetcher.state === "idle" ? fetcher.data : null;
  const errors = fieldErrors(result?.issues);
  const linked = Boolean(meta.commissionServiceId);
  const pendingIntent =
    fetcher.state !== "idle"
      ? (fetcher.formData?.get("intent") as string | null)
      : null;

  // After a settled action: remount the form on revert, and schedule the
  // navigation a delete, duplicate or "Save and leave" asks for.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const settled = fetcher.data;
    if (settled.ok && settled.reverted) setFormKey((key) => key + 1);
    if (settled.ok && settled.redirectTo) {
      setLeaveTo(settled.redirectTo);
    } else if (saveAndLeaveTarget.current) {
      if (settled.ok) setLeaveTo(saveAndLeaveTarget.current);
      saveAndLeaveTarget.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  // Navigate only once the form is clean, so the unsaved-changes guard
  // does not stop a navigation the owner asked for.
  useEffect(() => {
    if (leaveTo && !editor.dirty) {
      setLeaveTo(null);
      navigate(leaveTo);
    }
  }, [leaveTo, editor.dirty, navigate]);

  const area = groups.find((group) => group.id === content.groupTermId)?.data
    .area;
  const livePath = meta.commissionServiceId
    ? COMMISSION_PATHS[meta.commissionServiceId]
    : typeof area === "string"
      ? AREA_PATHS[area]
      : undefined;
  const previewPath = `/studio/preview/services/${meta.id}`;

  const sections = [
    { id: "basic", label: "Basic", issues: issueCount(issues, "basic") },
    { id: "pricing", label: "Pricing", issues: issueCount(issues, "pricing") },
    { id: "details", label: "Details", issues: issueCount(issues, "details") },
    {
      id: "publication",
      label: "Publication",
      issues: issueCount(issues, "publication"),
    },
  ];
  const storageKey = "studio:sections:service";
  const canPublish =
    meta.status !== "archived" &&
    (meta.status === "draft" || meta.hasUnpublishedChanges);

  return (
    <StudioPage
      title={title(content.name)}
      breadcrumb={<Link to="/studio/services">Services</Link>}
      status={
        <>
          <StatusBadge status={meta.status} />
          <SaveStateIndicator state={editor.state} />
        </>
      }
      actions={
        <>
          <a
            className="studio-btn studio-btn--ghost studio-btn--compact"
            href={`${previewPath}?locale=zh`}
            target="_blank"
            rel="noopener"
          >
            Preview
          </a>
          <IntentButton
            intent="save"
            form={FORM_ID}
            variant={canPublish ? "secondary" : "primary"}
            compact
            pending={pendingIntent === "save"}
            pendingLabel="Saving…"
          >
            Save
          </IntentButton>
          {canPublish ? (
            <IntentButton
              intent="publish"
              form={FORM_ID}
              variant="primary"
              compact
              disabled={meta.todoContent}
              pending={pendingIntent === "publish"}
              pendingLabel="Publishing…"
            >
              {meta.status === "published" ? "Publish changes" : "Publish"}
            </IntentButton>
          ) : null}
        </>
      }
    >
      <SaveError
        message={editor.state.kind === "error" ? editor.state.message : null}
      />
      {editor.backup ? (
        <BackupBanner
          savedAt={editor.backup.savedAt}
          onRestore={editor.restoreBackup}
          onDiscard={editor.discardBackup}
        />
      ) : null}
      <EditorLayout
        sections={sections}
        preview={
          <PreviewPane
            src={previewPath}
            title={`Preview of ${title(content.name)}`}
            reloadKey={meta.revision}
          />
        }
      >
        <StudioForm
          key={formKey}
          id={FORM_ID}
          fetcher={fetcher}
          ref={editor.formRef}
          onInput={editor.onInput}
          onChange={editor.onInput}
          className="studio-service-form"
          aria-label="Service"
        >
          <input
            type="hidden"
            name="expectedRevision"
            value={String(meta.revision)}
          />
          <EditorSection
            id="basic"
            label="Basic"
            defaultOpen
            storageKey={storageKey}
          >
            <LocalizedTextField
              name="name"
              label="Name"
              required
              sameInBoth
              maxLength={200}
              defaultValue={content.name}
              errors={localizedErrors(errors, "name")}
            />
            <SlugField
              entityType="service"
              prefix="/services/"
              defaultValue={content.slug}
              entityId={meta.id}
              titleField="name.en"
              published={Boolean(meta.publishedSlug)}
              publishedSlug={meta.publishedSlug}
              locked={linked}
              error={errorFor(errors, "slug")}
            />
            <TermSelect
              name="groupTermId"
              label="Group"
              terms={groups}
              defaultValue={content.groupTermId}
              required
              placeholder="Choose a group"
              hint="Groups are managed in Settings → Taxonomies."
              error={errorFor(errors, "groupTermId")}
            />
            <LocalizedTextArea
              name="shortDescription"
              label="Short description"
              rows={2}
              maxLength={280}
              defaultValue={content.shortDescription}
              errors={localizedErrors(errors, "shortDescription")}
            />
            <LocalizedTextArea
              name="description"
              label="Description"
              required
              rows={6}
              maxLength={4000}
              hint="Blank lines start new paragraphs; lines starting with “- ” become a list."
              defaultValue={content.description}
              errors={localizedErrors(errors, "description")}
            />
          </EditorSection>

          <EditorSection
            id="pricing"
            label="Pricing"
            defaultOpen
            storageKey={storageKey}
          >
            <PriceFields
              commissionLinked={linked}
              livePrice={livePrice}
              defaultMode={content.priceMode}
              defaultAmount={content.priceAmount}
              defaultCurrency={content.currency}
              errors={{
                priceMode: errorFor(errors, "priceMode"),
                priceAmount: errorFor(errors, "priceAmount"),
                currency: errorFor(errors, "currency"),
              }}
            />
          </EditorSection>

          <EditorSection id="details" label="Details" storageKey={storageKey}>
            <div className="studio-service-form__pair">
              <LocalizedTextField
                name="turnaround"
                label="Turnaround"
                maxLength={200}
                defaultValue={content.turnaround}
              />
              <LocalizedTextField
                name="revisions"
                label="Revisions"
                maxLength={200}
                defaultValue={content.revisions}
              />
            </div>
            <ListEditor
              name="deliverables"
              label="Deliverables"
              items={content.deliverables}
              create={() => ({ zh: "", en: "" })}
              addLabel="Add deliverable"
              max={30}
              itemLabel={(index) => `deliverable ${index + 1}`}
              renderItem={(item, index) => (
                <LocalizedTextField
                  name={`deliverables.${index}`}
                  label={`Deliverable ${index + 1}`}
                  maxLength={300}
                  defaultValue={item}
                />
              )}
            />
            <ListEditor
              name="requirements"
              label="What you need from the client"
              items={content.requirements}
              create={() => ({ zh: "", en: "" })}
              addLabel="Add requirement"
              max={30}
              itemLabel={(index) => `requirement ${index + 1}`}
              renderItem={(item, index) => (
                <LocalizedTextField
                  name={`requirements.${index}`}
                  label={`Requirement ${index + 1}`}
                  maxLength={300}
                  defaultValue={item}
                />
              )}
            />
            <ListEditor
              name="process"
              label="Process"
              items={content.process}
              create={() => ({
                title: { zh: "", en: "" },
                body: { zh: "", en: "" },
              })}
              addLabel="Add step"
              max={12}
              itemLabel={(index) => `step ${index + 1}`}
              renderItem={(item, index) => (
                <>
                  <LocalizedTextField
                    name={`process.${index}.title`}
                    label={`Step ${index + 1}`}
                    maxLength={200}
                    defaultValue={item.title}
                  />
                  <LocalizedTextArea
                    name={`process.${index}.body`}
                    label="What happens"
                    rows={2}
                    maxLength={1000}
                    defaultValue={item.body}
                  />
                </>
              )}
            />
            <ListEditor
              name="faq"
              label="FAQ"
              items={content.faq}
              create={() => ({
                question: { zh: "", en: "" },
                answer: { zh: "", en: "" },
              })}
              addLabel="Add question"
              max={30}
              itemLabel={(index) => `question ${index + 1}`}
              renderItem={(item, index) => (
                <>
                  <LocalizedTextField
                    name={`faq.${index}.question`}
                    label={`Question ${index + 1}`}
                    required
                    maxLength={300}
                    defaultValue={item.question}
                    errors={localizedErrors(errors, `faq.${index}.question`)}
                  />
                  <LocalizedTextArea
                    name={`faq.${index}.answer`}
                    label="Answer"
                    required
                    rows={3}
                    maxLength={2000}
                    defaultValue={item.answer}
                    errors={localizedErrors(errors, `faq.${index}.answer`)}
                  />
                </>
              )}
            />
            <LocalizedTextField
              name="inquirySubject"
              label="Inquiry email subject"
              hint="Used for the email link on custom quote and contact services."
              maxLength={200}
              defaultValue={content.inquirySubject}
            />
          </EditorSection>

          <EditorSection
            id="publication"
            label="Publication"
            defaultOpen
            storageKey={storageKey}
          >
            <PublicationPanel
              meta={meta}
              issues={issues}
              liveUrls={
                livePath ? { zh: `/zh${livePath}`, en: `/en${livePath}` } : null
              }
              previewUrl={`${previewPath}?locale=zh`}
              pendingIntent={pendingIntent}
            />
            <ValidationChecklist issues={issues} />
            {meta.status !== "archived" ? (
              <div className="studio-service-form__highlight">
                <p className="studio-hint">
                  {meta.featured
                    ? "Highlighted in the homepage services section (once published)."
                    : "Not highlighted on the homepage."}
                </p>
                <IntentButton
                  intent={meta.featured ? "unfeature" : "feature"}
                  variant="ghost"
                  compact
                >
                  {meta.featured
                    ? "Remove homepage highlight"
                    : "Highlight on homepage"}
                </IntentButton>
              </div>
            ) : null}
          </EditorSection>
          <FormFooter
            state={editor.state.kind}
            canPublish={canPublish}
            published={meta.status === "published"}
            todo={meta.todoContent}
            pendingIntent={pendingIntent}
          />
        </StudioForm>
      </EditorLayout>
      <LeaveGuard
        blocker={editor.blocker}
        onSaveAndLeave={() => {
          const form = editor.formRef.current;
          const button = form?.querySelector<HTMLButtonElement>(
            'button[name="intent"][value="save"]',
          );
          if (editor.blocker.state === "blocked") {
            const { pathname, search, hash } = editor.blocker.location;
            saveAndLeaveTarget.current = `${pathname}${search}${hash}`;
            editor.blocker.reset();
          }
          form?.requestSubmit(button ?? undefined);
        }}
      />
    </StudioPage>
  );
}
