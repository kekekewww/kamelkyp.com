/**
 * FormData → plain object (client-safe) for Studio editors.
 *
 * Field names are dotted paths (`title.zh`, `gallery.0.assetId`); numeric
 * segments become array indexes. A typed suffix converts the value:
 *   `year:number`  "" → null, else Number (NaN → null)
 *   `listed:bool`  last value wins; "true" | "on" | "1" → true
 *   `tools:json`   JSON.parse, invalid → null
 * `csrfToken` is dropped (it is auth, not content) and prototype keys are
 * refused. The result feeds each model's draft schema, which does the real
 * validation.
 */

type Suffix = "number" | "bool" | "json";
type Tree = Record<string, unknown>;

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const SKIPPED_FIELDS = new Set(["csrfToken"]);
const INDEX = /^(0|[1-9][0-9]{0,3})$/;

function splitName(name: string): { path: string[]; suffix: Suffix | null } {
  const colon = name.lastIndexOf(":");
  let suffix: Suffix | null = null;
  let base = name;
  if (colon > 0) {
    const candidate = name.slice(colon + 1);
    if (
      candidate === "number" ||
      candidate === "bool" ||
      candidate === "json"
    ) {
      suffix = candidate;
      base = name.slice(0, colon);
    }
  }
  return { path: base.split("."), suffix };
}

function convert(values: string[], suffix: Suffix | null): unknown {
  const last = values[values.length - 1] ?? "";
  switch (suffix) {
    case "number": {
      if (last.trim() === "") return null;
      const number = Number(last);
      return Number.isFinite(number) ? number : null;
    }
    case "bool":
      return ["true", "on", "1"].includes(last);
    case "json":
      try {
        return JSON.parse(last);
      } catch {
        return null;
      }
    default:
      return last;
  }
}

function assign(tree: Tree, path: string[], value: unknown) {
  let node: Tree = tree;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      node[segment] = value;
      return;
    }
    const next = node[segment];
    if (!next || typeof next !== "object") {
      const child: Tree = Object.create(null);
      node[segment] = child;
      node = child;
    } else {
      node = next as Tree;
    }
  });
}

/** Objects whose keys are all indexes become arrays (ordered, compacted). */
function normalize(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Tree;
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => INDEX.test(key))) {
    return keys
      .map(Number)
      .sort((a, b) => a - b)
      .map((key) => normalize(record[String(key)]));
  }
  const result: Tree = {};
  for (const key of keys) result[key] = normalize(record[key]);
  return result;
}

export function formDataToObject(formData: FormData): Record<string, unknown> {
  const grouped = new Map<string, string[]>();
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const values = grouped.get(name) ?? [];
    values.push(value);
    grouped.set(name, values);
  }

  const tree: Tree = Object.create(null);
  for (const [name, values] of grouped) {
    if (SKIPPED_FIELDS.has(name)) continue;
    const { path, suffix } = splitName(name);
    if (path.some((segment) => !segment || FORBIDDEN_SEGMENTS.has(segment))) {
      continue;
    }
    assign(tree, path, convert(values, suffix));
  }
  return normalize(tree) as Record<string, unknown>;
}

export function readIntent(formData: FormData): string | null {
  const intent = formData.get("intent");
  return typeof intent === "string" && intent ? intent : null;
}

export function readString(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/** `expectedRevision` hidden field; null when missing or not an integer ≥ 0. */
export function readExpectedRevision(formData: FormData): number | null {
  const raw = formData.get("expectedRevision");
  if (typeof raw !== "string" || !/^[0-9]{1,9}$/.test(raw)) return null;
  return Number(raw);
}
