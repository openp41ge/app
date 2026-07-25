/**
 *
 * Tests for file-content-cache.ts — preloadVisibleFiles concurrency
 * and cache API.
 */

import {
  cacheFileChunk,
  consumeCachedChunk,
  clearFileCache,
  preloadVisibleFiles,
} from "@openp41ge/renderer/controllers/file-content-cache";

const mockReadRange = vi.fn();

beforeAll(() => {
  (window as any).openp41ge = {
    file: { readRange: mockReadRange },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  clearFileCache();
  document.body.innerHTML = "";
  // Default: each readRange call returns a resolved promise with a chunk
  mockReadRange.mockResolvedValue({ data: "preloaded data", totalSize: 14 });
});

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ── Cache API ─────────────────────────────────────────────────────────

describe("cacheFileChunk / consumeCachedChunk", () => {
  it("stores and retrieves a chunk", () => {
    cacheFileChunk("/a.txt", "hello world");
    expect(consumeCachedChunk("/a.txt")).toBe("hello world");
  });

  it("returns null for uncached path", () => {
    expect(consumeCachedChunk("/missing.txt")).toBeNull();
  });

  it("removes the entry after consumption", () => {
    cacheFileChunk("/a.txt", "data");
    consumeCachedChunk("/a.txt");
    expect(consumeCachedChunk("/a.txt")).toBeNull();
  });

  it("clearFileCache empties all entries", () => {
    cacheFileChunk("/a.txt", "aaa");
    cacheFileChunk("/b.txt", "bbb");
    clearFileCache();
    expect(consumeCachedChunk("/a.txt")).toBeNull();
    expect(consumeCachedChunk("/b.txt")).toBeNull();
  });

  it("overwrites existing entry on re-cache", () => {
    cacheFileChunk("/a.txt", "old");
    cacheFileChunk("/a.txt", "new");
    expect(consumeCachedChunk("/a.txt")).toBe("new");
  });
});

// ── preloadVisibleFiles ───────────────────────────────────────────────

describe("preloadVisibleFiles", () => {
  function createFileRow(path: string): HTMLElement {
    const row = document.createElement("div");
    row.dataset.type = "file";
    row.dataset.path = path;
    return row;
  }

  it("reads first chunk of each visible file row", async () => {
    mockReadRange.mockResolvedValue({ data: "abc", totalSize: 3 });

    const container = document.createElement("div");
    container.appendChild(createFileRow("/a.txt"));
    container.appendChild(createFileRow("/b.txt"));

    preloadVisibleFiles(container);
    await tick();
    await tick();
    await tick();

    expect(mockReadRange).toHaveBeenCalledTimes(2);
    // Both chunks should be cached after the reads complete
    expect(consumeCachedChunk("/a.txt")).toBe("abc");
    expect(consumeCachedChunk("/b.txt")).toBe("abc");
  });

  it("skips already-cached files", () => {
    cacheFileChunk("/cached.txt", "already present");

    const container = document.createElement("div");
    container.appendChild(createFileRow("/cached.txt"));
    container.appendChild(createFileRow("/other.txt"));

    preloadVisibleFiles(container);

    // only /other.txt should be read
    expect(mockReadRange).toHaveBeenCalledTimes(1);
    expect(mockReadRange).toHaveBeenCalledWith("/other.txt", 0, 1024);
  });

  it("limits concurrency to 4 simultaneous requests", async () => {
    const READ_DELAY = 50; // ms
    let inFlight = 0;
    let maxInFlight = 0;

    mockReadRange.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, READ_DELAY));
      inFlight--;
      return { data: "x", totalSize: 1 };
    });

    const container = document.createElement("div");
    // 10 files should trigger at most 4 concurrent reads
    for (let i = 0; i < 10; i++) {
      container.appendChild(createFileRow(`/f${i}.txt`));
    }

    preloadVisibleFiles(container);

    // Wait for all reads to complete
    await new Promise((r) => setTimeout(r, READ_DELAY * 4));

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(mockReadRange).toHaveBeenCalledTimes(10);
  });

  it("handles empty container gracefully", () => {
    const container = document.createElement("div");
    preloadVisibleFiles(container);
    expect(mockReadRange).not.toHaveBeenCalled();
  });

  it("handles read errors silently", async () => {
    mockReadRange.mockRejectedValue(new Error("bad"));

    const container = document.createElement("div");
    container.appendChild(createFileRow("/err.txt"));

    // Should not throw
    preloadVisibleFiles(container);
    await tick();
    await tick();

    // Entry should not be cached
    expect(consumeCachedChunk("/err.txt")).toBeNull();
  });

  it("ignores rows without data-path", () => {
    const container = document.createElement("div");
    const row = document.createElement("div");
    row.dataset.type = "file";
    // No data-path attribute
    container.appendChild(row);

    preloadVisibleFiles(container);
    expect(mockReadRange).not.toHaveBeenCalled();
  });
});
