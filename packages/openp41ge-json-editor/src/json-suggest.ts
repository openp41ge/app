/**
 * json-suggest — key auto-completion analysis for the JSON editor.
 *
 * Given the full document text and a caret offset, these helpers decide whether
 * the caret is inside a key-position string (an empty `""` or a half-typed key
 * at the start of an object member line) and, if so, which OBJECT it belongs
 * to and what has been typed so far. The caller then combines that with the
 * config schema to offer the keys the user can still add.
 *
 * The functions are deliberately pure (no DOM, no component state) so they can
 * be unit-tested against raw JSON strings.
 */

import { schemaAtPath, schemaDescription } from "./json-tooltip";
import { getAt } from "./json-tree";
import type { JsonPath } from "./json-tree";

export interface KeyStringContext {
  /** Key path to the OBJECT that owns the key being typed. */
  ownerPath: JsonPath;
  /** Text typed so far between the opening quote and the caret (filter prefix). */
  prefix: string;
}

export interface KeySuggestion {
  key: string;
  description: string | null;
  /** The schema `type` of the property (normalized to a single string), if any. */
  type?: string;
  /** Optional display label (defaults to `key`). Used for free-form "new key"
   *  suggestions whose `key` is empty (the user types an arbitrary name). */
  label?: string;
}

/** Offsets of the double-quoted string that contains `pos`, or null when the
 *  caret is not inside a string. */
export function stringAt(text: string, pos: number): { open: number; close: number } | null {
  if (pos < 0) return null;
  let open = -1;
  let esc = false;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        if (pos > open && pos <= i) return { open, close: i };
        inStr = false;
        open = -1;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      open = i;
    }
  }
  return null;
}

/** Key path to the innermost OBJECT whose member region contains the start of
 *  the line beginning at `lineStart`. Scans the text up to (and excluding) that
 *  line start, tracking object/array nesting, the key that opened each object,
 *  and each array element's index. Returns null when the innermost owner is an
 *  array itself (there are no object keys there) or when a container along the
 *  path has no resolvable key/index. Array items that are objects resolve to a
 *  numeric path segment (their 0-based element index), so key suggestions also
 *  work inside them (e.g. each entry of a `models` array). */
export function ownerPathAt(text: string, lineStart: number): JsonPath | null {
  interface Frame {
    kind: "obj" | "arr";
    /** The object key that opened this container (null for array elements). */
    key: string | null;
    /** For containers that are array elements, their 0-based element index. */
    elemIndex: number | null;
    /** For array frames, how many elements have begun (drives elemIndex). */
    elems: number;
  }
  const stack: Frame[] = [];
  let pendingKey: string | null = null;
  let i = 0;
  while (i < lineStart) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < lineStart) {
        const cc = text[j];
        if (cc === "\\") {
          s += text[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (cc === '"') break;
        s += cc;
        j++;
      }
      // A string is a key only when a `:` follows it (ignoring whitespace).
      let k = j + 1;
      while (
        k < lineStart &&
        (text[k] === " " || text[k] === "\t" || text[k] === "\n" || text[k] === "\r")
      ) {
        k++;
      }
      const isKey = text[k] === ":";
      const topNow = stack[stack.length - 1];
      if (topNow && topNow.kind === "arr") topNow.elems++; // a bare string is an array element
      pendingKey = isKey ? s : null;
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") {
      const topNow = stack[stack.length - 1];
      // A container directly inside an array is that array's next element.
      const elemIndex = topNow && topNow.kind === "arr" ? topNow.elems++ : null;
      stack.push({ kind: c === "{" ? "obj" : "arr", key: pendingKey, elemIndex, elems: 0 });
      pendingKey = null;
      i++;
      continue;
    }
    if (c === "}") {
      if (stack.length) stack.pop();
      i++;
      continue;
    }
    if (c === "]") {
      if (stack.length) stack.pop();
      i++;
      continue;
    }
    if (c === ",") {
      pendingKey = null;
      i++;
      continue;
    }
    // A bare scalar (number / true / false / null) directly inside an array is
    // that array's next element; skip the rest of the literal so it counts once.
    const topNow = stack[stack.length - 1];
    if (
      topNow &&
      topNow.kind === "arr" &&
      ((c >= "0" && c <= "9") || c === "-" || c === "t" || c === "f" || c === "n")
    ) {
      topNow.elems++;
      let j = i + 1;
      while (j < lineStart && text[j] !== "," && text[j] !== "]" && !/\s/.test(text[j])) j++;
      i = j;
      continue;
    }
    i++;
  }
  const top = stack[stack.length - 1];
  if (!top || top.kind !== "obj") return null;
  const path: JsonPath = [];
  for (let n = 1; n < stack.length; n++) {
    const f = stack[n];
    if (f.elemIndex !== null) {
      path.push(f.elemIndex);
    } else if (f.key !== null) {
      path.push(f.key);
    } else {
      return null; // unkeyed container with no element index — ambiguous
    }
  }
  return path;
}

/** Detect whether `pos` sits inside a key-position string of an object member
 *  (the opening quote is the first non-whitespace token on its line) and, if
 *  so, return the owning object's key path plus the typed prefix.
 *
 *  A member that is already settled — i.e. a `:` follows the closing quote — is
 *  NOT a key being typed: clicking/selecting an existing `"key": value` must
 *  not offer the (re)creation list, which is only for an empty or in-progress
 *  key string. */
export function suggestContextAt(text: string, pos: number): KeyStringContext | null {
  if (pos < 0) return null;
  const s = stringAt(text, pos);
  if (!s) return null;
  const lineStart = text.lastIndexOf("\n", s.open - 1) + 1;
  const before = text.slice(lineStart, s.open);
  if (!/^[\t ]*$/.test(before)) return null;
  let k = s.close + 1;
  while (k < text.length && (text[k] === " " || text[k] === "\t")) k++;
  if (text[k] === ":") return null;
  const ownerPath = ownerPathAt(text, lineStart);
  if (!ownerPath) return null;
  const prefix = text.slice(s.open + 1, pos);
  return { ownerPath, prefix };
}

/** The schema keys the user can still add at `ownerPath`, excluding keys
 *  already present in the parsed object at that path, and filtered by the
 *  typed `prefix`. Empty when the schema has no `properties` there (or the
 *  owner is an array).
 *
 *  When the object is a free-form map (`additionalProperties`, no `properties`)
 *  — e.g. `Record<string, string>` — no key names are known, so for an empty
 *  prefix a single "new key" suggestion is returned so the user can still add
 *  an entry (it accepts into `"": <default>` with the caret in the key). */
export function collectKeySuggestions(
  schema: unknown,
  ownerPath: JsonPath,
  parsedValue: unknown,
  prefix: string,
): KeySuggestion[] {
  const objSchema = schemaAtPath(schema, ownerPath);
  const props =
    objSchema && typeof objSchema === "object"
      ? (objSchema as Record<string, unknown>).properties
      : undefined;
  if (!props || typeof props !== "object") {
    // Not a shape with known keys. Free-form map (`Record<string, V>`) objects
    // (an object with `additionalProperties`) offer a single "new key" entry so
    // the user can create an arbitrary key with the right value default. Only
    // shown on a fresh (empty) key — once the user types a character there's
    // nothing left to complete. Arrays have no keys, so they stay empty.
    const obj =
      objSchema && typeof objSchema === "object" ? (objSchema as Record<string, unknown>) : null;
    if (!obj || obj.type !== "object") return [];
    const ap = obj.additionalProperties;
    const apObj = ap && typeof ap === "object" ? (ap as Record<string, unknown>) : null;
    if (prefix !== "") return [];
    return [
      {
        key: "",
        label: "new key",
        description: "Add a new key (any name).",
        type: apObj ? normalizeType(apObj.type) : undefined,
      },
    ];
  }
  const cur = parsedValue == null ? undefined : getAt(parsedValue, ownerPath);
  const existing =
    cur && typeof cur === "object" && !Array.isArray(cur)
      ? new Set(Object.keys(cur as Record<string, unknown>))
      : new Set<string>();
  const p = prefix.toLowerCase();
  const entries = Object.entries(props as Record<string, unknown>);
  const out: KeySuggestion[] = [];
  for (const [k, v] of entries) {
    if (existing.has(k)) continue;
    if (p !== "" && !k.toLowerCase().startsWith(p)) continue;
    const prop = v as Record<string, unknown>;
    out.push({
      key: k,
      description: schemaDescription(v),
      type: normalizeType(prop?.type),
    });
  }
  return out;
}

/** Collapse a schema `type` (string or array-of-strings) to a single, preferred
 *  type name (skipping `null`). Returns undefined when unknown. */
function normalizeType(type: unknown): string | undefined {
  if (typeof type === "string") return type;
  if (Array.isArray(type)) {
    const t = type.find((x) => typeof x === "string" && x !== "null");
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
}

/** The default literal to pre-populate for an accepted key of `type`, plus
 *  whether the caret should park INSIDE the literal (string/array/object) or
 *  after it (number/boolean/null). Unknown types default to an empty string. */
export function defaultLiteralForType(type?: string): { value: string; inside: boolean } {
  switch (type) {
    case "number":
    case "integer":
      return { value: "0", inside: false };
    case "boolean":
      return { value: "false", inside: false };
    case "object":
      return { value: "{}", inside: true };
    case "array":
      return { value: "[]", inside: true };
    case "null":
      return { value: "null", inside: false };
    case "string":
    default:
      return { value: '""', inside: true };
  }
}
