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

import { PactV4 } from "@pact-foundation/pact";
import { MatchersV3 } from "@pact-foundation/pact/src/v3";
import { describe, it, expect } from "vitest";
import { pactOptions } from "../helpers/pact-setup";
import { createMockIpcBridge } from "../helpers/pact-test-helpers";

const { like, eachLike, string, integer, boolean } = MatchersV3;

const provider = new PactV4(pactOptions("renderer", "preload-bridge"));

// ─── RepoService IPC Methods ──────────────────────────────────────────

describe("IPC bridge contract — RepoService methods", () => {
  it("listRepos returns an array of repositories", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to list repositories")
      .withRequest("POST", "/workspaceController.listRepos", (req) => {
        req.headers({ "Content-Type": "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          eachLike({
            name: string("openp41ge"),
            url: string("https://github.com/test/openp41ge"),
          }),
        );
      })
      .executeTest(async (mockServer) => {
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
    await provider
      .addInteraction()
      .uponReceiving("a request to get a repository")
      .withRequest("POST", "/workspaceController.getRepo", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ name: string("openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          name: string("openp41ge"),
          url: string("https://github.com/test/openp41ge"),
        });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const repo = await bridge.getRepo("openp41ge");
        expect(repo).not.toBeNull();
        expect(repo!.name).toBe("openp41ge");
      });
  });

  it("getRepo returns null for unknown repository", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to get a non-existent repository")
      .withRequest("POST", "/workspaceController.getRepo", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ name: string("nonexistent") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const repo = await bridge.getRepo("nonexistent");
        expect(repo).toBeNull();
      });
  });
});

// ─── RepositoryModel IPC Methods ─────────────────────────────────────

describe("IPC bridge contract — RepositoryModel methods", () => {
  it("listWorktrees returns an array of worktrees", async () => {
    await provider
      .addInteraction()
      .given("worktrees exist")
      .uponReceiving("a request to list worktrees for a repository")
      .withRequest("POST", "/workspaceController.listWorktrees", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          eachLike({
            branch: string("main"),
            path: string("/repos/openp41ge/.git/worktrees/main"),
            exists: boolean(true),
          }),
        );
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const wts = await bridge.listWorktrees("openp41ge");
        expect(wts).toHaveLength(1);
        expect(wts[0].branch).toBe("main");
        expect(wts[0].exists).toBe(true);
      });
  });

  it("listWorktrees returns empty array when no worktrees exist", async () => {
    await provider
      .addInteraction()
      .given("no worktrees exist")
      .uponReceiving("a request to list worktrees for an empty repository")
      .withRequest("POST", "/workspaceController.listWorktrees", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("empty-repo") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody([]);
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const wts = await bridge.listWorktrees("empty-repo");
        expect(wts).toEqual([]);
      });
  });

  it("checkoutWorktree returns a new worktree", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to checkout a new worktree")
      .withRequest("POST", "/workspaceController.checkoutWorktree", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge"), branch: string("feature-x") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          branch: string("feature-x"),
          path: string("/repos/openp41ge/.git/worktrees/feature-x"),
          exists: boolean(true),
        });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const wt = await bridge.checkoutWorktree("openp41ge", "feature-x");
        expect(wt.branch).toBe("feature-x");
        expect(wt.exists).toBe(true);
      });
  });

  it("deleteWorktree succeeds", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to delete a worktree")
      .withRequest("POST", "/workspaceController.deleteWorktree", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge"), branch: string("feature-x") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({});
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const result = await bridge.deleteWorktree("openp41ge", "feature-x");
        expect(result).toBeDefined();
      });
  });

  it("pullBranch succeeds", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to pull a branch")
      .withRequest("POST", "/workspaceController.pullBranch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge"), branch: string("main") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({});
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const result = await bridge.pullBranch("openp41ge", "main");
        expect(result).toBeDefined();
      });
  });

  it("fetch succeeds", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to fetch remotes")
      .withRequest("POST", "/workspaceController.fetch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({});
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const result = await bridge.fetch("openp41ge");
        expect(result).toBeDefined();
      });
  });

  it("listBranches returns an array of branch names", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to list branches")
      .withRequest("POST", "/workspaceController.listBranches", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(eachLike(string("main")));
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const branches = await bridge.listBranches("openp41ge");
        expect(branches.length).toBeGreaterThanOrEqual(1);
        expect(typeof branches[0]).toBe("string");
      });
  });

  it("getDefaultBranch returns the default branch name", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to get the default branch")
      .withRequest("POST", "/workspaceController.getDefaultBranch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(string("main"));
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const branch = await bridge.getDefaultBranch("openp41ge");
        expect(branch).toBe("main");
      });
  });

  it("getDefaultBranch returns null for empty repo", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to get the default branch of an empty repo")
      .withRequest("POST", "/workspaceController.getDefaultBranch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ repoName: string("empty-repo") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const branch = await bridge.getDefaultBranch("empty-repo");
        expect(branch).toBeNull();
      });
  });
});

// ─── File IPC Methods ─────────────────────────────────────────────────

describe("IPC bridge contract — File methods", () => {
  it("readdir returns an array of file entries", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to read a directory")
      .withRequest("POST", "/file.readdir", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ dirPath: string("/repos/openp41ge") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          eachLike({
            name: string("src"),
            path: string("/repos/openp41ge/src"),
            isDirectory: boolean(true),
            size: integer(0),
            modifiedAt: string("2024-01-15T12:00:00.000Z"),
          }),
        );
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const entries = await bridge.readdir("/repos/openp41ge");
        expect(entries).toHaveLength(1);
        expect(entries[0].name).toBe("src");
        expect(entries[0].isDirectory).toBe(true);
      });
  });

  it("readRange returns file content and total size", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to read a range of a file")
      .withRequest("POST", "/file.readRange", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          filePath: string("/repos/openp41ge/README.md"),
          offset: integer(0),
          length: integer(100),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          data: string("# Openp41ge\n"),
          totalSize: integer(1024),
        });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const result = await bridge.readRange("/repos/openp41ge/README.md", 0, 100);
        expect(result.data).toBe("# Openp41ge\n");
        expect(result.totalSize).toBe(1024);
      });
  });

  it("writeFile returns success", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to write a file")
      .withRequest("POST", "/file.writeFile", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          filePath: string("/repos/openp41ge/test.txt"),
          content: string("hello world"),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true) });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const result = await bridge.writeFile("/repos/openp41ge/test.txt", "hello world");
        expect(result.success).toBe(true);
      });
  });

  it("stat returns file entry for an existing path", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to stat an existing file")
      .withRequest("POST", "/file.stat", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ filePath: string("/repos/openp41ge/README.md") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          name: string("README.md"),
          path: string("/repos/openp41ge/README.md"),
          isDirectory: boolean(false),
          size: integer(1024),
          modifiedAt: string("2024-01-15T12:00:00.000Z"),
        });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const entry = await bridge.stat("/repos/openp41ge/README.md");
        expect(entry).not.toBeNull();
        expect(entry!.name).toBe("README.md");
        expect(entry!.isDirectory).toBe(false);
      });
  });

  it("stat returns null for non-existent path", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to stat a non-existent file")
      .withRequest("POST", "/file.stat", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ filePath: string("/repos/openp41ge/missing.txt") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const entry = await bridge.stat("/repos/openp41ge/missing.txt");
        expect(entry).toBeNull();
      });
  });
});

// ─── Config IPC Methods ───────────────────────────────────────────────

describe("IPC bridge contract — Config methods", () => {
  it("configGet returns a value for a known key", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to get a config value")
      .withRequest("POST", "/config.get", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ key: string("editor.fontSize") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like(14));
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const value = await bridge.configGet("editor.fontSize");
        expect(value).toBe(14);
      });
  });

  it("configGetAll returns a record of config values", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to get all config values")
      .withRequest("POST", "/config.getAll", (req) => {
        req.headers({ "Content-Type": "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          like({
            "editor.fontSize": 14,
            "editor.lineHeight": 22,
          }),
        );
      })
      .executeTest(async (mockServer) => {
        const bridge = createMockIpcBridge(mockServer.url);
        const config = await bridge.configGetAll();
        expect(config).toHaveProperty("editor.fontSize", 14);
      });
  });
});
