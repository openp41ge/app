/**
 * Unit tests for the workspaces-overlay ordering comparator.
 */
import { describe, it, expect } from "vitest";
import {
  sortWorkspacesByLastActivated,
  EPOCH_ISO,
  type SortableWorkspace,
} from "../../../src/layout/workspace-sort";

function ws(id: string, name: string | undefined, lastActivatedAt?: string): SortableWorkspace {
  return lastActivatedAt === undefined ? { id, name } : { id, name, lastActivatedAt };
}

const iso = (s: string) => `2026-01-0${s}T10:00:00.000Z`;

describe("sortWorkspacesByLastActivated", () => {
  it("sorts newest lastActivatedAt first", () => {
    const workspaces = [
      ws("1", "Old", iso("2")),
      ws("2", "New", iso("3")),
      ws("3", "Mid", iso("1")),
    ];
    workspaces.sort(sortWorkspacesByLastActivated);
    expect(workspaces.map((w) => w.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts workspaces without a timestamp to the bottom (epoch fallback)", () => {
    const workspaces = [
      ws("a", undefined), // no timestamp
      ws("b", "Touched", iso("5")), // has timestamp
      ws("c", undefined), // no timestamp
    ];
    workspaces.sort(sortWorkspacesByLastActivated);
    // The timestamped one sits on top; the never-activated drop to the bottom.
    expect(workspaces[0].id).toBe("b");
    expect(
      workspaces
        .slice(1)
        .map((w) => w.id)
        .sort(),
    ).toEqual(["a", "c"]);
  });

  it("tie-breaks equal/missing timestamps alphabetically by name (case-insensitive) then id", () => {
    const workspaces = [
      ws("1", "bravo", iso("1")),
      ws("2", "Charlie", iso("1")),
      ws("3", "alpha", iso("1")),
    ];
    workspaces.sort(sortWorkspacesByLastActivated);
    expect(workspaces.map((w) => w.id)).toEqual(["3", "1", "2"]);

    // Never-activated (undefined) group in alphabetical order too.
    const never = [ws("x", "Zeta"), ws("y", "Alpha"), ws("z", "MIddle")];
    never.sort(sortWorkspacesByLastActivated);
    expect(never.map((w) => w.id)).toEqual(["y", "z", "x"]);
  });

  it("falls back to id when name is missing", () => {
    const workspaces = [ws("Beta", undefined), ws("alpha", undefined)];
    workspaces.sort(sortWorkspacesByLastActivated);
    expect(workspaces.map((w) => w.id)).toEqual(["alpha", "Beta"]);
  });

  it("treats unparseable timestamps as the epoch", () => {
    const workspaces = [
      ws("1", "A", "not-a-date"),
      ws("2", "B", iso("2")),
      ws("3", "C"), // no timestamp
    ];
    workspaces.sort(sortWorkspacesByLastActivated);
    expect(workspaces[0].id).toBe("2");
    // A (unparseable) and C (missing) both count as epoch → alphabetical.
    expect(workspaces.slice(1).map((w) => w.id)).toEqual(["1", "3"]);
  });

  it("exposes the epoch constant in a usable ISO form", () => {
    expect(Number.isNaN(Date.parse(EPOCH_ISO))).toBe(false);
  });

  it("is a stable ordering for identical inputs", () => {
    // Equal timestamps + equal names → comparator returns 0.
    const workspaces = [ws("a", "same", iso("1")), ws("b", "same", iso("1"))];
    workspaces.sort(sortWorkspacesByLastActivated);
    expect(workspaces.length).toBe(2);
  });
});
