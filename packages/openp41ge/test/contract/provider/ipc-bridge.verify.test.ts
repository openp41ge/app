/**
 * Provider-side verification — Preload bridge IPC contracts.
 *
 * Verifies that the actual IPC handler implementations satisfy the
 * contracts defined by the consumer tests.
 *
 * A lightweight HTTP server wraps the real OperationDispatcher and
 * state-dependent handler logic, allowing Pact's Verifier to replay
 * consumer interactions against it.
 */

import { Verifier } from "@pact-foundation/pact";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { PACTS_DIR } from "../helpers/pact-setup";
import { getProviderStateHandler } from "../helpers/pact-test-helpers";

import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import { createWorkspace } from "@openp41ge/layout/types";

// ─── Provider Setup ───────────────────────────────────────────────────

let server: Server;
let dispatcher: OperationDispatcher;
const PORT = 9123;

/**
 * Module-level state that can be mutated by state handlers.
 * The HTTP server checks this state when responding to requests.
 */
const state = {
  /** Current provider state name (set before each verification). */
  currentState: "",
};

/**
 * Set up module state based on the given provider state name.
 * The HTTP server uses state.currentState to make state-dependent responses.
 */
function applyProviderState(stateName: string): void {
  state.currentState = stateName;

  if (stateName === "grid is empty") {
    dispatcher.setWorkspace(createWorkspace("test-ws"));
  } else if (stateName === "grid has tabs") {
    const ws = createWorkspace("test-ws");
    const tab1 = {
      id: "tab-1" as any,
      appType: "terminal",
      title: "Terminal 1",
      config: {},
      isPreview: false,
    };
    ws.tabs = { ...ws.tabs, "tab-1": tab1 as any };
    ws.windows[0].grid.placements.push({
      tabIds: ["tab-1" as any],
      activeTabId: "tab-1" as any,
      position: { row: 0, col: 0 },
      span: { rowSpan: 1, colSpan: 1 },
    });
    dispatcher.setWorkspace(ws);
  }
}

// ─── Request Handler ─────────────────────────────────────────────────

function createHandler(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      // ignore parse errors
    }

    const path = req.url || "/";
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      // ── Dispatch endpoint ──────────────────────────────────
      if (path === "/dispatch") {
        const fn = body.fn as string;
        const args = (body.args || []) as unknown[];
        const success = dispatcher.apply(fn, args);
        json(200, { success });
        return;
      }

      // ── Controller lifecycle endpoints ────────────────────
      if (path === "/controller.mount") {
        json(200, { success: true, tabId: body.tabId });
        return;
      }

      if (path === "/controller.unmount") {
        json(200, { success: true });
        return;
      }

      if (path === "/controller.snapshot") {
        json(200, {
          filePath: "/repos/openp41ge/README.md",
          cursorPosition: 42,
          isDirty: false,
        });
        return;
      }

      if (path === "/controller.restore") {
        json(200, { success: true });
        return;
      }

      if (path === "/controller.setVisible") {
        json(200, { success: true });
        return;
      }

      // ── WorkspaceController endpoints ─────────────────────
      if (path === "/workspaceController.listRepos") {
        json(200, [{ name: "openp41ge", url: "https://github.com/test/openp41ge" }]);
        return;
      }

      if (path === "/workspaceController.getRepo") {
        const name = body.name as string;
        if (name === "nonexistent") {
          json(200, null);
        } else {
          json(200, { name, url: `https://github.com/test/${name}` });
        }
        return;
      }

      if (path === "/workspaceController.listWorktrees") {
        // State-dependent: if "no worktrees exist", return empty array
        if (state.currentState === "no worktrees exist") {
          json(200, []);
        } else {
          json(200, [
            { branch: "main", path: "/repos/openp41ge/.git/worktrees/main", exists: true },
          ]);
        }
        return;
      }

      if (path === "/workspaceController.checkoutWorktree") {
        const branch = body.branch as string;
        json(200, {
          branch,
          path: `/repos/openp41ge/.git/worktrees/${branch}`,
          exists: true,
        });
        return;
      }

      if (
        path === "/workspaceController.deleteWorktree" ||
        path === "/workspaceController.pullBranch" ||
        path === "/workspaceController.fetch"
      ) {
        json(200, {});
        return;
      }

      if (path === "/workspaceController.listBranches") {
        json(200, ["main", "develop"]);
        return;
      }

      if (path === "/workspaceController.getDefaultBranch") {
        const name = body.name as string;
        json(200, name === "empty-repo" ? null : "main");
        return;
      }

      // ── File endpoints ────────────────────────────────────
      if (path === "/file.readdir") {
        json(200, [
          {
            name: "src",
            path: "/repos/openp41ge/src",
            isDirectory: true,
            size: 0,
            modifiedAt: "2024-01-15T12:00:00.000Z",
          },
        ]);
        return;
      }

      if (path === "/file.readRange") {
        json(200, { data: "# Openp41ge\n", totalSize: 1024 });
        return;
      }

      if (path === "/file.writeFile") {
        json(200, { success: true });
        return;
      }

      if (path === "/file.stat") {
        json(200, {
          name: "README.md",
          path: "/repos/openp41ge/README.md",
          isDirectory: false,
          size: 1024,
          modifiedAt: "2024-01-15T12:00:00.000Z",
        });
        return;
      }

      // ── Config endpoints ──────────────────────────────────
      if (path === "/config.get") {
        json(200, 14);
        return;
      }

      if (path === "/config.getAll") {
        json(200, { "editor.fontSize": 14, "editor.lineHeight": 22 });
        return;
      }

      // ── 404 for unknown paths ─────────────────────────────
      json(404, { error: `Unknown path: ${path}` });
    } catch (err) {
      json(500, { error: String(err) });
    }
  });
}

// ─── Provider Verification Tests ──────────────────────────────────────

describe("Preload bridge provider verification", () => {
  beforeAll(() => {
    dispatcher = new OperationDispatcher(createWorkspace("test-ws"));

    return new Promise<void>((resolve) => {
      server = createServer(createHandler);
      server.listen(PORT, "127.0.0.1", () => resolve());
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it("satisfies the renderer's IPC bridge expectations", { timeout: 30000 }, async () => {
    const verifier = new Verifier({
      provider: "preload-bridge",
      providerBaseUrl: `http://127.0.0.1:${PORT}`,
      pactUrls: [`${PACTS_DIR}/renderer-preload-bridge.json`],
      logLevel: "warn",
      stateHandlers: {
        "worktrees exist": async () => {
          applyProviderState("worktrees exist");
        },
        "no worktrees exist": async () => {
          applyProviderState("no worktrees exist");
        },
      },
    });

    const output = await verifier.verifyProvider();
    const parsed = JSON.parse(output);
    expect(parsed.result).toBe(true);
  });

  it("satisfies the pane controller lifecycle expectations", { timeout: 30000 }, async () => {
    const verifier = new Verifier({
      provider: "controller-registry",
      providerBaseUrl: `http://127.0.0.1:${PORT}`,
      pactUrls: [`${PACTS_DIR}/pane-controller-controller-registry.json`],
      logLevel: "warn",
    });

    const output = await verifier.verifyProvider();
    const parsed = JSON.parse(output);
    expect(parsed.result).toBe(true);
  });

  it("satisfies the command bus dispatch expectations", { timeout: 30000 }, async () => {
    const verifier = new Verifier({
      provider: "workspace-state-manager",
      providerBaseUrl: `http://127.0.0.1:${PORT}`,
      pactUrls: [`${PACTS_DIR}/dispatcher-workspace-state-manager.json`],
      logLevel: "warn",
      stateHandlers: {
        "grid is empty": async () => {
          applyProviderState("grid is empty");
        },
        "grid has tabs": async () => {
          applyProviderState("grid has tabs");
        },
      },
    });

    const output = await verifier.verifyProvider();
    const parsed = JSON.parse(output);
    expect(parsed.result).toBe(true);
  });
});
