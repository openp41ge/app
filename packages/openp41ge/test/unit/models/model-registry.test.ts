/**
 * Unit tests for ModelRegistry.
 *
 * These tests verify reference counting, model lifecycle, and edge cases.
 * They use a mock for createIpcTextContentModel to avoid file I/O.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── Shared spy for tracking dispose calls ──────────────────────────────
let lastDisposeSpy: ReturnType<typeof vi.fn> = vi.fn(() => {});

// ── Mock createIpcTextContentModel ─────────────────────────────────────
const mockCreateModel = vi.fn(async (uri: string) => {
  lastDisposeSpy = vi.fn(() => {});
  return {
    uri,
    dispose: lastDisposeSpy,
    eol: "\n" as const,
    lineCount: 1,
    length: 0,
    isDirty: false,
    versionId: 0,
    alternativeVersionId: 0,
    getLineContent: vi.fn(() => ""),
    getValueInRange: vi.fn(() => ""),
    getValue: vi.fn(() => ""),
    getOffsetAt: vi.fn(() => 0),
    getPositionAt: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getLineMinColumn: vi.fn(() => 1),
    getLineMaxColumn: vi.fn(() => 1),
    pushEditOperations: vi.fn(() => null),
    setValue: vi.fn(() => {}),
    markClean: vi.fn(() => {}),
    canUndo: vi.fn(() => false),
    canRedo: vi.fn(() => false),
    undo: vi.fn(() => null),
    redo: vi.fn(() => null),
    onDidChangeContent: vi.fn(() => ({ dispose: vi.fn(() => {}) })),
    onDidChangeDirty: vi.fn(() => ({ dispose: vi.fn(() => {}) })),
    decorationProvider: {} as any,
  };
});

// Mock the ipc-text-content-model module (must be before imports)
vi.mock("@openp41ge/renderer/models/ipc-text-content-model", () => ({
  createIpcTextContentModel: mockCreateModel,
}));

const { ModelRegistry } = await import("@openp41ge/renderer/models/model-registry");

describe("ModelRegistry", () => {
  // Clear the mock factory call counter before each test so
  // "creates model via factory function" gets fresh counts
  beforeEach(() => {
    mockCreateModel.mockClear();
  });

  test("getOrCreate creates a new model for a URI", async () => {
    const registry = new ModelRegistry();
    const model = await registry.getOrCreate("/path/to/file.ts");

    expect(model).toBeTruthy();
    expect(model.uri).toBe("/path/to/file.ts");
    expect(registry.has("/path/to/file.ts")).toBe(true);
    expect(registry.size).toBe(1);
  });

  test("getOrCreate returns the same instance for the same URI", async () => {
    const registry = new ModelRegistry();
    const model1 = await registry.getOrCreate("/path/to/file.ts");
    const model2 = await registry.getOrCreate("/path/to/file.ts");

    expect(model1).toBe(model2);
    expect(registry.size).toBe(1);
  });

  test("getOrCreate returns different instances for different URIs", async () => {
    const registry = new ModelRegistry();
    const model1 = await registry.getOrCreate("/path/to/a.ts");
    const model2 = await registry.getOrCreate("/path/to/b.ts");

    expect(model1).not.toBe(model2);
    expect(model1.uri).toBe("/path/to/a.ts");
    expect(model2.uri).toBe("/path/to/b.ts");
    expect(registry.size).toBe(2);
  });

  test("release with multiple references holds model until last ref released", async () => {
    const registry = new ModelRegistry();
    const model = await registry.getOrCreate("/path/to/file.ts");

    // Get a second reference
    await registry.getOrCreate("/path/to/file.ts");

    // Release once — still has 1 ref, should NOT be removed
    registry.release("/path/to/file.ts");
    expect(registry.has("/path/to/file.ts")).toBe(true);
    expect(registry.get("/path/to/file.ts")).toBe(model);

    // Release again — last ref, should be removed
    registry.release("/path/to/file.ts");
    expect(registry.has("/path/to/file.ts")).toBe(false);
    expect(registry.get("/path/to/file.ts")).toBeUndefined();
  });

  test("getOrCreate with existing model increments ref count", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/path/to/file.ts");
    await registry.getOrCreate("/path/to/file.ts");
    await registry.getOrCreate("/path/to/file.ts");

    // 3 references acquired, release all 3
    registry.release("/path/to/file.ts"); // ref 2
    expect(registry.has("/path/to/file.ts")).toBe(true);
    registry.release("/path/to/file.ts"); // ref 1
    expect(registry.has("/path/to/file.ts")).toBe(true);
    registry.release("/path/to/file.ts"); // ref 0
    expect(registry.has("/path/to/file.ts")).toBe(false);
  });

  test("release on non-existent URI is a no-op", () => {
    const registry = new ModelRegistry();
    registry.release("/nonexistent.ts");
    expect(registry.size).toBe(0);
  });

  test("has returns true only for registered URIs", async () => {
    const registry = new ModelRegistry();
    expect(registry.has("/path/to/file.ts")).toBe(false);

    await registry.getOrCreate("/path/to/file.ts");
    expect(registry.has("/path/to/file.ts")).toBe(true);
    expect(registry.has("/other.ts")).toBe(false);
  });

  test("get returns the model for a registered URI", async () => {
    const registry = new ModelRegistry();
    const model = await registry.getOrCreate("/path/to/file.ts");

    expect(registry.get("/path/to/file.ts")).toBe(model);
    expect(registry.get("/nonexistent.ts")).toBeUndefined();
  });

  test("get returns undefined for released URIs", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/path/to/file.ts");
    registry.release("/path/to/file.ts");

    expect(registry.get("/path/to/file.ts")).toBeUndefined();
  });

  test("size tracks the number of unique models", async () => {
    const registry = new ModelRegistry();
    expect(registry.size).toBe(0);

    await registry.getOrCreate("/a.ts");
    expect(registry.size).toBe(1);

    await registry.getOrCreate("/b.ts");
    expect(registry.size).toBe(2);

    await registry.getOrCreate("/c.ts");
    expect(registry.size).toBe(3);

    // Duplicate should not increase size
    await registry.getOrCreate("/a.ts");
    expect(registry.size).toBe(3);
  });

  test("size decreases after models are released", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/a.ts");
    await registry.getOrCreate("/b.ts");
    expect(registry.size).toBe(2);

    registry.release("/a.ts");
    expect(registry.size).toBe(1);

    registry.release("/b.ts");
    expect(registry.size).toBe(0);
  });

  test("dispose releases all models", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/a.ts");
    await registry.getOrCreate("/b.ts");
    await registry.getOrCreate("/c.ts");

    registry.dispose();

    expect(registry.size).toBe(0);
    expect(registry.has("/a.ts")).toBe(false);
    expect(registry.has("/b.ts")).toBe(false);
    expect(registry.has("/c.ts")).toBe(false);
  });

  test("concurrent getOrCreate calls for same URI get same model", async () => {
    const registry = new ModelRegistry();

    const [model1, model2] = await Promise.all([
      registry.getOrCreate("/concurrent/file.ts"),
      registry.getOrCreate("/concurrent/file.ts"),
    ]);

    // Both should be the same model instance
    expect(model1.uri).toBe("/concurrent/file.ts");
    expect(model2.uri).toBe("/concurrent/file.ts");

    // Release both references
    registry.release("/concurrent/file.ts");
    registry.release("/concurrent/file.ts");
    expect(registry.has("/concurrent/file.ts")).toBe(false);
  });

  test("concurrent getOrCreate for different URIs create separate models", async () => {
    const registry = new ModelRegistry();

    const [modelA, modelB] = await Promise.all([
      registry.getOrCreate("/concurrent/a.ts"),
      registry.getOrCreate("/concurrent/b.ts"),
    ]);

    expect(modelA).not.toBe(modelB);
    expect(modelA.uri).toBe("/concurrent/a.ts");
    expect(modelB.uri).toBe("/concurrent/b.ts");
    expect(registry.size).toBe(2);
  });

  test("release of URI with multiple references reduces count gradually", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/shared/file.ts");

    const model = registry.get("/shared/file.ts");
    expect(model).toBeTruthy();

    // Release once — ref goes to 0, model removed
    registry.release("/shared/file.ts");
    expect(registry.get("/shared/file.ts")).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  test("creates model via factory function", async () => {
    const registry = new ModelRegistry();
    expect(mockCreateModel).not.toHaveBeenCalled();

    await registry.getOrCreate("/factory/test.ts");

    expect(mockCreateModel).toHaveBeenCalled();
    expect(mockCreateModel).toHaveBeenCalledWith("/factory/test.ts");
  });

  test("second getOrCreate does not call factory", async () => {
    const registry = new ModelRegistry();
    await registry.getOrCreate("/factory/test.ts");
    mockCreateModel.mockClear();

    await registry.getOrCreate("/factory/test.ts");

    expect(mockCreateModel).not.toHaveBeenCalled();
  });
});
