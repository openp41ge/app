import { fileIcon, docIcon, terminalIcon, gridIcon, playIcon } from "./icons";

/** Metadata for an available pane type. */
export interface AppTypeInfo {
  id: string;
  label: string;
  icon: string;
  description: string;
}

/** Registry of all app types a user can create. */
export const APP_TYPES: AppTypeInfo[] = [
  {
    id: "terminal",
    label: "Terminal",
    icon: terminalIcon(16),
    description: "Shell / command line",
  },
  { id: "file-explorer", label: "File Explorer", icon: fileIcon(16), description: "Browse files" },
  { id: "markdown", label: "Markdown Notes", icon: docIcon(16), description: "Write notes" },
  { id: "table", label: "Interactive Table", icon: gridIcon(16), description: "Data table" },
  { id: "video", label: "Video Stream", icon: playIcon(16), description: "Stream video" },
  { id: "file-viewer", label: "File Viewer", icon: docIcon(16), description: "View file contents" },
];
