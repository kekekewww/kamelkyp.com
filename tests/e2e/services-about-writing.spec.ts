import { expect, test } from "@playwright/test";
import { expectNoPersonalName } from "./helpers/brand";

test("services overview lists the three groups with real starting prices", async ({
  page,
}) => {
  await page.goto("/zh/services");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "服務", exact: true }),
  ).toBeVisible();
  for (const name of ["混音", "歌曲銜接", "軟體與互動"]) {
    await expect(
      main.getByRole("heading", { level: 2, name, exact: true }),
    ).toBeVisible();
  }
  // Lowest active price rule per group: Vocal mix / Simple transition.
  await expect(main.getByText("NT$4,000")).toBeVisible();
  await expect(main.getByText("NT$1,000")).toBeVisible();
  await expect(main.getByText("依專案報價")).toBeVisible();
  // Overview names groups only; individual services live on detail pages.
  await expect(main.getByText("完整歌曲混音")).toHaveCount(0);
  await expect(main.getByText("單純歌曲銜接")).toHaveCount(0);
});

test("service page price = active price rule = wizard quote", async ({
  page,
}) => {
  await page.goto("/zh/mixing/vocal");
  const pagePrice = await page
    .getByRole("main")
    .locator(".service-detail__fact--price .price__figure")
    .innerText();
  expect(pagePrice).toBe("NT$4,000");

  await page.addInitScript(() => localStorage.clear());
  await page.goto("/zh/commission/mixing/vocal");
  await page.locator('[data-draft-ready="true"]').waitFor();
  const quote = page.locator(".quote-summary");
  await expect(
    quote.locator("div").filter({ hasText: "服務基價" }).locator("dd"),
  ).toHaveText(pagePrice);
  await expect(quote.locator(".quote-summary__total dd")).toHaveText(pagePrice);
});

test("software page quotes on request and exposes the email contact block", async ({
  page,
}) => {
  await page.goto("/en/services/software");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Software & Interactive" }),
  ).toBeVisible();
  await expect(main.getByText("Contact for quote").first()).toBeVisible();
  await expect(main.getByText(/NT\$|US\$/)).toHaveCount(0);
  // Offerings are the published software-area services.
  await expect(
    main.getByRole("heading", { level: 3, name: "Web development" }),
  ).toBeVisible();
  // Related work comes from published projects.
  await expect(
    main.getByRole("link", { name: /Fixture Signal Map/ }),
  ).toHaveAttribute("href", "/en/works/fixture-signal-map");

  // The address is brand.contactEmail (the same one the footer shows).
  const footerAddress = await page
    .getByRole("contentinfo")
    .locator(".site-footer__email")
    .innerText();
  const contact = page.locator("#contact");
  await expect(
    contact.getByRole("heading", { name: "Tell me about your project" }),
  ).toBeVisible();
  const email = contact.getByRole("link", { name: "Email me" });
  await expect(email).toHaveAttribute(
    "href",
    `mailto:${footerAddress}?subject=${encodeURIComponent(
      "[Software & Interactive] Project inquiry",
    )}`,
  );
  const box = await email.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(contact.getByText(footerAddress)).toBeVisible();
});

test("about page has one h1, reads brand settings and never shows a personal name", async ({
  page,
}) => {
  await page.goto("/zh/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "關於", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/我做系統，也做聲音。/)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "工作方式" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /軟體系統/ })).toHaveAttribute(
    "href",
    "/zh/works?category=software",
  );
  await expectNoPersonalName(page);
});

test("writing lists internal and outbound entries; drafts stay hidden", async ({
  page,
}) => {
  await page.goto("/en/writing");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Writing", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Read", exact: true }),
  ).toHaveAttribute("href", "/en/writing/fixture-building-notes");
  const outbound = main.getByRole("link", { name: /Read on Threads/ });
  await expect(outbound).toHaveAttribute("target", "_blank");
  await expect(outbound).toHaveAttribute("rel", /noopener/);
  await expect(main.getByText("Fixture Draft Note")).toHaveCount(0);
  await expect(main.getByText(/^Sample:/)).toHaveCount(0);
  await expect(main.getByText("PLACEHOLDER")).toHaveCount(0);
});

test("internal writing has a detail page; link-only writing has none", async ({
  page,
  request,
}) => {
  await page.goto("/en/writing/fixture-building-notes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Fixture Notes on Building Tools",
  );
  await expect(page.getByText("Fixture body text.")).toBeVisible();
  expect(
    (await request.get("/en/writing/fixture-thread-on-mixing")).status(),
  ).toBe(404);
  expect((await request.get("/en/writing/fixture-draft-note")).status()).toBe(
    404,
  );
});

test("legacy /en/other lands on /en/writing", async ({ page }) => {
  await page.goto("/en/other");
  await expect(page).toHaveURL(/\/en\/writing$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Writing", exact: true }),
  ).toBeVisible();
});
