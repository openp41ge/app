/**
 * openp41ge-agents-tool-search-files — the `search_files` agent tool.
 *
 * Walks a set of roots looking for files whose path/name contains a query
 * substring, reporting errors in-band via `error`. Registers itself against an
 * AgentToolRegistry.
 */

import fs from "fs";
import path from "path";
import type {
  AgentTool,
  AgentToolRegistry,
  ToolExecutionContext,
} from "openp41ge-agents-tool-types";

/** Resolve a possibly-relative path against the tool context cwd. */
function resolvePath(p: string | undefined, ctx: ToolExecutionContext): string | undefined {
  if (!p) return undefined;
  return path.isAbsolute(p) ? p : path.resolve(ctx.cwd ?? process.cwd(), p);
}

async function walk(dir: string, query: string, out: string[], max: number): Promise<void> {
  if (out.length >= max) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= max) return;
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(p, query, out, max);
    } else if (p.toLowerCase().includes(query)) {
      out.push(p);
    }
  }
}

const tool: AgentTool = {
  name: "search_files",
  description:
    "Search for files whose path/name matches a substring within a root directory. " +
    "Returns up to 200 matching paths.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against file paths." },
      roots: {
        type: "array",
        items: { type: "string" },
        description: "Root directories to search. Defaults to the chat cwd.",
      },
      maxResults: { type: "number", description: "Maximum number of results (default 200)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext) {
    const query = String(args.query ?? "").toLowerCase();
    if (!query) return { content: "search_files: empty query", error: "empty query" };
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : 200;
    const roots = Array.isArray(args.roots)
      ? (args.roots as string[]).map((r) => resolvePath(r, ctx) ?? r)
      : [ctx.cwd ?? process.cwd()];
    const results: string[] = [];
    try {
      for (const root of roots) {
        await walk(root, query, results, maxResults);
        if (results.length >= maxResults) break;
      }
      return {
        content: results.length ? results.slice(0, maxResults).join("\n") : "(no matching files)",
      };
    } catch (err) {
      return { content: "", error: `search_files: ${(err as Error).message}` };
    }
  },
};

/** Register this tool into a registry. */
export function register(registry: AgentToolRegistry): void {
  registry.register(tool);
}

export default tool;
