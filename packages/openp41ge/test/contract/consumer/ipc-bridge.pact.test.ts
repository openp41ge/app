/**
 * Consumer-side contract tests — IPC bridge (renderer ↔ preload).
 *
 * Defines the expected data shapes for all IPC methods exposed via
 * `window.openp41ge.workspaceController.*` and `window.openp41ge.file.*`.
 *
 * These tests do NOT exercise real IPC — they verify that the agreed
 * data contract (return types, field shapes, error handling) is
 * correctly understood by the renderer-side consumer code.
 */

import { PactV3 } from "@pact-foundation/pact";
import { MatchersV3 } from "@pact-foundation/pact/src/v3";
import { describe, it, expect } from "vitest";
import { pactOptions } from "../helpers/pact-setup";
import { createMockIpcBridge } from "../helpers/pact-test-helpers";

const { like, eachLike, string, integer, boolean } = MatchersV3;

const provider = new PactV3(pactOptions("renderer", "preload-bridge"));

// ─── RepoService IPC Methods ──────────────────────────────────────────

describe("IPC bridge contract — RepoService methods", () => {
  it("listRepos returns an array of repositories", async () => {
    provider
      .uponReceiving("a request to list repositories")
      .withRequest({
        method: "POST",
        path: "/workspaceController.listRepos",
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: eachLike({
          name: string("openp41ge"),
          url: string("https://github.com/test/openp41ge"),
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const repos = await bridge.listRepos();
      expect(Array.isArray(repos)).toBe(true);
      if (repos.length > 0) {
        expect(repos[0]).toHaveProperty("name");
        expect(repos[0]).toHaveProperty("url");
        expect(typeof repos[0].name).toBe("string");
        expect(typeof repos[0].url).toBe("string");
      }
    });
  });

  it("getRepo returns a single repository", async () => {
    provider
      .uponReceiving("a request to get a repository")
      .withRequest({
        method: "POST",
        path: "/workspaceController.getRepo",
        body: { name: string("openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          name: string("openp41ge"),
          url: string("https://github.com/test/openp41ge"),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const repo = await bridge.getRepo("openp41ge");
      expect(repo).not.toBeNull();
      expect(repo!.name).toBe("openp41ge");
    });
  });

  it("getRepo returns null for unknown repository", async () => {
    provider
      .uponReceiving("a request to get a non-existent repository")
      .withRequest({
        method: "POST",
        path: "/workspaceController.getRepo",
        body: { name: string("nonexistent") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: null,
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const repo = await bridge.getRepo("nonexistent");
      expect(repo).toBeNull();
    });
  });
});

// ─── RepositoryModel IPC Methods ─────────────────────────────────────

describe("IPC bridge contract — RepositoryModel methods", () => {
  it("listWorktrees returns an array of worktrees", async () => {
    provider
      .given("worktrees exist")
      .uponReceiving("a request to list worktrees for a repository")
      .withRequest({
        method: "POST",
        path: "/workspaceController.listWorktrees",
        body: { repoName: string("openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: eachLike({
          branch: string("main"),
          path: string("/repos/openp41ge/.git/worktrees/main"),
          exists: boolean(true),
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const wts = await bridge.listWorktrees("openp41ge");
      expect(wts).toHaveLength(1);
      expect(wts[0].branch).toBe("main");
      expect(wts[0].exists).toBe(true);
    });
  });

  it("listWorktrees returns empty array when no worktrees exist", async () => {
    provider
      .given("no worktrees exist")
      .uponReceiving("a request to list worktrees for an empty repository")
      .withRequest({
        method: "POST",
        path: "/workspaceController.listWorktrees",
        body: { repoName: string("empty-repo") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: [],
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const wts = await bridge.listWorktrees("empty-repo");
      expect(wts).toEqual([]);
    });
  });

  it("checkoutWorktree returns a new worktree", async () => {
    provider
      .uponReceiving("a request to checkout a new worktree")
      .withRequest({
        method: "POST",
        path: "/workspaceController.checkoutWorktree",
        body: { repoName: string("openp41ge"), branch: string("feature-x") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          branch: string("feature-x"),
          path: string("/repos/openp41ge/.git/worktrees/feature-x"),
          exists: boolean(true),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const wt = await bridge.checkoutWorktree("openp41ge", "feature-x");
      expect(wt.branch).toBe("feature-x");
      expect(wt.exists).toBe(true);
    });
  });

  it("deleteWorktree succeeds", async () => {
    provider
      .uponReceiving("a request to delete a worktree")
      .withRequest({
        method: "POST",
        path: "/workspaceController.deleteWorktree",
        body: { repoName: string("openp41ge"), branch: string("feature-x") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {},
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const result = await bridge.deleteWorktree("openp41ge", "feature-x");
      // Pact returns empty object for void-type responses
      expect(result).toBeDefined();
    });
  });

  it("pullBranch succeeds", async () => {
    provider
      .uponReceiving("a request to pull a branch")
      .withRequest({
        method: "POST",
        path: "/workspaceController.pullBranch",
        body: { repoName: string("openp41ge"), branch: string("main") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {},
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const result = await bridge.pullBranch("openp41ge", "main");
      expect(result).toBeDefined();
    });
  });

  it("fetch succeeds", async () => {
    provider
      .uponReceiving("a request to fetch remotes")
      .withRequest({
        method: "POST",
        path: "/workspaceController.fetch",
        body: { repoName: string("openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {},
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const result = await bridge.fetch("openp41ge");
      expect(result).toBeDefined();
    });
  });

  it("listBranches returns an array of branch names", async () => {
    provider
      .uponReceiving("a request to list branches")
      .withRequest({
        method: "POST",
        path: "/workspaceController.listBranches",
        body: { repoName: string("openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: eachLike(string("main")),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const branches = await bridge.listBranches("openp41ge");
      expect(branches.length).toBeGreaterThanOrEqual(1);
      expect(typeof branches[0]).toBe("string");
    });
  });

  it("getDefaultBranch returns the default branch name", async () => {
    provider
      .uponReceiving("a request to get the default branch")
      .withRequest({
        method: "POST",
        path: "/workspaceController.getDefaultBranch",
        body: { repoName: string("openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: string("main"),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const branch = await bridge.getDefaultBranch("openp41ge");
      expect(branch).toBe("main");
    });
  });

  it("getDefaultBranch returns null for empty repo", async () => {
    provider
      .uponReceiving("a request to get the default branch of an empty repo")
      .withRequest({
        method: "POST",
        path: "/workspaceController.getDefaultBranch",
        body: { repoName: string("empty-repo") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: null,
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const branch = await bridge.getDefaultBranch("empty-repo");
      expect(branch).toBeNull();
    });
  });
});

// ─── File IPC Methods ─────────────────────────────────────────────────

describe("IPC bridge contract — File methods", () => {
  it("readdir returns an array of file entries", async () => {
    provider
      .uponReceiving("a request to read a directory")
      .withRequest({
        method: "POST",
        path: "/file.readdir",
        body: { dirPath: string("/repos/openp41ge") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: eachLike({
          name: string("src"),
          path: string("/repos/openp41ge/src"),
          isDirectory: boolean(true),
          size: integer(0),
          modifiedAt: string("2024-01-15T12:00:00.000Z"),
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const entries = await bridge.readdir("/repos/openp41ge");
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("src");
      expect(entries[0].isDirectory).toBe(true);
    });
  });

  it("readRange returns file content and total size", async () => {
    provider
      .uponReceiving("a request to read a range of a file")
      .withRequest({
        method: "POST",
        path: "/file.readRange",
        body: {
          filePath: string("/repos/openp41ge/README.md"),
          offset: integer(0),
          length: integer(100),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          data: string("# Openp41ge\n"),
          totalSize: integer(1024),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const result = await bridge.readRange("/repos/openp41ge/README.md", 0, 100);
      expect(result.data).toBe("# Openp41ge\n");
      expect(result.totalSize).toBe(1024);
    });
  });

  it("writeFile returns success", async () => {
    provider
      .uponReceiving("a request to write a file")
      .withRequest({
        method: "POST",
        path: "/file.writeFile",
        body: {
          filePath: string("/repos/openp41ge/test.txt"),
          content: string("hello world"),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: boolean(true) },
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const result = await bridge.writeFile("/repos/openp41ge/test.txt", "hello world");
      expect(result.success).toBe(true);
    });
  });

  it("stat returns file entry for an existing path", async () => {
    provider
      .uponReceiving("a request to stat an existing file")
      .withRequest({
        method: "POST",
        path: "/file.stat",
        body: { filePath: string("/repos/openp41ge/README.md") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          name: string("README.md"),
          path: string("/repos/openp41ge/README.md"),
          isDirectory: boolean(false),
          size: integer(1024),
          modifiedAt: string("2024-01-15T12:00:00.000Z"),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const entry = await bridge.stat("/repos/openp41ge/README.md");
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("README.md");
      expect(entry!.isDirectory).toBe(false);
    });
  });

  it("stat returns null for non-existent path", async () => {
    provider
      .uponReceiving("a request to stat a non-existent file")
      .withRequest({
        method: "POST",
        path: "/file.stat",
        body: { filePath: string("/repos/openp41ge/missing.txt") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: null,
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const entry = await bridge.stat("/repos/openp41ge/missing.txt");
      expect(entry).toBeNull();
    });
  });
});

// ─── Config IPC Methods ───────────────────────────────────────────────

describe("IPC bridge contract — Config methods", () => {
  it("configGet returns a value for a known key", async () => {
    provider
      .uponReceiving("a request to get a config value")
      .withRequest({
        method: "POST",
        path: "/config.get",
        body: { key: string("editor.fontSize") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: like(14),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const value = await bridge.configGet("editor.fontSize");
      expect(value).toBe(14);
    });
  });

  it("configGetAll returns a record of config values", async () => {
    provider
      .uponReceiving("a request to get all config values")
      .withRequest({
        method: "POST",
        path: "/config.getAll",
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: like({
          "editor.fontSize": 14,
          "editor.lineHeight": 22,
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const bridge = createMockIpcBridge(mockServer.url);
      const config = await bridge.configGetAll();
      expect(config).toHaveProperty("editor.fontSize", 14);
    });
  });
});
