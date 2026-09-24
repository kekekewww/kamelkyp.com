/**
 * Quick create for writing: title, platform, the link for external posts and
 * the date, then the full editor. Drafts save with anything missing and are
 * never public.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useActionData, useNavigation } from "react-router";
import type { WritingPlatform } from "../../../lib/cms/schemas/writing";
import type { ValidationIssue } from "../../../lib/cms/types";
import { issueFieldError } from "../recognition/kit/editorial";
import { StudioPage } from "../shell/studio-page";
import {
  DateInput,
  IntentButton,
  LocalizedTextField,
  SegmentedControl,
  StudioForm,
  TextInput,
} from "../ui";
import { PLATFORM_OPTIONS, PLATFORM_URL_HINT } from "./writing-form";

type CreateError = { ok: false; message: string; issues?: ValidationIssue[] };

export function WritingNew() {
  const result = useActionData() as CreateError | undefined;
  const navigation = useNavigation();
  const [platform, setPlatform] = useState<WritingPlatform>("internal");
  const formRef = useRef<HTMLFormElement>(null);

  // Today in the owner's own time zone (the server does not know it).
  useEffect(() => {
    const date = formRef.current?.elements.namedItem("date");
    if (date instanceof HTMLInputElement && !date.value) {
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      date.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  }, []);
  const issues = result?.issues ?? [];
  const creating =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "create";

  return (
    <StudioPage
      title="New writing"
      breadcrumb={<Link to="/studio/writing">Writing</Link>}
      width="narrow"
    >
      <StudioForm className="p3-new" noValidate ref={formRef}>
        {result && !result.ok ? (
          <p className="p3-banner p3-banner--error" role="alert">
            {result.message}
          </p>
        ) : null}
        <LocalizedTextField
          name="title"
          label="Title"
          maxLength={200}
          hint="The address is made from the English title; you can change it in the editor."
          errors={{
            zh: issueFieldError(issues, "title", "zh"),
            en: issueFieldError(issues, "title", "en"),
          }}
        />
        <div className="studio-field">
          <span className="studio-field__label" aria-hidden="true">
            Platform
          </span>
          <SegmentedControl
            name="platform"
            legend="Platform"
            value={platform}
            options={PLATFORM_OPTIONS}
            onChange={(value) => setPlatform(value as WritingPlatform)}
          />
          <p className="studio-hint">
            {platform === "internal"
              ? "Written here: it becomes an article page on this site."
              : "Published elsewhere: it becomes a card that links to the original post."}
          </p>
        </div>
        {platform === "other" ? (
          <TextInput
            name="platformLabel"
            label="Platform name"
            maxLength={60}
            placeholder="e.g. Substack"
          />
        ) : null}
        {platform !== "internal" ? (
          <TextInput
            name="externalUrl"
            label="Link to the original post"
            type="url"
            inputMode="url"
            placeholder={PLATFORM_URL_HINT[platform]}
            error={issueFieldError(issues, "externalUrl")}
          />
        ) : null}
        <DateInput
          name="date"
          label="Date"
          error={issueFieldError(issues, "date")}
        />
        <div className="p3-new__actions">
          <IntentButton
            intent="create"
            variant="primary"
            pending={creating}
            pendingLabel="Creating…"
          >
            Create draft
          </IntentButton>
          <Link className="studio-link" to="/studio/writing">
            Cancel
          </Link>
        </div>
      </StudioForm>
    </StudioPage>
  );
}
