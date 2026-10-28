/**
 * robots.txt (WP4 §4.8). The indexable rules are whole lines, never bare path
 * literals, so the retired admin surface is named only inside a rule line.
 * Commission workflow pages are not disallowed: crawlers must fetch them to
 * read their noindex.
 */
const ROBOTS_INDEXABLE_LINES = [
  "User-agent: *",
  "Disallow: /admin",
  "Disallow: /api/",
  "Disallow: /language/",
  "Disallow: /studio",
] as const;

const ROBOTS_BLOCK_ALL_LINES = ["User-agent: *", "Disallow: /"] as const;

/** Exact output with `\n` line endings and a trailing newline. */
export function buildRobotsTxt({
  indexable,
  origin,
}: {
  indexable: boolean;
  origin: string;
}): string {
  const lines = indexable
    ? [...ROBOTS_INDEXABLE_LINES, "", `Sitemap: ${origin}/sitemap.xml`]
    : [...ROBOTS_BLOCK_ALL_LINES];
  return `${lines.join("\n")}\n`;
}
