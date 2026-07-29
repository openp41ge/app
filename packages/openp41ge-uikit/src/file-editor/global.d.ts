import type { FeStatusBar } from "./ui/openp41ge-bottom-bar";
import type { Openp41geConfirmModal } from "./ui/openp41ge-confirm-modal";

export {};

declare global {
  interface Window {
    openp41ge: {
      file: {
        readRange(filePath: string, offset: number, length: number): Promise<{
          data: string;
          totalSize: number;
        }>;
        writeFile(filePath: string, content: string): Promise<{
          success: boolean;
        }>;
      };
    };
  }

  interface HTMLElementTagNameMap {
    "fe-status-bar": FeStatusBar;
    "openp41ge-confirm-modal": Openp41geConfirmModal;
  }
}

// Vite asset import declarations
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
declare module "vscode-oniguruma/release/onig.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.tmLanguage.json" {
  const grammar: any;
  export default grammar;
}
