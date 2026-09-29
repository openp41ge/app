import { describe, expect, it } from "vitest";
import {
  cloneDeep,
  sortJsonKeys,
  getAt,
  setAt,
  deleteEntry,
  renameKey,
  addEntry,
  insertEntry,
  isComposite,
  isArray,
  summarize,
  pathKey,
  pathFromKey,
  leafPaths,
  pinnedPaths,
  stripDefaults,
  mergeDefaults,
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

  it("sorts object keys recursively and keeps array order", () => {
    const v = {
      providerId: "vllm",
      providers: {
        vllm: {
          name: "vLLM",
          baseUrl: "http://x",
          defaultModel: "m",
          models: [{ contextWindow: 128000, id: "m" }],
        },
      },
    };
    expect(sortJsonKeys(v)).toEqual({
      providers: {
        vllm: {
          baseUrl: "http://x",
          defaultModel: "m",
          models: [{ contextWindow: 128000, id: "m" }],
          name: "vLLM",
        },
      },
      providerId: "vllm",
    });
  });

  it("sortJsonKeys does not mutate the input and preserves primitives/null", () => {
    const v = { z: 1, a: [3, { y: "2", x: "1" }], n: null };
    const out = sortJsonKeys(v);
    expect(out).toEqual({ a: [3, { x: "1", y: "2" }], n: null, z: 1 });
    expect(Object.keys(v)).toEqual(["z", "a", "n"]);
    expect(sortJsonKeys(42)).toBe(42);
    expect(sortJsonKeys(null)).toBe(null);
    expect(sortJsonKeys("s")).toBe("s");
  });
});

describe("stripDefaults / mergeDefaults", () => {
  const DEFAULTS = {
    appTheme: "dark",
    lineHeight: 20,
    fontSize: 14,
    editor: { fontFamily: "mono", maxFileSize: 100 },
  };

  it("stripDefaults drops leaves equal to the default", () => {
    const effective = { appTheme: "dark", lineHeight: 24, fontSize: 14 };
    expect(stripDefaults(effective, DEFAULTS)).toEqual({ lineHeight: 24 });
  });

  it("stripDefaults prunes nested objects that are entirely at default", () => {
    const effective = { ...DEFAULTS, lineHeight: 30 };
    const stripped = stripDefaults(effective, DEFAULTS);
    expect(stripped).toEqual({ lineHeight: 30 });
    expect(stripped).not.toHaveProperty("editor");
  });

  it("stripDefaults keeps nested overrides", () => {
    const effective = { ...DEFAULTS, editor: { fontFamily: "mono", maxFileSize: 500 } };
    expect(stripDefaults(effective, DEFAULTS)).toEqual({ editor: { maxFileSize: 500 } });
  });

  it("mergeDefaults fills defaults and overlays overrides", () => {
    const merged = mergeDefaults({ lineHeight: 30 }, DEFAULTS);
    expect(merged).toEqual({ ...DEFAULTS, lineHeight: 30 });
  });

  it("stripDefaults and mergeDefaults are inverse", () => {
    const effective = {
      ...DEFAULTS,
      appTheme: "light",
      lineHeight: 22,
      editor: { ...DEFAULTS.editor, maxFileSize: 9 },
    };
    const overrides = stripDefaults(effective, DEFAULTS);
    expect(mergeDefaults(overrides!, DEFAULTS)).toEqual(effective);
  });
});

describe("explicit / pinned paths", () => {
  const DEFAULTS = {
    appTheme: "dark",
    lineHeight: 20,
    editor: { fontFamily: "mono", maxFileSize: 100 },
  };

  it("pathKey encodes array indices and pathFromKey reverses it", () => {
    expect(pathKey(["a", "b", 1, "c"])).toBe("a.b[1].c");
    expect(pathFromKey("a.b[1].c")).toEqual(["a", "b", 1, "c"]);
    expect(pathFromKey("")).toEqual([]);
  });

  it("leafPaths collects every leaf path", () => {
    const v = { a: 1, b: { c: "x", d: [1, 2] } };
    expect([...leafPaths(v)].sort()).toEqual(["a", "b.c", "b.d[0]", "b.d[1]"]);
  });

  it("pinnedPaths finds leaves equal to their default", () => {
    const overrides = { appTheme: "dark", lineHeight: 25, editor: { maxFileSize: 100 } };
    expect([...pinnedPaths(overrides, DEFAULTS)].sort()).toEqual([
      "appTheme",
      "editor.maxFileSize",
    ]);
  });

  it("stripDefaults keeps a pinned path even when it equals the default", () => {
    const effective = { appTheme: "dark", lineHeight: 25 };
    const pins = new Set(["appTheme"]);
    expect(stripDefaults(effective, DEFAULTS, pins)).toEqual({ appTheme: "dark", lineHeight: 25 });
  });

  it("stripDefaults keeps a pinned whole subtree verbatim", () => {
    const effective = { ...DEFAULTS, lineHeight: 30 };
    const pins = new Set(["editor"]);
    expect(stripDefaults(effective, DEFAULTS, pins)).toEqual({
      editor: DEFAULTS.editor,
      lineHeight: 30,
    });
  });

  it("stripDefaults drops unpinned default leaves and a pinned one stays after re-merge", () => {
    const effective = { ...DEFAULTS, lineHeight: 25 };
    const pins = new Set(["editor.maxFileSize"]);
    const overrides = stripDefaults(effective, DEFAULTS, pins)!;
    expect(overrides).toEqual({ lineHeight: 25, editor: { maxFileSize: 100 } });
    expect(pinnedPaths(overrides, DEFAULTS)).toEqual(new Set(["editor.maxFileSize"]));
  });
});
