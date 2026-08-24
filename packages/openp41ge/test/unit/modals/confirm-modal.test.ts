/**
 *
 * Tests for openp41ge-confirm-modal component (Lit).
 *
 * The Lit element <openp41ge-confirm-modal> renders synchronously via
 * waitForResult() -> performUpdate(), so DOM is available immediately
 * after showConfirmModal() returns.
 *
 * Modal lockdown: the modal calls appServices.keyboardManager.pushModal()
 * on connect and popModal() on disconnect. All keyboard shortcuts are
 * suppressed while a modal is active. Tab/Shift+Tab cycle focus between
 * Cancel and Confirm buttons only.
 */

import { showConfirmModal } from "@openp41ge/renderer/components/openp41ge-confirm-modal";
import { appServices } from "@openp41ge/renderer/app";

describe("openp41ge-confirm-modal — showConfirmModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── Existing functional tests ──────────────────────────────────

  test("renders message text", () => {
    const promise = showConfirmModal({ message: "Close pane?", confirmLabel: "Close" });
    const el = document.body.querySelector("openp41ge-confirm-modal");
    expect(el).toBeTruthy();
    expect(el!.textContent).toContain("Close pane?");
    expect(el!.textContent).toContain("Close");
    // Cleanup: click cancel to dismiss
    const cancelBtn = el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
    cancelBtn?.click();
    return promise;
  });

  test("cancel button resolves with false", async () => {
    const promise = showConfirmModal({ message: "Test?" });
    const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
    cancelBtn?.click();
    const result = await promise;
    expect(result).toBe(false);
    expect(document.body.querySelector("openp41ge-confirm-modal")).toBeNull();
  });

  test("confirm button resolves with true", async () => {
    const promise = showConfirmModal({ message: "Test?", confirmLabel: "OK" });
    const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;
    okBtn?.click();
    const result = await promise;
    expect(result).toBe(true);
    expect(document.body.querySelector("openp41ge-confirm-modal")).toBeNull();
  });

  test("Escape key cancels", async () => {
    const promise = showConfirmModal({ message: "Test?" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const result = await promise;
    expect(result).toBe(false);
  });

  test("Enter key confirms", async () => {
    const promise = showConfirmModal({ message: "Test?" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const result = await promise;
    expect(result).toBe(true);
  });

  test("click on backdrop cancels", async () => {
    const promise = showConfirmModal({ message: "Test?" });
    const modal = document.body.querySelector("openp41ge-confirm-modal")!;
    // Find the backdrop overlay div (first child, position:fixed;inset:0)
    const overlay = modal.firstElementChild as HTMLElement;
    expect(overlay).toBeTruthy();
    // Click the overlay backdrop, not a child element (simulates clicking
    // the semi-transparent area outside the dialog box)
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const result = await promise;
    expect(result).toBe(false);
  });

  test("renders detail text when provided", () => {
    const promise = showConfirmModal({
      message: "Remove folder?",
      detail: "Files inside will no longer be searchable.",
    });
    const el = document.body.querySelector("openp41ge-confirm-modal");
    expect(el!.textContent).toContain("Files inside will no longer be searchable.");
    // Cleanup
    const cancelBtn = el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
    cancelBtn?.click();
    return promise;
  });

  // ── Checkbox opt-in behaviour ─────────────────────────────────────

  describe("opt-in checkbox", () => {
    test("renders checkbox when checkboxLabel is provided", () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        checkboxLabel: "Also delete workspace data on disk",
      });
      const el = document.body.querySelector("openp41ge-confirm-modal");
      expect(el!.textContent).toContain("Also delete workspace data on disk");
      expect(el!.querySelector(".openp41ge-confirm-checkbox input")).toBeTruthy();
      // Cleanup
      (el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      return promise;
    });

    test("does not render checkbox without checkboxLabel", () => {
      const promise = showConfirmModal({ message: "Delete workspace?" });
      const el = document.body.querySelector("openp41ge-confirm-modal");
      expect(el!.querySelector(".openp41ge-confirm-checkbox input")).toBeNull();
      (el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      return promise;
    });

    test("renders checkbox detail as a subtitle in the card", () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        checkboxLabel: "Also delete data",
        checkboxDetail: "Removes the data directory.",
      });
      const el = document.body.querySelector("openp41ge-confirm-modal");
      expect(el!.querySelector(".openp41ge-confirm-checkbox-card")).toBeTruthy();
      expect(el!.textContent).toContain("Removes the data directory.");
      (el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      return promise;
    });

    test("clicking the card toggles the checkbox without closing the modal", async () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        checkboxLabel: "Also delete data",
      });
      const card = document.body.querySelector(".openp41ge-confirm-checkbox-card") as HTMLElement;
      card?.click();
      const checkbox = document.body.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement;
      expect(checkbox!.checked).toBe(true);
      expect(document.body.querySelector("openp41ge-confirm-modal")).toBeTruthy();
      // Cleanup
      (document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      await promise;
    });

    test("confirm with unchecked checkbox resolves confirmed true, checked false", async () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        confirmLabel: "Delete",
        checkboxLabel: "Also delete data",
      });
      const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;
      okBtn?.click();
      const result = await promise;
      expect(result).toEqual({ confirmed: true, checked: false });
    });

    test("confirm with checked checkbox resolves confirmed true, checked true", async () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        confirmLabel: "Delete",
        checkboxLabel: "Also delete data",
      });
      const checkbox = document.body.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement;
      checkbox?.click();
      const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;
      okBtn?.click();
      const result = await promise;
      expect(result).toEqual({ confirmed: true, checked: true });
    });

    test("cancel resolves confirmed false, checked false even when checked", async () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        checkboxLabel: "Also delete data",
      });
      const checkbox = document.body.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement;
      checkbox?.click();
      const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
      cancelBtn?.click();
      const result = await promise;
      expect(result).toEqual({ confirmed: false, checked: false });
    });

    test("Tab cycle includes checkbox between Cancel and Confirm", () => {
      showConfirmModal({
        message: "Test?",
        checkboxLabel: "Also delete data",
      });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const checkbox = document.body.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement;
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;

          // Initial focus on Confirm
          expect(document.activeElement).toBe(okBtn);
          // Tab: Confirm → Checkbox (wraps to first focusable in DOM order)
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(checkbox);
          // Tab: Checkbox → Cancel
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(cancelBtn);
          // Tab: Cancel → Confirm
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(okBtn);

          cancelBtn.click();
          resolve();
        });
      });
    });

    test("Enter on focused checkbox toggles it without confirming or re-rendering the modal away", async () => {
      const promise = showConfirmModal({
        message: "Delete workspace?",
        checkboxLabel: "Also delete data",
      });
      const checkbox = document.body.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement;
      checkbox?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      expect(checkbox!.checked).toBe(true);

      // Flush Lit's scheduled update (if any) to ensure no re-render wipes
      // the modal content (regression guard: the checkbox must NOT be reactive).
      await new Promise((r) => setTimeout(r, 0));
      expect(document.body.querySelector(".openp41ge-confirm-checkbox input")).toBeTruthy();
      expect(document.body.querySelector("openp41ge-confirm-modal")).toBeTruthy();

      // Cleanup — cancel to dismiss
      (document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      const result = await promise;
      expect(result).toEqual({ confirmed: false, checked: false });
    });
  });

  // ── Modal lockdown tests ───────────────────────────────────────

  describe("modal lockdown", () => {
    test("title property renders correctly", () => {
      const promise = showConfirmModal({
        message: "Are you sure?",
        title: "Confirm Action",
      });
      const el = document.body.querySelector("openp41ge-confirm-modal");
      expect(el!.textContent).toContain("Confirm Action");
      // Cleanup
      (el!.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      return promise;
    });

    test("pushModal called on creation, popModal called on dismiss", async () => {
      expect(appServices.keyboardManager.isModalActive).toBe(false);

      const promise = showConfirmModal({ message: "Test?" });
      expect(appServices.keyboardManager.isModalActive).toBe(true);

      // Click cancel to dismiss
      (document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement)?.click();
      await promise;
      expect(appServices.keyboardManager.isModalActive).toBe(false);
    });

    test("focus starts on Confirm button", () => {
      showConfirmModal({ message: "Test?" });
      // After requestAnimationFrame, focus should be on Confirm
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;
          expect(document.activeElement).toBe(okBtn);
          expect(document.activeElement).not.toBe(cancelBtn);
          cancelBtn.click();
          resolve();
        });
      });
    });

    test("Tab cycles from Confirm to Cancel to Confirm", () => {
      showConfirmModal({ message: "Test?" });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;

          // Initial focus should be Confirm
          expect(document.activeElement).toBe(okBtn);

          // Tab: should move to Cancel
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(cancelBtn);

          // Tab: should move back to Confirm
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(okBtn);

          // Tab again: should move to Cancel
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(cancelBtn);

          cancelBtn.click();
          resolve();
        });
      });
    });

    test("Shift+Tab cycles from Confirm to Cancel (reverse)", () => {
      showConfirmModal({ message: "Test?" });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;

          // Initial focus should be Confirm
          expect(document.activeElement).toBe(okBtn);

          // Shift+Tab: should move backwards to Cancel
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Tab",
              shiftKey: true,
              bubbles: true,
            }),
          );
          expect(document.activeElement).toBe(cancelBtn);

          // Shift+Tab: should move backwards to Confirm
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Tab",
              shiftKey: true,
              bubbles: true,
            }),
          );
          expect(document.activeElement).toBe(okBtn);

          cancelBtn.click();
          resolve();
        });
      });
    });

    test("Tab cycle wraps repeatedly", () => {
      showConfirmModal({ message: "Test?" });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          const okBtn = document.body.querySelector(".openp41ge-confirm-ok") as HTMLElement;

          // Start on Confirm
          expect(document.activeElement).toBe(okBtn);

          // Tab: Confirm → Cancel
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(cancelBtn);

          // Tab: Cancel → Confirm
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(okBtn);

          // Tab: Confirm → Cancel
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(cancelBtn);

          // Tab: Cancel → Confirm
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          expect(document.activeElement).toBe(okBtn);

          cancelBtn.click();
          resolve();
        });
      });
    });

    test("Enter on Confirm button confirms", () => {
      showConfirmModal({ message: "Test?" });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          // Focus is on Confirm by default
          expect(document.activeElement?.textContent?.trim()).toBe("Confirm");

          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

          // Enter with Confirm focused should confirm (resolve true) and remove modal
          expect(document.body.querySelector("openp41ge-confirm-modal")).toBeNull();
          resolve();
        });
      });
    });

    test("Enter on Cancel button cancels", () => {
      showConfirmModal({ message: "Test?" });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const cancelBtn = document.body.querySelector(".openp41ge-confirm-cancel") as HTMLElement;
          // Tab to Cancel first
          cancelBtn.focus();
          expect(document.activeElement).toBe(cancelBtn);

          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

          // Enter with Cancel focused should cancel (resolve false) and remove modal
          expect(document.body.querySelector("openp41ge-confirm-modal")).toBeNull();
          resolve();
        });
      });
    });
  });
});
