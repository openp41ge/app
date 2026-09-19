/** Rendered HTML for the Welcome tab's intro. */
import welcomeMd from "./welcome.md?raw";
import { renderMarkdown } from "./render-markdown";

export const welcomeHtml = renderMarkdown(welcomeMd);
