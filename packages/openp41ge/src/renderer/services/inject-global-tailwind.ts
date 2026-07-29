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
  // Tailwind utility classes
  const tailwindStyle = document.createElement("style");
  tailwindStyle.id = "openp41ge-tailwind-global";
  tailwindStyle.textContent = tailwindCSS;
  document.head.appendChild(tailwindStyle);

  // Layout CSS custom property utilities — dynamic values from inline style="--var:val"
  const layoutStyle = document.createElement("style");
  layoutStyle.id = "openp41ge-layout-vars";
  layoutStyle.textContent = [
    ".tb-row { height:var(--tb-h); }",
    ".tb-mw { width:var(--tb-mw); }",
    ".ab-panel { width:var(--ab-w); }",
    ".ab-item { color:var(--ab-c); background:var(--ab-bg); }",
    ".wv-code { flex:1 1 var(--wv-code-min); min-width:var(--wv-code-min); }",

    ".pi-item { height:var(--pi-h); }",
    ".pi-selected { color:var(--pi-c); background:var(--pi-bg); }",
  ].join("\n");
  document.head.appendChild(layoutStyle);

  injected = true;
}
