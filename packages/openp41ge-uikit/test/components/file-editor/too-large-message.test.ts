// @ts-nocheck
/**
 * Tests for the <file-editor> "file is too large to open" message pane.
 *
 * When a file exceeds editor.maxFileSize the platform calls
 * editor.showTooLarge(path, size, limit) instead of loading content. The tab
 * still opens but renders a VSCode-style message (no content, no bypass). This
 * pins:
 *   - the message text (name + readable size + readable limit) is rendered
 *   - no view lines / viewport are created (nothing to edit)
 *   - getState() reports the "too-large" state
 *   - status bar stays present so the tab doesn't look broken
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";

async function mountEmptyEditor(): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 10));
  return el;
}

describe("file-editor too-large message", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("showTooLarge renders the message pane with name + readable sizes", async () => {
    const el = await mountEmptyEditor();

    (el as any).showTooLarge("/repo/enormous-bundle.js", 120 * 1024 * 1024, 50 * 1024 * 1024);
    await new Promise((r) => setTimeout(r, 10));

    const text = el.textContent || "";
    expect(text).toContain("too large to open in the editor");
    expect(text).toContain("enormous-bundle.js");
    expect(text).toContain("120 MB");
    expect(text).toContain("50 MB");

    // No editable content / view lines were created.
    expect(el.querySelector(".fe-viewport")).toBeNull();
    expect(el.querySelectorAll(".view-line").length).toBe(0);

    // State API reflects the too-large state.
    expect((el as any).getState().state).toBe("too-large");
    expect((el as any).getState().isDirty).toBe(false);

    // Status bar element still present (tab isn't a bare shell).
    expect(el.querySelector("fe-status-bar")).not.toBeNull();
  });

  test("too-large needs both state and info; default state shows no message", async () => {
    const el = await mountEmptyEditor();
    const text = el.textContent || "";
    expect(text).not.toContain("too large to open");
    expect((el as any).getState().state).toBe("empty");
  });

  test("_formatBytes renders readable units", async () => {
    const el = await mountEmptyEditor();
    const fmt = (el as any)._formatBytes.bind(el);
    expect(fmt(512)).toBe("512 B");
    expect(fmt(4 * 1024)).toBe("4 KB");
    expect(fmt(50 * 1024 * 1024)).toBe("50 MB");
    expect(fmt(2 * 1024 * 1024 * 1024)).toBe("2 GB");
  });
});
