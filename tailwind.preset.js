/**
 * tailwind.preset.js — shared design token preset for all openp41ge UI packages.
 *
 * Every library package that uses Tailwind extends this preset so colours,
 * font sizes, spacing, and other tokens are consistent across the app.
 *
 * Tokens reference existing CSS custom properties where possible so they
 * respond to theme changes (dark/light mode) at runtime.
 *
 * Usage in components:
 *   <div class="text-muted bg-gutter border-divider">…</div>
 *   <div class="text-accent hover:bg-hover">…</div>
 *
 * NOTE: This file uses module.exports (CJS) because Tailwind's config
 * loader uses require() internally. ESM export default would fail
 * silently and none of the custom colours/typography would apply.
 */

module.exports = {
  theme: {
    extend: {
      colors: {
        // Text colours
        primary: "var(--text-primary, #ccc)",
        secondary: "var(--text-secondary, #aaa)",
        muted: "var(--text-muted, #888)",
        accent: "var(--accent-hover, #4a9eff)",

        // Background colours
        "bg-primary": "var(--bg-primary, #1a1a1a)",
        gutter: "var(--bg-gutter, #161616)",
        hover: "rgba(255,255,255,0.04)",
        selected: "rgba(74,158,255,0.08)",

        // Border
        divider: "var(--border-divider, #2a2a2a)",
      },
      fontFamily: {
        mono: ['"SF Mono"', "Monaco", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12px", { lineHeight: "18px" }],
      },
      spacing: {
        sidebar: "48px",
        row: "28px",
      },
    },
  },
};
