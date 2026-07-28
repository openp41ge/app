/**
 * Tests for ProjectStore draft project support.
 *
 * These tests create a temporary ~/.openp41ge/ directory and verify
 * draft creation, detection, save-as conversion, and garbage collection.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ProjectStore, DRAFT_MAX_AGE_MS } from "@openp41ge/main/services/project-store";

let tmpDir: string;
let projectStore: ProjectStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-project-store-test-"));
  projectStore = new ProjectStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ProjectStore — draft support", () => {
  describe("createDraft", () => {
    test("creates a project with draft naming convention", () => {
      const name = projectStore.createDraft();

      // Name matches draft pattern
      expect(name).toMatch(/^draft-[a-f0-9-]+\.draft$/);
      expect(projectStore.exists(name)).toBe(true);
    });

    test("creates a project with draft flag in config", () => {
      const name = projectStore.createDraft();
      const config = projectStore.readConfig(name);

      expect(config).not.toBeNull();
      expect(config!.draft).toBe(true);
      expect(config!.createdAt).toBeDefined();
    });

    test("creates the repos directory", () => {
      const name = projectStore.createDraft();
      const reposDir = projectStore.reposDir(name);

      expect(fs.existsSync(reposDir)).toBe(true);
    });
  });

  describe("isDraft", () => {
    test("returns true for names matching draft pattern", () => {
      expect(projectStore.isDraft("draft-abc-123.draft")).toBe(true);
      expect(projectStore.isDraft("draft-550e8400-e29b-41d4-a716-446655440000.draft")).toBe(true);
    });

    test("returns false for regular project names", () => {
      expect(projectStore.isDraft("my-project")).toBe(false);
      expect(projectStore.isDraft("test")).toBe(false);
      expect(projectStore.isDraft("")).toBe(false);
    });
  });

  describe("list — draft filtering", () => {
    test("list() excludes draft projects", () => {
      projectStore.create("saved-project");
      projectStore.createDraft();

      const projects = projectStore.list();
      expect(projects).toContain("saved-project");
      expect(projects).not.toContain(expect.stringMatching(/^draft-/));
    });

    test("list() returns only non-draft projects", () => {
      projectStore.create("project-a");
      projectStore.create("project-b");
      projectStore.createDraft();
      projectStore.createDraft();

      const projects = projectStore.list();
      expect(projects).toEqual(["project-a", "project-b"]);
    });
  });

  describe("saveDraftAs", () => {
    test("converts a draft to a permanent project", () => {
      const draftName = projectStore.createDraft();
      const newName = "my-real-project";

      const result = projectStore.saveDraftAs(draftName, newName);

      expect(result).toBe(true);
      // Draft directory should no longer exist
      expect(projectStore.exists(draftName)).toBe(false);
      // New project should exist
      expect(projectStore.exists(newName)).toBe(true);
    });

    test("updates config after conversion — removes draft flag, updates name", () => {
      const draftName = projectStore.createDraft();
      const newName = "my-real-project";

      projectStore.saveDraftAs(draftName, newName);
      const config = projectStore.readConfig(newName);

      expect(config).not.toBeNull();
      expect(config!.name).toBe(newName);
      expect(config!.draft).toBe(false);
    });

    test("returns false if draftName doesn't exist", () => {
      const result = projectStore.saveDraftAs("draft-nonexistent.draft", "new-project");
      expect(result).toBe(false);
    });

    test("returns false if newName already exists", () => {
      const draftName = projectStore.createDraft();
      projectStore.create("existing-project");

      const result = projectStore.saveDraftAs(draftName, "existing-project");
      expect(result).toBe(false);
      // Draft should still exist
      expect(projectStore.exists(draftName)).toBe(true);
    });

    test("returns false for non-draft project names", () => {
      projectStore.create("regular-project");
      const result = projectStore.saveDraftAs("regular-project", "new-name");
      expect(result).toBe(false);
    });

    test("preserves workspace state and repos after conversion", () => {
      const draftName = projectStore.createDraft();
      const newName = "my-real-project";

      // Write some state to the draft
      const statePath = projectStore.workspaceStatePath(draftName);
      fs.writeFileSync(statePath, JSON.stringify({ test: true }), "utf-8");

      // Create a repo file in the draft's repos directory
      const repoFile = path.join(projectStore.reposDir(draftName), "some-repo", "readme.md");
      fs.mkdirSync(path.dirname(repoFile), { recursive: true });
      fs.writeFileSync(repoFile, "hello", "utf-8");

      // Convert
      projectStore.saveDraftAs(draftName, newName);

      // State should be at the new path
      const newStatePath = projectStore.workspaceStatePath(newName);
      expect(fs.existsSync(newStatePath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(newStatePath, "utf-8"))).toEqual({ test: true });

      // Repos should be at the new path
      const movedRepo = path.join(projectStore.reposDir(newName), "some-repo", "readme.md");
      expect(fs.existsSync(movedRepo)).toBe(true);
      expect(fs.readFileSync(movedRepo, "utf-8")).toBe("hello");
    });
  });

  describe("gcDrafts", () => {
    test("deletes drafts older than maxAge", () => {
      const oldDraft = projectStore.createDraft();
      // Back-date the config to make it look old
      const config = projectStore.readConfig(oldDraft)!;
      config.createdAt = new Date(Date.now() - DRAFT_MAX_AGE_MS - 86_400_000).toISOString(); // 1 day older
      config.draft = true;
      fs.writeFileSync(projectStore.configPath(oldDraft), JSON.stringify(config, null, 2), "utf-8");

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      expect(deleted).toBe(1);
      expect(projectStore.exists(oldDraft)).toBe(false);
    });

    test("preserves drafts younger than maxAge", () => {
      const recentDraft = projectStore.createDraft(); // just created

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      expect(deleted).toBe(0);
      expect(projectStore.exists(recentDraft)).toBe(true);
    });

    test("preserves normal projects regardless of age", () => {
      const oldProject = "old-project";
      projectStore.create(oldProject);
      // Manually back-date the config
      const config = projectStore.readConfig(oldProject)!;
      config.createdAt = new Date(0).toISOString(); // epoch — very old
      fs.writeFileSync(
        projectStore.configPath(oldProject),
        JSON.stringify(config, null, 2),
        "utf-8",
      );

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      // Should not delete normal projects, even if old
      expect(deleted).toBe(0);
      expect(projectStore.exists(oldProject)).toBe(true);
    });

    test("preserves draft-named projects that were saved (draft flag removed)", () => {
      const draftName = projectStore.createDraft();
      projectStore.saveDraftAs(draftName, "saved-project");

      // The "saved-project" directory shouldn't match the draft name pattern,
      // so it's not touched by GC. But let's also test a project whose directory
      // name matches the draft pattern but config.draft is false.
      const fakeDraftName = "draft-looks-like-one.draft";
      projectStore.create(fakeDraftName);
      const config = projectStore.readConfig(fakeDraftName)!;
      config.draft = false;
      config.createdAt = new Date(0).toISOString();
      fs.writeFileSync(
        projectStore.configPath(fakeDraftName),
        JSON.stringify(config, null, 2),
        "utf-8",
      );

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      expect(deleted).toBe(0);
      expect(projectStore.exists(fakeDraftName)).toBe(true);
    });

    test("deletes only old drafts among multiple projects", () => {
      // Create two drafts — one old, one recent
      const oldDraft = projectStore.createDraft();
      let config = projectStore.readConfig(oldDraft)!;
      config.createdAt = new Date(Date.now() - DRAFT_MAX_AGE_MS - 86_400_000).toISOString();
      config.draft = true;
      fs.writeFileSync(projectStore.configPath(oldDraft), JSON.stringify(config, null, 2), "utf-8");

      const recentDraft = projectStore.createDraft(); // fresh
      projectStore.create("normal-project");

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      expect(deleted).toBe(1);
      expect(projectStore.exists(oldDraft)).toBe(false);
      expect(projectStore.exists(recentDraft)).toBe(true);
      expect(projectStore.exists("normal-project")).toBe(true);
    });

    test("returns 0 when no drafts exist", () => {
      projectStore.create("project-a");
      projectStore.create("project-b");

      const deleted = projectStore.gcDrafts(DRAFT_MAX_AGE_MS);

      expect(deleted).toBe(0);
    });

    test("returns 0 when openp41ge directory doesn't exist", () => {
      // Use a path that doesn't exist
      const emptyStore = new ProjectStore(path.join(tmpDir, "nonexistent"));
      const deleted = emptyStore.gcDrafts(DRAFT_MAX_AGE_MS);
      expect(deleted).toBe(0);
    });
  });
});
