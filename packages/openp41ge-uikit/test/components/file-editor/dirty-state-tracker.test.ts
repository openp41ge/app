/**
 * Unit tests for VersionBasedDirtyTracker (Phase 1B of the large-file-performance plan).
 *
 * Replaces `_savedContent = model.getValue()` + full-string comparison on every
 * keystroke with a comparison of version IDs — O(1) instead of O(n).
 *
 * Correctness relies on the model restoring `versionId` on undo/redo
 * (see openp41ge-editor-engine/test/unit/model/version-id.test.ts).
 */
import { describe, test, expect } from "vitest";
import { VersionBasedDirtyTracker } from "../../../src/components/file-editor/dirty-state-tracker";

describe("VersionBasedDirtyTracker", () => {
  test("not dirty before any save baseline is established", () => {
    const t = new VersionBasedDirtyTracker();
    expect(t.isDirty).toBe(false);
  });

  test("becomes dirty after the content version moves away from the saved version", () => {
    const t = new VersionBasedDirtyTracker();
    t.markSaved(5);
    expect(t.notifyContentChanged(6)).toBe(true);
    expect(t.isDirty).toBe(true);
  });

  test("stays clean when the version returns to the saved version (undo-to-clean)", () => {
    const t = new VersionBasedDirtyTracker();
    t.markSaved(5);
    t.notifyContentChanged(6);
    expect(t.isDirty).toBe(true);
    expect(t.notifyContentChanged(5)).toBe(false);
    expect(t.isDirty).toBe(false);
  });

  test("markSaved at the current version reports clean again", () => {
    const t = new VersionBasedDirtyTracker();
    t.markSaved(10);
    t.notifyContentChanged(11);
    expect(t.isDirty).toBe(true);
    t.markSaved(11);
    expect(t.isDirty).toBe(false);
  });

  test("a dirty file that is edited again stays dirty (version keeps growing)", () => {
    const t = new VersionBasedDirtyTracker();
    t.markSaved(7);
    t.notifyContentChanged(8);
    expect(t.isDirty).toBe(true);
    t.notifyContentChanged(9);
    expect(t.isDirty).toBe(true);
  });

  test("reset clears both the baseline and the current version", () => {
    const t = new VersionBasedDirtyTracker();
    t.markSaved(3);
    t.notifyContentChanged(4);
    t.reset();
    expect(t.isDirty).toBe(false);
    // After reset a fresh baseline must be re-established.
    t.notifyContentChanged(4);
    expect(t.isDirty).toBe(false);
  });
});
