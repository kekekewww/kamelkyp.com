/**
 * Social links (admin-architecture §4.4 "single table, inline edit rows",
 * brief §15). Save = live. Each row saves on its own; showing or hiding a
 * link is its own immediate switch (an edit never changes it); the footer
 * preview shows exactly what the public "Find me / 社群" group lists.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBlocker, useFetcher } from "react-router";
import type { SocialLink } from "../../../lib/cms/schemas/social-link";
import type { ValidationIssue } from "../../../lib/cms/types";
import { StudioPage } from "../shell/studio-page";
import {
  ConfirmDialog,
  EmptyState,
  OrderControls,
  StudioForm,
  serializeForm,
  useKeyboardReorder,
  useStudioSession,
  useToast,
} from "../ui";
import {
  defaultSocialLabel,
  footerLinks,
  SOCIAL_PLATFORM_OPTIONS,
  socialPlatformName,
  socialUrlPlaceholder,
} from "./social-model";

type SocialResult =
  | { ok: true; intent: string; link?: SocialLink; id?: string }
  | { ok: false; code: string; message: string; issues?: ValidationIssue[] };

function issueFor(
  issues: readonly ValidationIssue[] | undefined,
  field: string,
  locale?: "zh" | "en",
): string | undefined {
  return issues?.find(
    (issue) =>
      issue.field === field && (locale ? issue.locale === locale : true),
  )?.message;
}

/** One labelled control inside a row (labels show on small screens). */
function Cell({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`p3-social__cell${className ? ` ${className}` : ""}`}
      data-invalid={error ? "" : undefined}
    >
      <label className="p3-social__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="studio-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Platform, labels, address, username, icon: the editable part of a link. */
function LinkFields({
  link,
  issues,
  onPlatform,
}: {
  link: Partial<SocialLink> | null;
  issues?: readonly ValidationIssue[];
  onPlatform?: (platform: string) => void;
}) {
  const id = useId();
  const [platform, setPlatform] = useState<string>(
    link?.platform ?? "instagram",
  );
  const field = (name: string) => `${id}-${name}`;
  const described = (name: string, error?: string) =>
    error ? `${field(name)}-error` : undefined;
  const zhError = issueFor(issues, "label", "zh");
  const enError = issueFor(issues, "label", "en");
  const urlError = issueFor(issues, "url");
  return (
    <>
      <Cell
        id={field("platform")}
        label="Platform"
        className="p3-social__platform"
      >
        <select
          id={field("platform")}
          name="platform"
          className="studio-input studio-select"
          defaultValue={platform}
          onChange={(event) => {
            setPlatform(event.currentTarget.value);
            onPlatform?.(event.currentTarget.value);
          }}
        >
          {SOCIAL_PLATFORM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Cell>
      <Cell id={field("zh")} label="Label ZH" error={zhError}>
        <input
          id={field("zh")}
          name="label.zh"
          lang="zh-Hant"
          className="studio-input"
          maxLength={80}
          defaultValue={link?.label?.zh ?? ""}
          aria-invalid={zhError ? true : undefined}
          aria-describedby={described("zh", zhError)}
        />
      </Cell>
      <Cell id={field("en")} label="Label EN" error={enError}>
        <input
          id={field("en")}
          name="label.en"
          lang="en"
          className="studio-input"
          maxLength={80}
          defaultValue={link?.label?.en ?? ""}
          aria-invalid={enError ? true : undefined}
          aria-describedby={described("en", enError)}
        />
      </Cell>
      <Cell
        id={field("url")}
        label={platform === "email" ? "Email address" : "Address"}
        error={urlError}
        className="p3-social__url"
      >
        <input
          id={field("url")}
          name="url"
          className="studio-input"
          inputMode={platform === "email" ? "email" : "url"}
          spellCheck={false}
          autoComplete="off"
          placeholder={socialUrlPlaceholder(platform)}
          defaultValue={link?.url ?? ""}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={described("url", urlError)}
        />
      </Cell>
      <Cell
        id={field("username")}
        label="Username"
        error={issueFor(issues, "username")}
      >
        <input
          id={field("username")}
          name="username"
          className="studio-input"
          maxLength={100}
          spellCheck={false}
          autoComplete="off"
          placeholder="Optional"
          defaultValue={link?.username ?? ""}
        />
      </Cell>
      <Cell id={field("icon")} label="Icon" error={issueFor(issues, "icon")}>
        <select
          id={field("icon")}
          name="icon"
          className="studio-input studio-select"
          defaultValue={link?.icon ?? ""}
        >
          <option value="">Platform default</option>
          {SOCIAL_PLATFORM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Cell>
    </>
  );
}

function EnabledSwitch({
  link,
  onToggle,
}: {
  link: SocialLink;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={link.enabled}
      className="p3-switch"
      onClick={() => onToggle(!link.enabled)}
    >
      <span className="p3-switch__track" aria-hidden="true">
        <span className="p3-switch__thumb" />
      </span>
      <span className="p3-switch__label">
        {link.enabled ? "Shown" : "Hidden"}
        <span className="visually-hidden">
          {` on the site: ${link.label.en || link.label.zh}`}
        </span>
      </span>
    </button>
  );
}

function LinkRow({
  link,
  index,
  total,
  order,
  onDirty,
}: {
  link: SocialLink;
  index: number;
  total: number;
  order: {
    picked: boolean;
    onMove: (delta: number) => void;
    handleProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  };
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const fetcher = useFetcher<SocialResult>();
  const toggler = useFetcher<SocialResult>();
  const remover = useFetcher<SocialResult>();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const handled = useRef<unknown>(null);
  const toggled = useRef<unknown>(null);
  const name =
    link.label.en || link.label.zh || socialPlatformName(link.platform);

  const snapshot = () =>
    formRef.current ? serializeForm(new FormData(formRef.current)) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-baseline when the saved link changes
  useEffect(() => {
    baseline.current = snapshot();
    setDirty(false);
    onDirty(link.id, false);
  }, [
    link.url,
    link.label.zh,
    link.label.en,
    link.platform,
    link.username,
    link.icon,
  ]);

  const onInput = () => {
    const next = snapshot() !== baseline.current;
    setDirty(next);
    onDirty(link.id, next);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: react to fetcher results only
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (result.ok && result.link) {
      // Show what was stored (e.g. "https://" added to a bare address).
      const form = formRef.current;
      const saved: Record<string, string> = {
        url: result.link.url,
        "label.zh": result.link.label.zh,
        "label.en": result.link.label.en,
        username: result.link.username ?? "",
      };
      for (const [field, value] of Object.entries(saved)) {
        const input = form?.elements.namedItem(field);
        if (input instanceof HTMLInputElement) input.value = value;
      }
      baseline.current = snapshot();
      setDirty(false);
      onDirty(link.id, false);
      toast.show({ message: `Saved “${name}”` });
    }
  }, [fetcher.state, fetcher.data]);

  const removed = useRef<unknown>(null);
  useEffect(() => {
    const result = remover.data;
    if (remover.state !== "idle" || !result || removed.current === result) {
      return;
    }
    removed.current = result;
    toast.show(
      result.ok
        ? { message: `Deleted “${name}”` }
        : { tone: "error", message: result.message },
    );
  }, [remover.state, remover.data, toast, name]);

  const toggle = useCallback(
    (enabled: boolean) =>
      toggler.submit(
        {
          csrfToken,
          intent: "toggle",
          id: link.id,
          "enabled:bool": String(enabled),
        },
        { method: "post", preventScrollReset: true },
      ),
    [toggler, csrfToken, link.id],
  );

  useEffect(() => {
    const result = toggler.data;
    if (toggler.state !== "idle" || !result || toggled.current === result) {
      return;
    }
    toggled.current = result;
    if (!result.ok) {
      toast.show({ tone: "error", message: result.message });
      return;
    }
    const shown = result.link?.enabled ?? false;
    toast.show({
      message: shown
        ? `“${name}” is shown in the footer`
        : `“${name}” is hidden`,
      action: { label: "Undo", onAction: () => toggle(!shown) },
    });
  }, [toggler.state, toggler.data, toast, toggle, name]);

  // Optimistic switch while the toggle is in flight.
  const pendingEnabled = toggler.formData?.get("enabled:bool");
  const shown =
    typeof pendingEnabled === "string"
      ? pendingEnabled === "true"
      : link.enabled;
  const failed = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const saving = fetcher.state !== "idle";
  const state = saving
    ? "Saving…"
    : failed
      ? "Not saved"
      : dirty
        ? "Unsaved changes"
        : "Saved";

  return (
    <li
      className="p3-social__row"
      data-enabled={shown ? "" : undefined}
      data-dirty={dirty ? "" : undefined}
    >
      <div className="p3-social__order">
        <OrderControls
          label={name}
          index={index}
          total={total}
          picked={order.picked}
          onMove={order.onMove}
          handleProps={order.handleProps}
        />
      </div>
      <StudioForm
        fetcher={fetcher as never}
        ref={formRef}
        className="p3-social__form"
        data-social-row=""
        aria-label={`Link: ${name}`}
        onInput={onInput}
        onChange={onInput}
        noValidate
      >
        <input type="hidden" name="id" value={link.id} />
        <LinkFields link={link} issues={failed?.issues} />
        <div className="p3-social__actions">
          <EnabledSwitch link={{ ...link, enabled: shown }} onToggle={toggle} />
          <span
            className="p3-social__state"
            data-state={failed ? "error" : dirty ? "unsaved" : undefined}
            role="status"
          >
            {state}
          </span>
          <button
            type="submit"
            name="intent"
            value="update"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={saving || undefined}
            aria-keyshortcuts="Control+S Meta+S"
          >
            Save
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => setConfirming(true)}
          >
            Delete…
          </button>
        </div>
        {failed && !failed.issues?.length ? (
          <p className="studio-field__error" role="alert">
            {failed.message}
          </p>
        ) : null}
      </StudioForm>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Delete “${name}”?`}
        onClose={() => setConfirming(false)}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            {shown ? (
              <button
                type="button"
                className="studio-btn studio-btn--secondary studio-btn--compact"
                onClick={() => {
                  setConfirming(false);
                  toggle(false);
                }}
              >
                Hide it instead
              </button>
            ) : null}
            <button
              type="button"
              className="studio-btn studio-btn--danger-filled studio-btn--compact"
              aria-busy={remover.state !== "idle" || undefined}
              onClick={() => {
                onDirty(link.id, false);
                remover.submit(
                  { csrfToken, intent: "delete", id: link.id },
                  { method: "post", preventScrollReset: true },
                );
                setConfirming(false);
              }}
            >
              Delete permanently
            </button>
          </>
        }
      >
        <p>
          It leaves the footer at once and cannot be restored. Hiding keeps it
          here for later.
        </p>
      </ConfirmDialog>
    </li>
  );
}

function AddLink({
  onDirty,
}: {
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const fetcher = useFetcher<SocialResult>();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [epoch, setEpoch] = useState(0);
  const handled = useRef<unknown>(null);
  const touched = useRef({ zh: false, en: false });
  const baseline = useRef<string | null>(null);

  // A new platform suggests labels until the owner types their own.
  const suggest = (platform: string) => {
    const form = formRef.current;
    const label = defaultSocialLabel(platform);
    for (const locale of ["zh", "en"] as const) {
      const input = form?.elements.namedItem(`label.${locale}`);
      if (input instanceof HTMLInputElement && !touched.current[locale]) {
        input.value = label[locale];
      }
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: suggest once per fresh form
  useEffect(() => {
    touched.current = { zh: false, en: false };
    suggest("instagram");
    baseline.current = formRef.current
      ? serializeForm(new FormData(formRef.current))
      : null;
  }, [epoch]);

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (result.ok && result.link) {
      onDirty("new", false);
      toast.show({
        message: `Added “${result.link.label.en || result.link.label.zh}”`,
      });
      setEpoch((value) => value + 1);
    }
  }, [fetcher.state, fetcher.data, toast, onDirty]);

  const failed = fetcher.data && !fetcher.data.ok ? fetcher.data : null;

  return (
    <section className="p3-social__add" aria-labelledby="p3-social-add">
      <h2 className="studio-section-label" id="p3-social-add">
        Add a link
      </h2>
      <StudioForm
        key={epoch}
        fetcher={fetcher as never}
        ref={formRef}
        className="p3-social__form p3-social__form--new"
        data-social-row=""
        noValidate
        onInput={(event) => {
          const target = event.target as HTMLInputElement;
          if (target.name === "label.zh") touched.current.zh = true;
          if (target.name === "label.en") touched.current.en = true;
          onDirty(
            "new",
            serializeForm(new FormData(event.currentTarget)) !==
              baseline.current,
          );
        }}
      >
        <LinkFields link={null} issues={failed?.issues} onPlatform={suggest} />
        <div className="p3-social__actions">
          <label className="p3-social__enable">
            <input type="hidden" name="enabled:bool" value="false" />
            <input
              type="checkbox"
              name="enabled:bool"
              value="true"
              defaultChecked
            />
            Show on the site
          </label>
          <button
            type="submit"
            name="intent"
            value="create"
            className="studio-btn studio-btn--primary studio-btn--compact"
            aria-busy={fetcher.state !== "idle" || undefined}
          >
            {fetcher.state !== "idle" ? "Adding…" : "Add link"}
          </button>
        </div>
        {failed && !failed.issues?.length ? (
          <p className="studio-field__error" role="alert">
            {failed.message}
          </p>
        ) : null}
      </StudioForm>
    </section>
  );
}

function FooterPreview({ links }: { links: readonly SocialLink[] }) {
  const [locale, setLocale] = useState<"zh" | "en">("en");
  const items = footerLinks(links, locale);
  return (
    <aside className="p3-footer-preview" aria-labelledby="p3-footer-preview">
      <div className="p3-footer-preview__head">
        <h2 className="studio-section-label" id="p3-footer-preview">
          Public footer
        </h2>
        <fieldset className="studio-segmented" aria-label="Preview language">
          {(["zh", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="studio-segmented__button"
              aria-pressed={locale === value}
              onClick={() => setLocale(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </fieldset>
      </div>
      <p
        className="p3-footer-preview__group"
        lang={locale === "zh" ? "zh-Hant" : "en"}
      >
        {locale === "zh" ? "社群" : "Find me"}
      </p>
      {items.length === 0 ? (
        <p className="studio-hint">
          No link is shown, so the footer leaves this group out.
        </p>
      ) : (
        <ul
          className="p3-footer-preview__list"
          lang={locale === "zh" ? "zh-Hant" : "en"}
        >
          {items.map((item) => (
            <li key={item.id}>
              {item.label || (
                <span className="studio-row__untitled">No label</span>
              )}
              <span aria-hidden="true"> ↗</span>
            </li>
          ))}
        </ul>
      )}
      <p className="studio-hint">
        Only links switched to Shown appear, in this order. The footer’s Work &
        Resources links live in Settings → Footer.
      </p>
    </aside>
  );
}

export function SocialLinks({ links }: { links: readonly SocialLink[] }) {
  const reorderFetcher = useFetcher<SocialResult>();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const [dirtyRows, setDirtyRows] = useState<ReadonlySet<string>>(new Set());
  const [resetKey, setResetKey] = useState(0);
  const handled = useRef<unknown>(null);
  const byId = new Map(links.map((link) => [link.id, link]));
  const labelOf = (id: string) => {
    const link = byId.get(id);
    return link ? link.label.en || link.label.zh || link.platform : id;
  };

  const onDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyRows((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const commit = useCallback(
    (ids: string[]) =>
      reorderFetcher.submit(
        { csrfToken, intent: "reorder", ids: JSON.stringify(ids) },
        { method: "post", preventScrollReset: true },
      ),
    [reorderFetcher, csrfToken],
  );

  const reorder = useKeyboardReorder({
    ids: links.map((link) => link.id),
    labelOf,
    onCommit: commit,
  });

  useEffect(() => {
    const result = reorderFetcher.data;
    if (
      reorderFetcher.state !== "idle" ||
      !result ||
      handled.current === result
    ) {
      return;
    }
    handled.current = result;
    if (result.ok) toast.show({ message: "Order saved" });
    else {
      toast.show({ tone: "error", message: result.message });
      setResetKey((value) => value + 1);
    }
  }, [reorderFetcher.state, reorderFetcher.data, toast]);

  // Mod+S saves the row that has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      const form = (
        document.activeElement as HTMLElement | null
      )?.closest<HTMLFormElement>("form[data-social-row]");
      const button = form?.querySelector<HTMLButtonElement>(
        'button[type="submit"][name="intent"]',
      );
      if (form && button) form.requestSubmit(button);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dirty = dirtyRows.size > 0;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const ordered = reorder.order
    .map((id) => byId.get(id))
    .filter((link): link is SocialLink => Boolean(link));
  const shownCount = links.filter((link) => link.enabled).length;

  return (
    <StudioPage title="Social links">
      <p className="p3-intro">
        Every change is live when you save it. {shownCount} of {links.length}{" "}
        {links.length === 1 ? "link is" : "links are"} shown in the footer.
      </p>
      <div className="p3-social">
        <div className="p3-social__main">
          {links.length === 0 ? (
            <EmptyState
              title="No social links yet"
              body="Add Threads, Instagram, GitHub, YouTube, Spotify, SoundCloud, LinkedIn, Devpost, an email address or any other link below."
            />
          ) : (
            <>
              <div className="p3-social__head" aria-hidden="true">
                <span>Platform</span>
                <span>Label ZH</span>
                <span>Label EN</span>
                <span>Address</span>
                <span>Username</span>
                <span>Icon</span>
              </div>
              <ol
                className="p3-social__list"
                aria-label="Social links"
                key={resetKey}
              >
                {ordered.map((link, index) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    index={index}
                    total={ordered.length}
                    order={{
                      picked: reorder.picked === link.id,
                      onMove: (delta) => reorder.move(link.id, delta),
                      handleProps: reorder.handleProps(link.id),
                    }}
                    onDirty={onDirty}
                  />
                ))}
              </ol>
              <p className="visually-hidden" aria-live="assertive">
                {reorder.announcement}
              </p>
            </>
          )}
          <AddLink onDirty={onDirty} />
        </div>
        <FooterPreview links={ordered} />
      </div>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        onClose={() => blocker.reset?.()}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => blocker.reset?.()}
            >
              Stay
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => blocker.proceed?.()}
            >
              Discard changes
            </button>
          </>
        }
      >
        <p>
          {dirtyRows.size} {dirtyRows.size === 1 ? "link has" : "links have"}{" "}
          unsaved edits. Save each row, or leave and lose them.
        </p>
      </ConfirmDialog>
    </StudioPage>
  );
}
