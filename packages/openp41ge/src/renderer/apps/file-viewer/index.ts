/**
 * File Viewer app type registration.
 *
 * Creates FileEditorController panes backed by the <file-editor> web component.
 * The file path is picked up from `window.__pendingFilePath` which is
 * set by the Cmd+P picker or file tree drawer when a file is selected.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { FileEditorController } from "./file-editor-controller";

export const fileViewerAppRegistration: AppTypeRegistration = {
  id: "file-viewer",
  label: "File Viewer",
  icon: "\uD83D\uDCC4",
  description: "View file contents",
  createController: (tabId: string) => new FileEditorController(tabId, "file-viewer"),
};
