import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  StudioErrorView,
  studioErrorCopy,
} from "../../app/components/studio/error-view";

function render(status: number, signInHref?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StudioErrorView status={status} signInHref={signInHref} />
    </MemoryRouter>,
  );
}

describe("Studio error copy", () => {
  it("picks the sign-in copy for 403", () => {
    expect(studioErrorCopy(403).title).toBe("Sign in to open the Studio");
  });

  it("keeps the 404 and generic copy", () => {
    expect(studioErrorCopy(404).title).toBe("This Studio page does not exist");
    expect(studioErrorCopy(500).title).toBe("Something went wrong");
  });
});

describe("Studio error view", () => {
  it("shows the generic 500 view with an in-app link home", () => {
    const html = render(500);
    expect(html).toContain("500 / KAMEL STUDIO");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Back to Studio home");
    expect(html).not.toContain("Sign in again");
  });

  it("shows the sign-in view as a full-page link back to the attempted page", () => {
    const html = render(403, "/studio/homepage?tab=hero");
    expect(html).toContain("Sign in to open the Studio");
    expect(html).toContain("Cloudflare Access");
    expect(html).toContain('href="/studio/homepage?tab=hero"');
    expect(html).toContain("Sign in again");
  });

  it("falls back to /studio for a real route 403", () => {
    const html = render(403);
    expect(html).toContain('href="/studio"');
    expect(html).toContain("Sign in again");
  });
});
