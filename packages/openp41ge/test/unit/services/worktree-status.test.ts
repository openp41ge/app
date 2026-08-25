import { describe, it, expect } from "vitest";
import {
  classifyWorktree,
  worstOf,
  worktreeStatusLabel,
} from "../../../src/renderer/services/worktree-status";

describe("classifyWorktree", () => {
  it("returns ok when in sync and present", () => {
    expect(classifyWorktree(0, 0, true)).toMatchObject({ state: "ok", ahead: 0, behind: 0, missing: false });
  });

  it("flags needs-sync when ahead or behind", () => {
    expect(classifyWorktree(3, 0, true)).toMatchObject({ state: "needs-sync", ahead: 3 });
    expect(classifyWorktree(0, 5, true)).toMatchObject({ state: "needs-sync", behind: 5 });
  });

  it("flags diverged when both ahead and behind", () => {
    expect(classifyWorktree(2, 4, true)).toMatchObject({ state: "diverged", ahead: 2, behind: 4 });
  });

  it("flags missing before divergence when folder absent", () => {
    expect(classifyWorktree(2, 4, false)).toMatchObject({ state: "missing", missing: true, ahead: 2, behind: 4 });
  });

  it("treats unknown as unknown when known is false", () => {
    expect(classifyWorktree(0, 0, true, false)).toMatchObject({ state: "unknown" });
  });

  it("clamps negative counters to zero", () => {
    expect(classifyWorktree(-1, -2, true)).toMatchObject({ state: "ok", ahead: 0, behind: 0 });
  });
});

describe("worstOf", () => {
  it("returns ok for no worktrees", () => {
    expect(worstOf([])).toMatchObject({ state: "ok" });
  });

  it("aggregates ahead/behind and keeps ok", () => {
    const info = worstOf([classifyWorktree(0, 0, true), classifyWorktree(0, 0, true)]);
    expect(info).toMatchObject({ state: "ok", ahead: 0, behind: 0 });
  });

  it("picks the worst state", () => {
    const info = worstOf([
      classifyWorktree(0, 0, true),
      classifyWorktree(2, 0, true),
      classifyWorktree(0, 1, true),
    ]);
    expect(info).toMatchObject({ state: "needs-sync", ahead: 2, behind: 1 });
  });

  it("missing outranks diverged outranks needs-sync", () => {
    expect(worstOf([classifyWorktree(1, 1, true), classifyWorktree(0, 0, false)])).toMatchObject({
      state: "missing",
      missing: true,
    });
    expect(worstOf([classifyWorktree(1, 1, true), classifyWorktree(3, 0, true)])).toMatchObject({
      state: "diverged",
    });
  });

  it("sums ahead/behind across worktrees", () => {
    const info = worstOf([classifyWorktree(1, 2, true), classifyWorktree(3, 0, true)]);
    expect(info).toMatchObject({ ahead: 4, behind: 2 });
  });
});

describe("worktreeStatusLabel", () => {
  it("describes each state", () => {
    expect(worktreeStatusLabel(classifyWorktree(0, 0, true))).toContain("In sync");
    expect(worktreeStatusLabel(classifyWorktree(2, 0, true))).toContain("2 ahead");
    expect(worktreeStatusLabel(classifyWorktree(2, 4, true))).toContain("Diverged");
    expect(worktreeStatusLabel(classifyWorktree(0, 0, false))).toContain("not checked out");
  });
});
