/**
 * inject-global-tailwind.ts — injects compiled Tailwind utility classes
 * as a global stylesheet so any element in the app can use Tailwind classes
 * (e.g. class="text-primary text-sm").
 *
 * The CSS is compiled by openp41ge-components' build:css step and exported
 * as a JS string. We inject it once into the document <head>.
 */

import { tailwindCSS } from "openp41ge-components";

let injected = false;

export function injectGlobalTailwind(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.id = "openp41ge-tailwind-global";
  style.textContent = tailwindCSS;
  document.head.appendChild(style);
  injected = true;
}
