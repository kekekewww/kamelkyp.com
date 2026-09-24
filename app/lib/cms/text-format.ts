/**
 * Formatted text (client-safe, content-schema §2.2): plain text, a blank line
 * starts a new paragraph, lines starting with "- " form a bulleted list. No
 * HTML, no Markdown links. Used by public pages and the preview alike.
 */

export type FormattedBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const LIST_ITEM = /^-\s+(.*)$/;

export function parseFormattedText(
  input: string | null | undefined,
): FormattedBlock[] {
  const blocks: FormattedBlock[] = [];
  const normalized = (input ?? "").replace(/\r\n?/g, "\n");

  for (const chunk of normalized.split(/\n\s*\n/)) {
    let paragraph: string[] = [];
    let list: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", text: paragraph.join("\n") });
        paragraph = [];
      }
    };
    const flushList = () => {
      if (list.length > 0) {
        blocks.push({ type: "list", items: list });
        list = [];
      }
    };

    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const item = LIST_ITEM.exec(line);
      if (item) {
        flushParagraph();
        const text = item[1]?.trim() ?? "";
        if (text) list.push(text);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
  }

  return blocks;
}

/** Plain text with list markers removed (search snippets, meta descriptions). */
export function formattedTextToPlain(input: string | null | undefined): string {
  return parseFormattedText(input)
    .map((block) =>
      block.type === "paragraph" ? block.text : block.items.join(" · "),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
