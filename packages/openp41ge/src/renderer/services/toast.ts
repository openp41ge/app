/**
 * Toast — lightweight notification that appears at the bottom of the screen.
 *
 * Usage:
 *   import { showToast } from "./toast";
 *   showToast("Copied");
 */

const TOAST_DURATION = 2000;
let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a toast notification at the bottom of the screen.
 * Auto-dismisses after `duration` ms. Calling again replaces the current toast.
 */
export function showToast(message: string, duration = TOAST_DURATION): void {
  // Clear any existing toast
  if (toastTimer) clearTimeout(toastTimer);
  if (toastEl) toastEl.remove();

  toastEl = document.createElement("div");
  toastEl.textContent = message;
  toastEl.style.cssText = `
    position:fixed;
    bottom:24px;
    left:50%;
    transform:translateX(-50%);
    z-index:2147483646;
    padding:8px 20px;
    border-radius:6px;
    background:var(--bg-secondary,#1e1e1e);
    color:var(--text-primary,#ccc);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    font-size:13px;
    border:1px solid var(--divider,#333);
    box-shadow:0 4px 12px rgba(0,0,0,.3);
    opacity:0;
    transition:opacity .2s ease;
    pointer-events:none;
  `;
  document.body.appendChild(toastEl);

  // Trigger fade in
  requestAnimationFrame(() => {
    if (toastEl) toastEl.style.opacity = "1";
  });

  toastTimer = setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = "0";
      setTimeout(() => toastEl?.remove(), 200);
      toastEl = null;
    }
    toastTimer = null;
  }, duration);
}
