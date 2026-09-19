/** Rendered HTML for the Welcome tab's slideshow. One markdown file per page. */
import page1 from "./welcome/01-welcome.md?raw";
import page2 from "./welcome/02-levels.md?raw";
import page3 from "./welcome/03-sidebar.md?raw";
import page4 from "./welcome/04-move-tabs.md?raw";
import page5 from "./welcome/05-grid.md?raw";
import { renderMarkdown } from "./render-markdown";

/** One string of rendered HTML per Welcome slide, in display order. */
export const welcomePages: string[] = [
  renderMarkdown(page1),
  renderMarkdown(page2),
  renderMarkdown(page3),
  renderMarkdown(page4),
  renderMarkdown(page5),
];
