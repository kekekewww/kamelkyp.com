/**
 * One clause row of the term editor (wp2 §4.5): a stable key used for
 * anchors, a title and plain text. Inputs carry the document's language.
 */
import type { TermDraftClause } from "../../../lib/cms/schemas/term-draft";
import { TERM_LIMITS } from "../../../lib/cms/schemas/term-draft";
import type { Locale } from "../../../lib/cms/types";
import { errorFor, type FieldErrors } from "../settings/form-kit";
import { TextArea, TextInput } from "../ui";

export function ClauseFields({
  clause,
  index,
  locale,
  field,
  errors,
}: {
  clause: TermDraftClause;
  index: number;
  locale: Locale;
  field: (key: string) => string;
  errors: FieldErrors;
}) {
  const lang = locale === "zh" ? "zh-Hant" : "en";
  return (
    <fieldset className="studio-clause">
      <legend className="studio-clause__legend">Clause {index + 1}</legend>
      <TextInput
        name={field("key")}
        label="Key"
        className="studio-clause__key"
        defaultValue={clause.key}
        maxLength={TERM_LIMITS.key}
        autoComplete="off"
        spellCheck={false}
        hint="Stable id for links, e.g. deposit. Keep the same key in ZH and EN."
        error={errorFor(errors, `clauses.${index}.key`)}
      />
      <TextInput
        name={field("title")}
        label="Title"
        lang={lang}
        defaultValue={clause.title}
        maxLength={TERM_LIMITS.title}
        error={errorFor(errors, `clauses.${index}.title`)}
      />
      <TextArea
        name={field("text")}
        label="Text"
        lang={lang}
        rows={5}
        defaultValue={clause.text}
        maxLength={TERM_LIMITS.text}
        hint="Plain text: the page shows one paragraph per clause, so line breaks are not kept."
        error={errorFor(errors, `clauses.${index}.text`)}
      />
    </fieldset>
  );
}
