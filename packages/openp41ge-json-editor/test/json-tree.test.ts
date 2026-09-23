import { describe, expect, it } from "vitest";
import {
  cloneDeep,
  getAt,
  setAt,
  deleteEntry,
  renameKey,
  addEntry,
  insertEntry,
  isComposite,
  isArray,
  summarize,
} from "../src/json-tree";

describe("json-tree helpers", () => {
  it("gets and sets nested paths", () => {
    const v = { a: { b: [1, 2, { c: "x" }] } };
    expect(getAt(v, ["a", "b", 2, "c"])).toBe("x");
    setAt(v, ["a", "b", 2, "c"], "y");
    expect(v.a.b[2].c).toBe("y");
  });

  it("deletes entries from objects and arrays", () => {
    const v = { a: 1, b: 2, arr: [1, 2, 3] };
    deleteEntry(v, [], "a");
    expect(v).not.toHaveProperty("a");
    deleteEntry(v, ["arr"], 1);
    expect(v.arr).toEqual([1, 3]);
  });

  it("renames object keys in place", () => {
    const v = { name: "x", other: "y" };
    renameKey(v, [], "name", "title");
    expect(v).toEqual({ title: "x", other: "y" });
  });

  it("adds entries to arrays and objects", () => {
    const arr: unknown[] = [];
    const idx = addEntry(arr, [], { value: 5 });
    expect(idx).toBe(0);
    expect(arr).toEqual([5]);

    const obj: Record<string, unknown> = {};
    const k = addEntry(obj, []);
    expect(k).toBe("newKey");
    expect(obj).toEqual({ newKey: "" });
  });

  it("generates unique object keys", () => {
    const obj: Record<string, unknown> = { newKey: 1 };
    const k = addEntry(obj, []);
    expect(k).toBe("newKey2");
  });

  it("inserts an array element at a position", () => {
    const arr = ["a", "c"];
    const idx = insertEntry(arr, [], 0, { value: "b" });
    expect(idx).toBe(1);
    expect(arr).toEqual(["a", "b", "c"]);
    const i0 = insertEntry(arr, [], null, { value: "start" });
    expect(i0).toBe(0);
    expect(arr).toEqual(["start", "a", "b", "c"]);
  });

  it("inserts an object key after a sibling", () => {
    const obj = { a: 302, c: 465 };
    const k = insertEntry(obj, [], "a");
    expect(k).toBe("newKey");
    expect(Object.keys(obj)).toEqual(["a", "newKey", "c"]);
    expect(obj.newKey).toBe("");
  });

  it("inserts an object key at the start when after is null", () => {
    const obj = { a: 305, b: 505 };
    insertEntry(obj, [], null, { key: "x", value: 0 });
    expect(Object.keys(obj)).toEqual(["x", "a", "b"]);
    expect(obj.x).toBe(0);
  });

    it("summarizes collapsed composites by type", () => {
    const s = summarize({ a: 1, b: "x", c: true, d: [], e: null, f: {} });
    expect(s).toContain("6 properties");
    expect(s).toContain("1 string");
    expect(s).toContain("1 number");
    expect(s).toContain("1 boolean");
    expect(s).toContain("1 array");
    expect(s).toContain("1 null");
    expect(s).toContain("1 object");
  });
it("summarizes collapsed composite values", () => {
    expect(summarize({ baseUrl: "x", model: "y" })).toContain("2 properties");
    expect(summarize({ baseUrl: "x", model: "y" })).toContain("2 strings");
    expect(summarize([1, 28, 75])).toContain("3 items");
    expect(summarize([1, 547, 66])).toContain("3 numbers");
  });

  it("classifies composites", () => {
    expect(isComposite({})).toBe(true);
    expect(isComposite([])).toBe(true);
    expect(isComposite(null)).toBe(false);
    expect(isComposite("x")).toBe(false);
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
  });

  it("clones deeply", () => {
    const v = { a: { b: [1, 2] } };
    const c = cloneDeep(v);
    c.a.b.push(3);
    expect(v.a.b).toEqual([1, 2]);
  });
});
