import { expect, test } from "@playwright/test";

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
  // Lowest catalog base price per group: Vocal mix / Simple transition.
  await expect(main.getByText("NT$4,000")).toBeVisible();
  await expect(main.getByText("NT$1,000")).toBeVisible();
  await expect(main.getByText("依專案報價")).toBeVisible();
  // Overview names groups only; individual services live on detail pages.
  await expect(main.getByText("完整歌曲混音")).toHaveCount(0);
  await expect(main.getByText("單純歌曲銜接")).toHaveCount(0);
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

  const contact = page.locator("#contact");
  await expect(
    contact.getByRole("heading", { name: "Tell me about your project" }),
  ).toBeVisible();
  const email = contact.getByRole("link", { name: "Email me" });
  await expect(email).toHaveAttribute(
    "href",
    /^mailto:kevinyaungputra@gmail\.com\?subject=/,
  );
  const box = await email.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(contact.getByText("kevinyaungputra@gmail.com")).toBeVisible();
});

test("about page has one h1 and never shows the real name", async ({
  page,
}) => {
  await page.goto("/zh/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "關於", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("楊子賢")).toHaveCount(0);
});

test("writing index shows placeholder entries without links", async ({
  page,
}) => {
  await page.goto("/en/writing");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Writing", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", {
      name: "Sample: Why I Build Tools Instead of Just Using Them",
    }),
  ).toBeVisible();
  await expect(main.getByText("PLACEHOLDER").first()).toBeVisible();
  await expect(main.getByText("Link pending").first()).toBeVisible();
});

test("legacy /en/other lands on /en/writing", async ({ page }) => {
  await page.goto("/en/other");
  await expect(page).toHaveURL(/\/en\/writing$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Writing", exact: true }),
  ).toBeVisible();
});
