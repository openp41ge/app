/**
 * tailwind.preset.js — shared design token preset for all openp41ge UI packages.
 *
 * Every library package that uses Tailwind extends this preset so colours,
 * font sizes, spacing, and other tokens are consistent across the app.
 *
 * Tokens reference existing CSS custom properties where possible so they
 * respond to theme changes (dark/light mode) at runtime.
 */

export default {
  theme: {
    extend: {
      colors: {
        // Backgrounds
        "bg-primary": "var(--bg-primary, #1a1a1a)",
        "bg-gutter": "var(--bg-gutter, #161616)",
        "bg-hover": "var(--bg-hover, rgba(255,255,255,0.04))",
        "bg-selected": "rgba(74,158,255,0.08)",

        // Text
        "text-primary": "var(--text-primary, #ccc)",
        "text-secondary": "var(--text-secondary, #aaa)",
        "text-muted": "var(--text-muted, #888)",
        "text-accent": "var(--accent-hover, #4a9eff)",

        // Borders
        "border-divider": "var(--border-divider, #2a2a2a)",
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
