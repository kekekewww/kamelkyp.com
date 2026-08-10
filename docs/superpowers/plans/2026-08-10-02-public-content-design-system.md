# Kamel Public Content and Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付中英文 Landing Page、分類式服務頁、作品／Blog／條款頁，以及符合 V4 Narrow Console 方向的桌機與手機響應式公開網站。

**Architecture:** 所有公開路徑位於 /:lang 下；Loader 驗證 zh／en 並從 D1 取得已發布內容。品牌與服務結構使用穩定 TypeScript Catalog，Kamel 日後可由後台修改內容版本；作品、Blog 與 Footer 連結允許空集合並顯示適當 Empty State。

**Tech Stack:** React Router 8.3.0 SSR、React 19.2.8、D1、Zod 4.4.3、自訂 CSS、Fontsource 5.3.0、Playwright 1.61.1、axe 4.12.1。

## Global Constraints

- 前置計畫 01 已合併 main。
- Branch：codex/02-public-content。
- 中文與英文有獨立 URL 與內容；不自動翻譯。
- Landing Page 只出現一次「楊子賢」；主要公開名稱為 Kamel。
- 任一選擇頁都不一次展開四種服務。
- Mixing 只顯示 Full Mix 與 Vocal Mix；Song Transition 只顯示 Simple 與 Edit。
- Footer 支援任意數量群組／連結；桌面多欄、手機 Accordion。
- 不使用 Bootstrap CSS、Tailwind、Raw HTML 或任意 iframe。
- 視覺色彩與 motion 時間必須與設計規格一致。
- WCAG 2.2 AA、鍵盤導覽、44 × 44 px 控制項、Reduced Motion。
- 字型透過套件隨應用程式部署，不向第三方字型服務發出瀏覽器請求。

---

## File Map

### Create

- app/lib/i18n/copy.ts
- app/lib/i18n/locale-cookie.server.ts
- app/lib/i18n/path.ts
- app/lib/services/catalog.ts
- app/lib/content/block-schema.ts
- app/lib/content/public-content.server.ts
- app/lib/content/footer-repository.server.ts
- app/components/layout/public-shell.tsx
- app/components/layout/site-header.tsx
- app/components/layout/site-footer.tsx
- app/components/layout/language-switcher.tsx
- app/components/content/block-renderer.tsx
- app/components/content/empty-state.tsx
- app/components/services/service-choice.tsx
- app/components/services/service-overview.tsx
- app/routes/public/layout.tsx
- app/routes/public/home.tsx
- app/routes/public/mixing-index.tsx
- app/routes/public/mixing-full.tsx
- app/routes/public/mixing-vocal.tsx
- app/routes/public/transition-index.tsx
- app/routes/public/transition-simple.tsx
- app/routes/public/transition-edit.tsx
- app/routes/public/commission-index.tsx
- app/routes/public/works-index.tsx
- app/routes/public/work-detail.tsx
- app/routes/public/other-index.tsx
- app/routes/public/other-detail.tsx
- app/routes/public/terms.tsx
- app/routes/public/privacy.tsx
- app/routes/language-preference.ts
- app/styles/layout.css
- app/styles/components.css
- app/styles/motion.css
- tests/unit/locale.test.ts
- tests/unit/service-catalog.test.ts
- tests/unit/block-schema.test.ts
- tests/worker/public-content.test.ts
- tests/e2e/public-navigation.spec.ts
- tests/e2e/responsive-a11y.spec.ts

### Modify

- package.json
- package-lock.json
- app/root.tsx
- app/routes.ts
- app/styles/tokens.css
- app/styles/global.css
- app/lib/db/content-repository.server.ts

### Produced Interfaces

~~~ts
export type Locale = "zh" | "en";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  category: "mixing" | "song_transition";
  slug: string;
  name: LocalizedText;
  shortDescription: LocalizedText;
  basePriceTwd: number;
  standardDays: LocalizedText;
  deliverables: LocalizedText[];
}

export type ContentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "unordered" | "ordered"; items: string[] }
  | { type: "quote"; text: string; attribution: string | null }
  | { type: "external_image"; url: string; alt: string; caption: string | null }
  | { type: "external_link"; url: string; label: string }
  | { type: "divider" };
~~~

---

### Task 1: Implement locale detection, preference and stable localized paths

**Files:**
- Create: app/lib/i18n/copy.ts
- Create: app/lib/i18n/locale-cookie.server.ts
- Create: app/lib/i18n/path.ts
- Create: app/routes/language-preference.ts
- Create: tests/unit/locale.test.ts
- Modify: app/routes/language-redirect.tsx
- Modify: app/routes.ts

**Interfaces:**
- Consumes: Locale from Plan 01.
- Produces: getPreferredLocale(), localePath(), switchLocalePath().

- [ ] **Step 1: Commit failing locale tests**

~~~ts
// tests/unit/locale.test.ts
import { describe, expect, it } from "vitest";
import {
  getPreferredLocale,
  parseLocaleCookie,
} from "../../app/lib/i18n/locale-cookie.server";
import {
  localePath,
  switchLocalePath,
} from "../../app/lib/i18n/path";

describe("locale selection", () => {
  it("prefers an explicit cookie over Accept-Language", () => {
    expect(
      getPreferredLocale({
        cookieHeader: "kamel_locale=en",
        acceptLanguage: "zh-TW,zh;q=0.9",
      }),
    ).toBe("en");
  });

  it("uses zh only when the browser preference starts with zh", () => {
    expect(
      getPreferredLocale({ cookieHeader: null, acceptLanguage: "zh-TW" }),
    ).toBe("zh");
    expect(
      getPreferredLocale({ cookieHeader: null, acceptLanguage: "ja-JP" }),
    ).toBe("en");
  });

  it("rejects an invalid locale cookie", () => {
    expect(parseLocaleCookie("kamel_locale=fr")).toBeNull();
  });

  it("switches locale without changing the rest of the path", () => {
    expect(switchLocalePath("/zh/mixing/full", "en")).toBe("/en/mixing/full");
    expect(localePath("zh", "/works")).toBe("/zh/works");
  });
});
~~~

Cloud commit message: test: define locale preference and path behavior.

- [ ] **Step 2: Run the locale test and verify failure**

~~~bash
npm run test:unit -- tests/unit/locale.test.ts
~~~

Expected result: FAIL because locale-cookie.server.ts and path.ts do not exist.

- [ ] **Step 3: Implement the locale helpers**

~~~ts
// app/lib/i18n/locale-cookie.server.ts
import type { Locale } from "./locale";

const COOKIE_NAME = "kamel_locale";

export function parseLocaleCookie(header: string | null): Locale | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];

  return value === "zh" || value === "en" ? value : null;
}

export function getPreferredLocale(input: {
  cookieHeader: string | null;
  acceptLanguage: string | null;
}): Locale {
  const cookie = parseLocaleCookie(input.cookieHeader);
  if (cookie) return cookie;
  return input.acceptLanguage?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function serializeLocaleCookie(locale: Locale): string {
  return [
    `${COOKIE_NAME}=${locale}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}
~~~

~~~ts
// app/lib/i18n/path.ts
import type { Locale } from "./locale";

export function localePath(locale: Locale, path = ""): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return suffix === "/" ? `/${locale}` : `/${locale}${suffix}`;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  return pathname.replace(/^\/(zh|en)(?=\/|$)/, `/${locale}`);
}
~~~

~~~ts
// app/routes/language-preference.ts
import { redirect, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "../lib/i18n/locale";
import { serializeLocaleCookie } from "../lib/i18n/locale-cookie.server";

export function loader({ params, request }: LoaderFunctionArgs) {
  if (!params.locale || !isLocale(params.locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("returnTo");
  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : `/${params.locale}`;

  return redirect(safeReturnTo, {
    headers: { "set-cookie": serializeLocaleCookie(params.locale) },
  });
}
~~~

Update the root loader to use getPreferredLocale() and add route:

~~~ts
route("language/:locale", "routes/language-preference.ts"),
~~~

- [ ] **Step 4: Run tests and typecheck**

~~~bash
npm run test:unit -- tests/unit/locale.test.ts
npm run typecheck
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add bilingual locale routing and preference.

---

### Task 2: Define the service catalog and category-only navigation

**Files:**
- Create: app/lib/services/catalog.ts
- Create: app/components/services/service-choice.tsx
- Create: app/components/services/service-overview.tsx
- Create: app/routes/public/mixing-index.tsx
- Create: app/routes/public/mixing-full.tsx
- Create: app/routes/public/mixing-vocal.tsx
- Create: app/routes/public/transition-index.tsx
- Create: app/routes/public/transition-simple.tsx
- Create: app/routes/public/transition-edit.tsx
- Create: app/routes/public/commission-index.tsx
- Create: tests/unit/service-catalog.test.ts
- Modify: app/routes.ts

**Interfaces:**
- Consumes: ServiceId, Locale.
- Produces: SERVICE_CATALOG, getCategoryServices(), getService().

- [ ] **Step 1: Commit failing category isolation tests**

~~~ts
// tests/unit/service-catalog.test.ts
import { describe, expect, it } from "vitest";
import {
  getCategoryServices,
  getService,
} from "../../app/lib/services/catalog";

describe("service catalog", () => {
  it("shows only two mixing choices", () => {
    expect(getCategoryServices("mixing").map((service) => service.id)).toEqual([
      "full_mix",
      "vocal_mix",
    ]);
  });

  it("shows only two transition choices", () => {
    expect(
      getCategoryServices("song_transition").map((service) => service.id),
    ).toEqual(["simple_transition", "edit_transition"]);
  });

  it("keeps approved TWD base prices", () => {
    expect(getService("full_mix").basePriceTwd).toBe(8000);
    expect(getService("vocal_mix").basePriceTwd).toBe(4000);
    expect(getService("simple_transition").basePriceTwd).toBe(1000);
    expect(getService("edit_transition").basePriceTwd).toBe(4000);
  });
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
npm run test:unit -- tests/unit/service-catalog.test.ts
~~~

Expected result: FAIL because catalog.ts does not exist.

- [ ] **Step 3: Implement the exact catalog**

~~~ts
// app/lib/services/catalog.ts
import type { ServiceId } from "./service-id";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  category: "mixing" | "song_transition";
  slug: string;
  name: LocalizedText;
  shortDescription: LocalizedText;
  basePriceTwd: number;
  standardDays: LocalizedText;
  deliverables: LocalizedText[];
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  {
    id: "full_mix",
    category: "mixing",
    slug: "full",
    name: { zh: "完整歌曲混音", en: "Full Song Mixing" },
    shortDescription: {
      zh: "包含人聲、各式樂器、完整混音與母帶。",
      en: "Full vocal, instrument, mix and master production.",
    },
    basePriceTwd: 8000,
    standardDays: { zh: "7–14 個工作日", en: "7–14 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV Final Master", en: "24-bit / 48 kHz WAV Final Master" },
      { zh: "Vocal Stem", en: "Vocal Stem" },
      { zh: "Instrumental Mix Stem", en: "Instrumental Mix Stem" },
    ],
  },
  {
    id: "vocal_mix",
    category: "mixing",
    slug: "vocal",
    name: { zh: "Vocal 混音", en: "Vocal Mixing" },
    shortDescription: {
      zh: "人聲、和音、修音、對拍、效果與母帶。",
      en: "Vocals, harmonies, tuning, timing, effects and mastering.",
    },
    basePriceTwd: 4000,
    standardDays: { zh: "5–7 個工作日", en: "5–7 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV Final Master", en: "24-bit / 48 kHz WAV Final Master" },
      { zh: "Vocal Stem", en: "Vocal Stem" },
      { zh: "Instrumental Mix Stem", en: "Instrumental Mix Stem" },
    ],
  },
  {
    id: "simple_transition",
    category: "song_transition",
    slug: "simple",
    name: { zh: "單純歌曲銜接", en: "Simple Song Transition" },
    shortDescription: {
      zh: "1–5 首基本銜接，不包含歌曲結構編輯。",
      en: "Basic transitions for 1–5 songs without structural editing.",
    },
    basePriceTwd: 1000,
    standardDays: { zh: "3–5 個工作日", en: "3–5 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV", en: "24-bit / 48 kHz WAV" },
      { zh: "MP3 與 AAC", en: "MP3 and AAC" },
    ],
  },
  {
    id: "edit_transition",
    category: "song_transition",
    slug: "edit",
    name: { zh: "編輯／剪輯歌曲銜接", en: "Edited Song Transition" },
    shortDescription: {
      zh: "包含刪減、重排、速度／音高、音效、平衡與重新母帶。",
      en: "Cuts, restructuring, tempo or pitch, effects, balance and remastering.",
    },
    basePriceTwd: 4000,
    standardDays: { zh: "7–14 個工作日", en: "7–14 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV", en: "24-bit / 48 kHz WAV" },
      { zh: "MP3 與 AAC", en: "MP3 and AAC" },
    ],
  },
] as const;

export function getCategoryServices(
  category: ServiceDefinition["category"],
): readonly ServiceDefinition[] {
  return SERVICE_CATALOG.filter((service) => service.category === category);
}

export function getService(id: ServiceId): ServiceDefinition {
  const service = SERVICE_CATALOG.find((item) => item.id === id);
  if (!service) throw new Error("service_not_found");
  return service;
}
~~~

ServiceChoice accepts exactly one category and has no API to receive all four:

~~~tsx
// app/components/services/service-choice.tsx
import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";

export function ServiceChoice({
  category,
  locale,
}: {
  category: ServiceDefinition["category"];
  locale: Locale;
}) {
  const base = category === "mixing" ? "/mixing" : "/song-transition";
  return (
    <div className="service-choice" aria-label={category}>
      {getCategoryServices(category).map((service) => (
        <article className="service-choice__item" key={service.id}>
          <p className="eyebrow">
            {locale === "zh" ? "服務選擇" : "Choose a service"}
          </p>
          <h2>{service.name[locale]}</h2>
          <p>{service.shortDescription[locale]}</p>
          <Link to={localePath(locale, `${base}/${service.slug}`)}>
            {locale === "zh" ? "查看服務" : "View service"}
          </Link>
        </article>
      ))}
    </div>
  );
}
~~~

Each detail route exports a fixed ServiceId, for example:

~~~tsx
// app/routes/public/mixing-full.tsx
import { ServiceOverview } from "../../components/services/service-overview";

export default function FullMixRoute() {
  return <ServiceOverview serviceId="full_mix" />;
}
~~~

- [ ] **Step 4: Register routes and run tests**

Register only the approved hierarchy:

~~~ts
route(":lang", "routes/public/layout.tsx", [
  index("routes/public/home.tsx"),
  route("commission", "routes/public/commission-index.tsx"),
  route("mixing", "routes/public/mixing-index.tsx"),
  route("mixing/full", "routes/public/mixing-full.tsx"),
  route("mixing/vocal", "routes/public/mixing-vocal.tsx"),
  route("song-transition", "routes/public/transition-index.tsx"),
  route("song-transition/simple", "routes/public/transition-simple.tsx"),
  route("song-transition/edit", "routes/public/transition-edit.tsx"),
]),
~~~

~~~bash
npm run test:unit -- tests/unit/service-catalog.test.ts
npm run typecheck
npm run build
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add category-scoped service pages.

---

### Task 3: Build the Narrow Console shell, Landing Page and responsive Footer

**Files:**
- Create: app/components/layout/public-shell.tsx
- Create: app/components/layout/site-header.tsx
- Create: app/components/layout/site-footer.tsx
- Create: app/components/layout/language-switcher.tsx
- Create: app/lib/content/footer-repository.server.ts
- Create: app/routes/public/layout.tsx
- Create: app/routes/public/home.tsx
- Create: app/styles/layout.css
- Create: app/styles/components.css
- Create: app/styles/motion.css
- Modify: package.json
- Modify: app/root.tsx
- Modify: app/styles/tokens.css
- Modify: app/styles/global.css
- Create: tests/e2e/public-navigation.spec.ts

**Interfaces:**
- Consumes: Locale, localePath, category services, D1 links.
- Produces: PublicShell, SiteHeader, SiteFooter and Landing Page.

- [ ] **Step 1: Commit failing public navigation E2E**

~~~ts
// tests/e2e/public-navigation.spec.ts
import { expect, test } from "@playwright/test";

test("landing identity and category navigation stay focused", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  await expect(page.getByText("楊子賢", { exact: true })).toHaveCount(1);

  await page.getByRole("link", { name: "混音" }).click();
  await expect(page).toHaveURL(/\/zh\/mixing$/);
  await expect(page.getByRole("heading", { name: "完整歌曲混音" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vocal 混音" })).toBeVisible();
  await expect(page.getByText("單純歌曲銜接")).toHaveCount(0);
});

test("mobile menu and footer use expandable groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh");
  await page.getByRole("button", { name: "開啟選單" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator("footer details")).toHaveCount(5);
});
~~~

Expected initial result on Preview: FAIL because the public shell is not implemented.

- [ ] **Step 2: Add self-hosted font packages through the cloud lockfile workflow**

Add exact dependencies:

~~~json
{
  "@fontsource/barlow-condensed": "5.3.0",
  "@fontsource-variable/noto-sans-tc": "5.3.0",
  "@fontsource/ibm-plex-mono": "5.3.0"
}
~~~

Import only required weights in app/root.tsx:

~~~ts
import "@fontsource/barlow-condensed/600.css";
import "@fontsource-variable/noto-sans-tc/wght.css";
import "@fontsource/ibm-plex-mono/500.css";
~~~

Dispatch Refresh lockfile and verify package-lock is committed.

- [ ] **Step 3: Implement Header, Landing layout and Footer**

The Header desktop menu must use hover and focus-within; mobile uses separate disclosure buttons. Main category links remain clickable.

~~~tsx
// app/components/layout/site-header.tsx
export function SiteHeader({ locale }: { locale: Locale }) {
  const copy =
    locale === "zh"
      ? { home: "主頁", mixing: "混音", transition: "歌曲銜接", other: "其他內容", open: "開啟選單" }
      : { home: "Home", mixing: "Mixing", transition: "Song Transition", other: "Other Work", open: "Open menu" };

  return (
    <header className="site-header">
      <Link className="site-header__brand" to={localePath(locale)}>Kamel</Link>
      <button className="site-header__menu-button" type="button" aria-label={copy.open}>
        <span aria-hidden="true">☰</span>
      </button>
      <nav aria-label={locale === "zh" ? "主要導覽" : "Primary navigation"}>
        <Link to={localePath(locale)}>{copy.home}</Link>
        <div className="nav-group">
          <Link to={localePath(locale, "/mixing")}>{copy.mixing}</Link>
          <div className="nav-group__menu">
            <Link to={localePath(locale, "/mixing/full")}>
              {locale === "zh" ? "完整歌曲混音" : "Full Song Mixing"}
            </Link>
            <Link to={localePath(locale, "/mixing/vocal")}>
              {locale === "zh" ? "Vocal 混音" : "Vocal Mixing"}
            </Link>
          </div>
        </div>
        <div className="nav-group">
          <Link to={localePath(locale, "/song-transition")}>{copy.transition}</Link>
          <div className="nav-group__menu">
            <Link to={localePath(locale, "/song-transition/simple")}>
              {locale === "zh" ? "單純歌曲銜接" : "Simple Transition"}
            </Link>
            <Link to={localePath(locale, "/song-transition/edit")}>
              {locale === "zh" ? "編輯／剪輯銜接" : "Edited Transition"}
            </Link>
          </div>
        </div>
        <Link to={localePath(locale, "/other")}>{copy.other}</Link>
        <LanguageSwitcher locale={locale} />
      </nav>
    </header>
  );
}
~~~

Landing Page identity region:

~~~tsx
<section className="landing-console">
  <aside className="landing-console__identity">
    <p className="landing-console__real-name">楊子賢</p>
    <h1>Kamel</h1>
    <p>{locale === "zh"
      ? "為獨立音樂人、歌手、舞蹈團體與活動製作混音及歌曲銜接。"
      : "Mixing and song-transition work for independent musicians, singers, dance groups and events."}
    </p>
  </aside>
  <main className="landing-console__content">
    <section aria-labelledby="showreel-title">
      <p className="eyebrow">SHOWREEL</p>
      <h2 id="showreel-title">
        {locale === "zh" ? "聽見作品" : "Listen to the work"}
      </h2>
      <div className="showreel-empty">
        {locale === "zh" ? "作品將由 Kamel 從後台發布。" : "Kamel will publish the showreel from the admin area."}
      </div>
    </section>
    <div className="landing-services">
      <Link to={localePath(locale, "/mixing")}>Mixing</Link>
      <Link to={localePath(locale, "/song-transition")}>Song Transition</Link>
    </div>
  </main>
</section>
~~~

Footer repository returns arbitrary enabled groups; SiteFooter maps desktop columns and the same data to mobile details. It must not slice to three links.

~~~tsx
{groups.map((group) => (
  <details className="footer-group" key={group.id}>
    <summary>{group.label}</summary>
    <ul>
      {group.links.map((link) => (
        <li key={link.id}>
          <a href={link.url} rel="noreferrer noopener">{link.label}</a>
        </li>
      ))}
    </ul>
  </details>
))}
~~~

- [ ] **Step 4: Implement exact responsive and motion tokens**

~~~css
/* app/styles/layout.css */
.landing-console {
  display: grid;
  min-height: 72vh;
  grid-template-columns: minmax(18rem, 30%) minmax(0, 70%);
  border-bottom: 1px solid color-mix(in srgb, var(--color-cool-gray) 35%, transparent);
}

.landing-console__identity {
  padding: clamp(2rem, 5vw, 5rem);
  border-right: 1px solid color-mix(in srgb, var(--color-cool-gray) 35%, transparent);
}

.landing-console__content {
  padding: clamp(2rem, 5vw, 5rem);
}

.site-footer__groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 2rem;
}

.site-header a,
.site-header button,
.site-footer a,
.site-footer summary {
  min-height: 44px;
  min-width: 44px;
}

@media (max-width: 767px) {
  .landing-console {
    grid-template-columns: 1fr;
  }

  .landing-console__identity {
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-cool-gray) 35%, transparent);
  }

  .site-footer__groups {
    display: block;
  }
}
~~~

~~~css
/* app/styles/motion.css */
.nav-group__menu {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.98);
  transition:
    opacity var(--motion-fast) ease,
    transform var(--motion-normal) ease;
  pointer-events: none;
}

.nav-group:hover .nav-group__menu,
.nav-group:focus-within .nav-group__menu {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

button,
.button,
a {
  transition:
    transform var(--motion-fast) ease,
    color var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}

button:active,
.button:active {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .nav-group__menu {
    transform: none;
  }
}
~~~

- [ ] **Step 5: Deploy Preview, run navigation E2E and commit**

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/public-navigation.spec.ts
~~~

Expected:

- 楊子賢 appears exactly once on /zh.
- /zh/mixing contains only two mixing services.
- 390 px uses single-column Landing and mobile disclosures.
- Footer renders all enabled links, not a fixed first three.
- No browser request to fonts.googleapis.com or fonts.gstatic.com.

Cloud commit message: feat: build responsive Narrow Console public shell.

---

### Task 4: Add safe content blocks, Works, Other/Blog and legal pages

**Files:**
- Create: app/lib/content/block-schema.ts
- Create: app/lib/content/public-content.server.ts
- Create: app/components/content/block-renderer.tsx
- Create: app/components/content/empty-state.tsx
- Create: app/routes/public/works-index.tsx
- Create: app/routes/public/work-detail.tsx
- Create: app/routes/public/other-index.tsx
- Create: app/routes/public/other-detail.tsx
- Create: app/routes/public/terms.tsx
- Create: app/routes/public/privacy.tsx
- Create: tests/unit/block-schema.test.ts
- Create: tests/worker/public-content.test.ts
- Modify: app/routes.ts
- Modify: app/lib/db/content-repository.server.ts

**Interfaces:**
- Consumes: D1 content publications, Locale.
- Produces: ContentBlockSchema, listPublishedContent(), BlockRenderer.

- [ ] **Step 1: Commit failing Block allowlist tests**

~~~ts
// tests/unit/block-schema.test.ts
import { describe, expect, it } from "vitest";
import { ContentBlocksSchema } from "../../app/lib/content/block-schema";

describe("safe content blocks", () => {
  it("accepts text and HTTPS external links", () => {
    expect(
      ContentBlocksSchema.safeParse([
        { type: "heading", level: 2, text: "Title" },
        { type: "external_link", url: "https://example.com", label: "Open" },
      ]).success,
    ).toBe(true);
  });

  it("rejects raw HTML, scripts and non-HTTPS URLs", () => {
    expect(
      ContentBlocksSchema.safeParse([
        { type: "html", value: "<script>alert(1)</script>" },
      ]).success,
    ).toBe(false);
    expect(
      ContentBlocksSchema.safeParse([
        { type: "external_link", url: "javascript:alert(1)", label: "Bad" },
      ]).success,
    ).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
npm run test:unit -- tests/unit/block-schema.test.ts
~~~

Expected result: FAIL because block-schema.ts does not exist.

- [ ] **Step 3: Implement the schema and renderer**

~~~ts
// app/lib/content/block-schema.ts
import { z } from "zod";

const HttpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "https_required");

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().min(1).max(180) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(8000) }),
  z.object({ type: z.literal("list"), style: z.enum(["unordered", "ordered"]), items: z.array(z.string().min(1).max(1000)).min(1).max(100) }),
  z.object({ type: z.literal("quote"), text: z.string().min(1).max(2000), attribution: z.string().max(200).nullable() }),
  z.object({ type: z.literal("external_image"), url: HttpsUrl, alt: z.string().min(1).max(300), caption: z.string().max(500).nullable() }),
  z.object({ type: z.literal("external_link"), url: HttpsUrl, label: z.string().min(1).max(200) }),
  z.object({ type: z.literal("divider") }),
]);

export const ContentBlocksSchema = z.array(ContentBlockSchema).max(300);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
~~~

BlockRenderer must use React text nodes and explicit elements only. It must never call dangerouslySetInnerHTML.

~~~tsx
export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return blocks.map((block, index) => {
    const key = `${block.type}-${index}`;
    switch (block.type) {
      case "heading":
        return block.level === 2
          ? <h2 key={key}>{block.text}</h2>
          : <h3 key={key}>{block.text}</h3>;
      case "paragraph":
        return <p key={key}>{block.text}</p>;
      case "external_link":
        return <p key={key}><a href={block.url} rel="noreferrer noopener">{block.label}</a></p>;
      case "external_image":
        return <figure key={key}><img src={block.url} alt={block.alt} loading="lazy" /><figcaption>{block.caption}</figcaption></figure>;
      case "quote":
        return <blockquote key={key}>{block.text}{block.attribution && <cite>{block.attribution}</cite>}</blockquote>;
      case "list": {
        const items = block.items.map((item) => <li key={item}>{item}</li>);
        return block.style === "ordered" ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
      }
      case "divider":
        return <hr key={key} />;
    }
  });
}
~~~

- [ ] **Step 4: Add public routes and server tests**

listPublishedContent returns only records with content_publications for the requested locale. Other entries with an external_link first block may render an external CTA; the list route does not execute redirects automatically.

~~~ts
route("works", "routes/public/works-index.tsx"),
route("works/:slug", "routes/public/work-detail.tsx"),
route("other", "routes/public/other-index.tsx"),
route("other/:slug", "routes/public/other-detail.tsx"),
route("terms", "routes/public/terms.tsx"),
route("privacy", "routes/public/privacy.tsx"),
~~~

Worker test requirements:

~~~ts
it("does not fall back from missing English content to Chinese", async () => {
  const items = await listPublishedContent(env.DB, "post", "en");
  expect(items).toEqual([]);
});

it("returns only listed, published entries", async () => {
  const items = await listPublishedContent(env.DB, "work", "zh");
  expect(items.every((item) => item.locale === "zh")).toBe(true);
});
~~~

- [ ] **Step 5: Run all public tests and commit**

~~~bash
npm run test:unit -- tests/unit/block-schema.test.ts
npm run test:worker -- tests/worker/public-content.test.ts
npm run typecheck
npm run build
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/public-navigation.spec.ts
~~~

Expected result: PASS. Empty Works／Other pages show localized empty states and do not fabricate content.

Cloud commit message: feat: add safe works blog and legal content pages.

---

### Task 5: Verify responsive layout, keyboard navigation and WCAG baseline

**Files:**
- Create: tests/e2e/responsive-a11y.spec.ts
- Modify: app/components/layout/site-header.tsx
- Modify: app/components/layout/site-footer.tsx
- Modify: app/styles/layout.css
- Modify: app/styles/motion.css

**Interfaces:**
- Consumes: deployed public Preview.
- Produces: automated viewport, keyboard and axe gate.

- [ ] **Step 1: Commit failing viewport and axe tests**

~~~ts
// tests/e2e/responsive-a11y.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`landing is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/zh");
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await expect(page.getByRole("heading", { name: "Kamel" })).toBeVisible();
  });
}

test("desktop submenu works by keyboard and Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  await page.getByRole("link", { name: "Mixing", exact: true }).focus();
  await expect(page.getByRole("link", { name: "Full Song Mixing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Full Song Mixing" })).toBeHidden();
});

test("public landing has no serious axe violations", async ({ page }) => {
  await page.goto("/en");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact ?? ""),
    ),
  ).toEqual([]);
});
~~~

- [ ] **Step 2: Run against Preview and verify any real failures**

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/responsive-a11y.spec.ts
~~~

Expected before fixes: tests identify any overflow, missing Escape behavior, label, contrast or landmark issue. Do not weaken axe tags to make the test pass.

- [ ] **Step 3: Implement keyboard close state and final responsive fixes**

SiteHeader must keep submenu open state for keyboard interaction and close it on Escape, returning focus to the category link. Mobile menu button must update aria-expanded and aria-controls. Footer summary names must be localized and unique.

Minimum handler:

~~~ts
function handleNavigationKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Escape") return;
  setOpenGroup(null);
  categoryTriggerRef.current?.focus();
}
~~~

All interactive controls retain min-inline-size and min-block-size 44px. At 390px no fixed-width waveform or horizontal service grid may overflow.

- [ ] **Step 4: Re-run complete public verification**

~~~bash
npm run check
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/public-navigation.spec.ts tests/e2e/responsive-a11y.spec.ts
~~~

Expected result: PASS at all four widths, keyboard submenu closes with Escape, no critical or serious axe violation.

- [ ] **Step 5: Commit and open PR**

Cloud commit message: test: enforce responsive and accessible public shell.

Create PR codex/02-public-content → main. Include Preview links for /zh, /en, /zh/mixing, /zh/song-transition, /zh/works and /zh/other. Merge only after visual approval.
