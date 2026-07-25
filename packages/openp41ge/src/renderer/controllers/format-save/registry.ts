/**
 * Registry — Formatter type, extension-based lookup, and registration.
 */

export type Formatter = (content: string) => string;

const formatters = new Map<string, Formatter>();

export function registerFormatter(extensions: string[], fn: Formatter): void {
  for (const ext of extensions) {
    formatters.set(ext, fn);
  }
}

export function getFormatterForPath(filePath: string): Formatter | null {
  const match = filePath.match(/\.([a-z0-9]+)$/i);
  if (!match) return null;
  return formatters.get(match[1].toLowerCase()) ?? null;
}
