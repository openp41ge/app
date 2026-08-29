/**
 * Unit tests for FileSizeGate — the editor open-size threshold.
 *
 * The platform shows a "too large" message (and never reads the file) when a
 * file exceeds editor.maxFileSize. This pins the pure decision invoked by
 * FileEditorController before any read.
 */
import { describe, test, expect } from "vitest";
import {
  shouldOpenFile,
  DEFAULT_EDITOR_MAX_FILE_SIZE,
} from "@openp41ge/renderer/models/file-size-gate";

describe("shouldOpenFile", () => {
  test("default limit is 50 MB", () => {
    expect(DEFAULT_EDITOR_MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
  });

  test("files at or under the limit open", () => {
    expect(shouldOpenFile(1000, 50 * 1024 * 1024)).toBe(true);
    expect(shouldOpenFile(50 * 1024 * 1024, 50 * 1024 * 1024)).toBe(true); // equality allowed
    expect(shouldOpenFile(49 * 1024 * 1024, 50 * 1024 * 1024)).toBe(true);
  });

  test("files over the limit are blocked (message, never opened)", () => {
    expect(shouldOpenFile(50 * 1024 * 1024 + 1, 50 * 1024 * 1024)).toBe(false);
    expect(shouldOpenFile(120 * 1024 * 1024, 50 * 1024 * 1024)).toBe(false);
  });

  test("a missing limit falls back to the 50 MB default", () => {
    expect(shouldOpenFile(10 * 1024 * 1024, undefined)).toBe(true);
    expect(shouldOpenFile(60 * 1024 * 1024, undefined)).toBe(false);
    expect(shouldOpenFile(60 * 1024 * 1024, null)).toBe(false);
  });

  test("a missing size (stat unavailable) is allowed — existing load/error path handles it", () => {
    expect(shouldOpenFile(undefined, 50 * 1024 * 1024)).toBe(true);
    expect(shouldOpenFile(null, 50 * 1024 * 1024)).toBe(true);
  });

  test("a custom limit is honoured", () => {
    expect(shouldOpenFile(2 * 1024 * 1024, 1 * 1024 * 1024)).toBe(false);
    expect(shouldOpenFile(1024, 1 * 1024 * 1024)).toBe(true);
  });
});
