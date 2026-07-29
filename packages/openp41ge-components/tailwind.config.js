/** @type {import("tailwindcss").Config} */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export default {
  presets: [require("../../tailwind.preset.js")],
  content: ["./src/**/*.{ts,html}", "./stories/**/*.{ts,html}"],
};
