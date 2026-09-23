/**
 * json-tree — pure helpers for walking and mutating a JSON value tree.
 *
 * All functions mutate the passed value in place (the caller owns a private
 * deep clone) and/or read from it. Kept DOM-free so they can be unit tested
 * without a component instance.
 */

export type JsonPath = Array<string | number>;

export function isComposite(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Encode a path as a stable Map key. */
export function encodePath(path: JsonPath): string {
  return JSON.stringify(path);
}

/** Deep clone a JSON value. `undefined` passes through so a missing
 * sub-object doesn't crash the editor. */
export function cloneDeep<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Read the value at a path (or undefined if the path doesn't resolve). */
export function getAt(value: unknown, path: JsonPath): unknown {
  let cur = value;
  for (const seg of path) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      cur = cur[seg as number];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg as string];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Set the value at a path (mutates in place). */
export function setAt(value: unknown, path: JsonPath, newValue: unknown): void {
  if (path.length === 0) return;
  const parent = getAt(value, path.slice(0, -1));
  const last = path[path.length - 1];
  if (parent == null || typeof parent !== "object") return;
  if (Array.isArray(parent)) {
    parent[last as number] = newValue;
  } else {
    (parent as Record<string, unknown>)[last as string] = newValue;
  }
}

/** Delete an entry from the parent object/array at `parentPath`, removing the
 * entry whose key/index is `key`. Mutates in place. */
export function deleteEntry(value: unknown, parentPath: JsonPath, key: string | number): void {
  const parent = getAt(value, parentPath);
  if (parent == null || typeof parent !== "object") return;
  if (Array.isArray(parent)) {
    parent.splice(key as number, 1);
  } else {
    delete (parent as Record<string, unknown>)[key as string];
  }
}

/** Rename an object key (parentPath + oldKey -> newKey). Mutates in place. */
export function renameKey(
  value: unknown,
  parentPath: JsonPath,
  oldKey: string,
  newKey: string,
): void {
  const parent = getAt(value, parentPath);
  if (parent == null || typeof parent !== "object" || Array.isArray(parent)) return;
  const obj = parent as Record<string, unknown>;
  if (!(oldKey in obj) || oldKey === newKey) return;
  const v = obj[oldKey];
  delete obj[oldKey];
  obj[newKey] = v;
}

/** Add a new entry to an object or array at `path`. Mutates in place.
 * For objects, `key` is used (or a generated `newKey`). For arrays, pushes
 * `value` (or null). Returns the key/index of the added entry. */
export function addEntry(
  value: unknown,
  path: JsonPath,
  opts: { key?: string; value?: unknown } = {},
): string | number {
  const target = getAt(value, path);
  if (target == null || typeof target !== "object") return -1;
  if (Array.isArray(target)) {
    target.push(opts.value !== undefined ? opts.value : null);
    return target.length - 1;
  }
  const obj = target as Record<string, unknown>;
  const key = opts.key !== undefined ? opts.key : nextObjectKey(obj);
  obj[key] = opts.value !== undefined ? opts.value : "";
  return key;
}

/** Insert a new entry into an object or array at `parentPath`, placed after the
 * sibling identified by `after` (an object key, or an array index).
 * `after === null` inserts at the start. Mutates in place. Returns the new key
 * (object) or index (array). */
export function insertEntry(
  value: unknown,
  parentPath: JsonPath,
  after: string | number | null,
  opts: { key?: string; value?: unknown } = {},
): string | number {
  const target = getAt(value, parentPath);
  if (target == null || typeof target !== "object") return -1;
  if (Array.isArray(target)) {
    const idx = after === null ? 0 : Number(after) + 1;
    target.splice(idx, 0, opts.value !== undefined ? opts.value : null);
    return idx;
  }
  const obj = target as Record<string, unknown>;
  const key = opts.key !== undefined ? opts.key : nextObjectKey(obj);
  const newVal = opts.value !== undefined ? opts.value : "";
  const ordered: Array<[string, unknown]> = [];
  let inserted = false;
  for (const [k, v] of Object.entries(obj)) {
    ordered.push([k, v]);
    if (after !== null && k === after && !inserted) {
      ordered.push([key, newVal]);
      inserted = true;
    }
  }
  if (!inserted) {
    if (after === null) ordered.unshift([key, newVal]);
    else ordered.push([key, newVal]);
  }
  // Rebuild the object in place with the new ordering (preserves identity).
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of ordered) obj[k] = v;
  return key;
}

/** Generate a unique `newKey`-style key for an object. */
export function nextObjectKey(obj: Record<string, unknown>): string {
  const base = "newKey";
  let key = base;
  let n = 2;
  while (key in obj) {
    key = `${base}${n}`;
    n++;
  }
  return key;
}

/** A short one-line preview of a composite value for collapsed rows. */
/** A short one-line type summary of a composite value for collapsed rows (the
 *  surrounding braces are rendered by the row). e.g. “4 properties · 2 strings ·
 *  1 object”. Only non-zero type counts are listed. */
export function summarize(value: Record<string, unknown> | unknown[]): string {
  const entries = Array.isArray(value) ? value : Object.values(value);
  const counts = { string: 0, number: 0, boolean: 0, object: 0, array: 0, null: 0 };
  for (const v of entries) {
    if (v === null) counts.null++;
    else if (Array.isArray(v)) counts.array++;
    else if (typeof v === "object") counts.object++;
    else if (typeof v === "string") counts.string++;
    else if (typeof v === "number") counts.number++;
    else if (typeof v === "boolean") counts.boolean++;
  }
  const parts: string[] = [];
  if (Array.isArray(value)) {
    parts.push(`${entries.length} item${entries.length === 1 ? "" : "s"}`);
  } else {
    parts.push(`${entries.length} propert${entries.length === 1 ? "y" : "ies"}`);
  }
  if (counts.string) parts.push(`${counts.string} string${counts.string === 1 ? "" : "s"}`);
  if (counts.number) parts.push(`${counts.number} number${counts.number === 1 ? "" : "s"}`);
  if (counts.boolean) parts.push(`${counts.boolean} boolean${counts.boolean === 1 ? "" : "s"}`);
  if (counts.object) parts.push(`${counts.object} object${counts.object === 1 ? "" : "s"}`);
  if (counts.array) parts.push(`${counts.array} arra${counts.array === 1 ? "y" : "ys"}`);
  if (counts.null) parts.push(`${counts.null} null${counts.null === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

