// Global type declarations for openp41ge-uikit

interface Openp41geBridge {
  platform?: string;
  workspace: {
    dispatch(fn: string, ...args: unknown[]): void;
  };
  file: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
  };
}

interface Window {
  openp41ge?: Openp41geBridge;
  __openp41ge_debug?: unknown;
}

// Vite-specific: import.meta.glob
interface ImportMeta {
  glob<Eager extends boolean>(
    pattern: string,
    options?: { eager?: Eager; query?: string; import?: string },
  ): Eager extends true ? Record<string, string> : Record<string, () => Promise<string>>;
}
