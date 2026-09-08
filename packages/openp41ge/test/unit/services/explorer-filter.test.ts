/**
 * Unit tests for matchesNameFilter — the shared name/path filter used by the
 * Explorer search (repo names, worktree branches, file/dir names).
 */

import { describe, it, expect } from "vitest";
import { matchesNameFilter } from "../../../src/renderer/services/explorer-filter";

describe("matchesNameFilter", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesNameFilter("any.ts", "", false, false)).toBe(true);
    expect(matchesNameFilter("", "", false, false)).toBe(true);
  });

  it("matches a case-insensitive substring by default", () => {
    expect(matchesNameFilter("src/App.ts", "app", false, false)).toBe(true);
    expect(matchesNameFilter("src/App.ts", "APP", false, false)).toBe(true);
    expect(matchesNameFilter("src/App.ts", "zzz", false, false)).toBe(false);
  });

  it("honours caseSensitive", () => {
    expect(matchesNameFilter("src/App.ts", "app", false, true)).toBe(false);
    expect(matchesNameFilter("src/App.ts", "App", false, true)).toBe(true);
  });

  it("treats the query as a regex when regex is on", () => {
    expect(matchesNameFilter("src/App.ts", "^(src|lib)/", true, false)).toBe(true);
    expect(matchesNameFilter("src/App.ts", "\\.ts$", true, false)).toBe(true);
    expect(matchesNameFilter("src/App.ts", "^\\.ts$", true, false)).toBe(false);
  });

  it("escapes regex metacharacters when regex is off (literal substring)", () => {
    // "." should be a literal dot, not match any char.
    expect(matchesNameFilter("src/App.ts", "App.ts", false, false)).toBe(true);
    expect(matchesNameFilter("src/AppXts", "App.ts", false, false)).toBe(false);
  });

  it("returns false (never throws) for an invalid regex", () => {
    expect(matchesNameFilter("App.ts", "(", true, false)).toBe(false);
  });
});
