/**
 * Test implementations of tRPC service interfaces.
 *
 * These replace the Pact mock HTTP server used in contract tests.
 * They are pure in-memory implementations that return the agreed data
 * shapes, letting integration tests verify the handler wiring without
 * Pact infrastructure.
 */

import type {
  RepoInfo,
  WorktreeInfo,
  FileEntry,
  ReadRangeResult,
  WriteFileResult,
  ConfigValue,
} from "../../src/trpc/types";
import type { ReposService } from "../../electron/trpc/repos-handlers";
import type { FileService } from "../../electron/trpc/file-handlers";
import type { ConfigService } from "../../electron/trpc/config-handlers";

// ─── Test Repos Service ─────────────────────────────────────────────────

export interface TestState {
  currentState?: string;
  repos: RepoInfo[];
  worktrees: Map<string, WorktreeInfo[]>;
  branches: Map<string, string[]>;
  defaultBranches: Map<string, string | null>;
}

export class TestReposService implements ReposService {
  state: TestState = {
    repos: [{ name: "openp41ge", url: "https://github.com/test/openp41ge" }],
    worktrees: new Map([
      [
        "openp41ge",
        [{ branch: "main", path: "/repos/openp41ge/.git/worktrees/main", exists: true }],
      ],
      ["empty-repo", []],
    ]),
    branches: new Map([
      ["openp41ge", ["main", "develop"]],
      ["empty-repo", []],
    ]),
    defaultBranches: new Map([
      ["openp41ge", "main"],
      ["empty-repo", null],
    ]),
  };

  async listRepos(): Promise<RepoInfo[]> {
    return this.state.repos;
  }

  async getRepo(name: string): Promise<RepoInfo | null> {
    return this.state.repos.find((r) => r.name === name) ?? null;
  }

  async listWorktrees(repoName: string): Promise<WorktreeInfo[]> {
    return this.state.worktrees.get(repoName) ?? [];
  }

  async checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    const wt: WorktreeInfo = {
      branch,
      path: `/repos/${repoName}/.git/worktrees/${branch}`,
      exists: true,
    };
    const existing = this.state.worktrees.get(repoName) ?? [];
    existing.push(wt);
    this.state.worktrees.set(repoName, existing);
    return wt;
  }

  async deleteWorktree(repoName: string, branch: string): Promise<void> {
    const existing = this.state.worktrees.get(repoName) ?? [];
    this.state.worktrees.set(
      repoName,
      existing.filter((wt) => wt.branch !== branch),
    );
  }

  async pullBranch(repoName: string, branch: string): Promise<void> {
    // no-op in tests
  }

  async fetch(repoName: string): Promise<void> {
    // no-op in tests
  }

  async listBranches(repoName: string): Promise<string[]> {
    return this.state.branches.get(repoName) ?? [];
  }

  async getDefaultBranch(name: string): Promise<string | null> {
    return this.state.defaultBranches.get(name) ?? null;
  }
}

// ─── Test File Service ──────────────────────────────────────────────────

export class TestFileService implements FileService {
  files = new Map<string, FileEntry>([
    [
      "/repos/openp41ge/README.md",
      {
        name: "README.md",
        path: "/repos/openp41ge/README.md",
        isDirectory: false,
        size: 1024,
        modifiedAt: 1705315200000,
      },
    ],
    [
      "/repos/openp41ge/src",
      {
        name: "src",
        path: "/repos/openp41ge/src",
        isDirectory: true,
        size: 0,
        modifiedAt: 1705315200000,
      },
    ],
  ]);

  dirs = new Map<string, FileEntry[]>([
    [
      "/repos/openp41ge",
      [
        {
          name: "src",
          path: "/repos/openp41ge/src",
          isDirectory: true,
          size: 0,
          modifiedAt: 1705315200000,
        },
      ],
    ],
  ]);

  fileContents = new Map<string, string>([["/repos/openp41ge/README.md", "# Openp41ge\n"]]);

  async readdir(dirPath: string): Promise<FileEntry[]> {
    return this.dirs.get(dirPath) ?? [];
  }

  async readRange(filePath: string, offset: number, length: number): Promise<ReadRangeResult> {
    const content = this.fileContents.get(filePath) ?? "";
    const data = content.slice(offset, offset + length);
    return { data, totalSize: content.length };
  }

  async writeFile(filePath: string, content: string): Promise<WriteFileResult> {
    this.fileContents.set(filePath, content);
    this.files.set(filePath, {
      name: filePath.split("/").pop() ?? filePath,
      path: filePath,
      isDirectory: false,
      size: content.length,
      modifiedAt: Date.now(),
    });
    return { success: true };
  }

  async stat(filePath: string): Promise<FileEntry | null> {
    return this.files.get(filePath) ?? null;
  }
}

// ─── Test Config Service ────────────────────────────────────────────────

export class TestConfigService implements ConfigService {
  config = new Map<string, ConfigValue>([
    ["editor.fontSize", 14],
    ["editor.lineHeight", 22],
  ]);

  async get(key: string): Promise<ConfigValue> {
    return this.config.get(key) ?? null;
  }

  async getAll(): Promise<Record<string, ConfigValue>> {
    const result: Record<string, ConfigValue> = {};
    for (const [key, value] of this.config) {
      result[key] = value;
    }
    return result;
  }
}
