/**
 * One footer group's editor (wp3 spec §4.5): bilingual group label for every
 * group; built-in groups show where their links come from (read-only), custom
 * groups edit their links (bilingual labels, one address, shown or not).
 * Keyed by the group's fingerprint and its count of successful saves, so
 * every save (even one that normalizes to the stored values) and "Reload
 * latest" remount it with the stored, normalized values. A failed save keeps
 * the editor: each link error stays with its link when links move.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type FetcherWithComponents, Link, useRevalidator } from "react-router";
import {
  type FooterSystemKey,
  isFooterSystemKey,
  systemGroupLinks,
} from "../../../lib/cms/public/footer";
import {
  FOOTER_LIMITS,
  type FooterScreenSources,
  type StudioFooterGroup,
  type StudioFooterLink,
} from "../../../lib/cms/schemas/footer";
import type { Locale, ValidationIssue } from "../../../lib/cms/types";
import {
  ListEditor,
  LocalizedTextField,
  StudioForm,
  serializeForm,
} from "../ui";
import {
  defaultLabelHint,
  FOOTER_SOURCE_NOTES,
  footerGroupName,
  placeLinkIssues,
} from "./footer-model";

let newLinkCount = 0;
/** Client key of an added link (stored links use their first row id). */
const newLinkKey = () => {
  newLinkCount += 1;
  return `new:${newLinkCount}`;
};

export type FooterFailure = {
  ok: false;
  code: string;
  message: string;
  issues?: ValidationIssue[];
};

function issueFor(
  issues: readonly ValidationIssue[] | undefined,
  field: string,
  locale?: Locale,
): string | undefined {
  return issues?.find(
    (issue) =>
      issue.field === field && (locale ? issue.locale === locale : true),
  )?.message;
}

function localeErrors(
  issues: readonly ValidationIssue[] | undefined,
  field: string,
): Partial<Record<Locale, string>> | undefined {
  const zh = issueFor(issues, field, "zh");
  const en = issueFor(issues, field, "en");
  return zh || en
    ? { ...(zh ? { zh } : {}), ...(en ? { en } : {}) }
    : undefined;
}

/** The links a built-in group will show, in both languages (read-only). */
function DerivedLinks({
  groupKey,
  sources,
}: {
  groupKey: FooterSystemKey;
  sources: FooterScreenSources;
}) {
  const lists = (["zh", "en"] as const).map((locale) => ({
    locale,
    links: systemGroupLinks(groupKey, {
      locale,
      navigation: sources.navigation,
      serviceAreas: sources.serviceAreas,
      socialLinks: sources.socialLinks.flatMap((link) =>
        link.label[locale].trim()
          ? [{ id: link.id, label: link.label[locale].trim(), url: link.url }]
          : [],
      ),
      contactEmail: sources.contactEmail,
    }),
  }));
  return (
    <div className="studio-footer__derived">
      {lists.map(({ locale, links }) => (
        <div className="studio-footer__derived-locale" key={locale}>
          <p className="studio-footer__locale-tag">{locale.toUpperCase()}</p>
          {links.length === 0 ? (
            <p className="studio-hint">No link to show.</p>
          ) : (
            <ul
              className="studio-footer__derived-list"
              lang={locale === "zh" ? "zh-Hant" : "en"}
            >
              {links.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function LinkFields({
  link,
  index,
  field,
  issues,
  idPrefix,
}: {
  link: StudioFooterLink;
  index: number;
  field: (key: string) => string;
  /** This link's issues from the last failed save (fields `label`, `url`). */
  issues?: readonly ValidationIssue[];
  /** Keeps error ids unique across group editors. */
  idPrefix: string;
}) {
  const number = index + 1;
  const zhError = issueFor(issues, "label", "zh");
  const enError = issueFor(issues, "label", "en");
  const urlError = issueFor(issues, "url");
  const errorId = (name: string) => `${idPrefix}-${field(name)}-error`;
  return (
    <div className="studio-footer__link" data-link-key={link.key}>
      <label className="studio-footer__link-cell">
        <span className="studio-footer__locale-tag">ZH</span>
        <input
          name={field("label.zh")}
          lang="zh-Hant"
          className="studio-input"
          aria-label={`Link ${number} label ZH`}
          maxLength={FOOTER_LIMITS.linkLabel}
          defaultValue={link.label.zh}
          aria-invalid={zhError ? true : undefined}
          aria-describedby={zhError ? errorId("label.zh") : undefined}
        />
        {zhError ? (
          <span
            className="studio-field__error"
            id={errorId("label.zh")}
            role="alert"
          >
            {zhError}
          </span>
        ) : null}
      </label>
      <label className="studio-footer__link-cell">
        <span className="studio-footer__locale-tag">EN</span>
        <input
          name={field("label.en")}
          lang="en"
          className="studio-input"
          aria-label={`Link ${number} label EN`}
          maxLength={FOOTER_LIMITS.linkLabel}
          defaultValue={link.label.en}
          aria-invalid={enError ? true : undefined}
          aria-describedby={enError ? errorId("label.en") : undefined}
        />
        {enError ? (
          <span
            className="studio-field__error"
            id={errorId("label.en")}
            role="alert"
          >
            {enError}
          </span>
        ) : null}
      </label>
      <label className="studio-footer__link-cell studio-footer__link-url">
        <span className="studio-footer__locale-tag">Address</span>
        <input
          name={field("url")}
          className="studio-input"
          aria-label={`Link ${number} address`}
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          placeholder="https://…, name@example.com or /works"
          defaultValue={link.url}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={urlError ? errorId("url") : undefined}
        />
        {urlError ? (
          <span
            className="studio-field__error"
            id={errorId("url")}
            role="alert"
          >
            {urlError}
          </span>
        ) : null}
      </label>
      <label className="studio-footer__link-shown">
        <input type="hidden" name={field("enabled:bool")} value="false" />
        <input
          type="checkbox"
          name={field("enabled:bool")}
          value="true"
          defaultChecked={link.enabled}
        />
        Shown
        <span className="visually-hidden">{` (link ${number})`}</span>
      </label>
      {link.notes.map((note) => (
        <p className="studio-hint studio-footer__note" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
}

export function FooterGroupEditor({
  group,
  sources,
  fetcher,
  failed,
  onDirty,
}: {
  group: StudioFooterGroup;
  sources: FooterScreenSources;
  fetcher: FetcherWithComponents<unknown>;
  /** The last failed save of this version of the group. */
  failed: FooterFailure | null;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const revalidator = useRevalidator();
  const idPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  // The links' keys in the order of the last submit: the server names link
  // errors by position (`links.1.url`), and the owner may move or remove
  // links before the answer is read or the next save.
  const submittedKeys = useRef<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const name = footerGroupName(group);
  const builtIn = isFooterSystemKey(group.key) ? group.key : null;

  const snapshot = useCallback(
    () =>
      formRef.current ? serializeForm(new FormData(formRef.current)) : null,
    [],
  );

  // A fresh editor (mount = a stored version of the group) is clean.
  useEffect(() => {
    baseline.current = snapshot();
    setDirty(false);
    onDirty(group.id, false);
    return () => onDirty(group.id, false);
  }, [snapshot, onDirty, group.id]);

  const recompute = () => {
    const next = snapshot() !== baseline.current;
    setDirty(next);
    onDirty(group.id, next);
  };

  const saving = fetcher.state !== "idle";
  const stale = failed?.code === "stale_revision";
  const state = saving
    ? "Saving…"
    : failed
      ? "Not saved"
      : dirty
        ? "Unsaved changes"
        : "Saved";
  const issues = failed?.issues;
  // Placed once per failure, from the order that failed.
  const linkIssues = useMemo(
    () => placeLinkIssues(failed?.issues, submittedKeys.current),
    [failed],
  );

  return (
    <StudioForm
      fetcher={fetcher}
      ref={formRef}
      className="studio-footer__editor"
      data-footer-group=""
      aria-label={`Group: ${name}`}
      onInput={recompute}
      onChange={recompute}
      onSubmit={(event) => {
        submittedKeys.current = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>("[data-link-key]"),
          (element) => element.dataset.linkKey ?? "",
        );
      }}
      // ListEditor add/remove/move fire no input event.
      onClick={() => requestAnimationFrame(recompute)}
      noValidate
    >
      <input type="hidden" name="id" value={group.id} />
      <input type="hidden" name="fingerprint" value={group.fingerprint} />
      <LocalizedTextField
        name="label"
        label="Group label"
        maxLength={FOOTER_LIMITS.groupLabel}
        defaultValue={group.label}
        errors={localeErrors(issues, "label")}
        hint={`Required in ZH and EN.${defaultLabelHint(group.key)}`}
      />
      {builtIn ? (
        <div className="studio-footer__source">
          <p className="studio-hint">
            {FOOTER_SOURCE_NOTES[builtIn].text}{" "}
            <Link
              className="studio-link"
              to={FOOTER_SOURCE_NOTES[builtIn].href}
            >
              {FOOTER_SOURCE_NOTES[builtIn].linkLabel}
            </Link>
          </p>
          <DerivedLinks groupKey={builtIn} sources={sources} />
        </div>
      ) : (
        <>
          <ListEditor<StudioFooterLink>
            name="links"
            label="Links"
            items={group.links}
            max={FOOTER_LIMITS.links}
            addLabel="Add link"
            itemLabel={(index) => `link ${index + 1}`}
            create={() => ({
              key: newLinkKey(),
              rows: {},
              label: { zh: "", en: "" },
              url: "",
              enabled: true,
              notes: [],
            })}
            renderItem={(link, index, field) => (
              <LinkFields
                link={link}
                index={index}
                field={field}
                issues={linkIssues.get(link.key)}
                idPrefix={idPrefix}
              />
            )}
          />
          {issueFor(issues, "links") ? (
            <p className="studio-field__error" role="alert">
              {issueFor(issues, "links")}
            </p>
          ) : null}
        </>
      )}
      <div className="studio-footer__actions">
        <span
          className="studio-footer__state"
          data-state={failed ? "error" : dirty ? "unsaved" : undefined}
          role="status"
        >
          {state}
        </span>
        <button
          type="submit"
          name="intent"
          value="save-group"
          className="studio-btn studio-btn--primary studio-btn--compact"
          aria-busy={saving || undefined}
          aria-keyshortcuts="Control+S Meta+S"
        >
          Save group
        </button>
      </div>
      {failed && !issues?.length ? (
        <div className="studio-footer__failure" role="alert">
          <p className="studio-field__error">{failed.message}</p>
          {stale ? (
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              onClick={() => revalidator.revalidate()}
            >
              Reload latest
            </button>
          ) : null}
        </div>
      ) : null}
    </StudioForm>
  );
}
