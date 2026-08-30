/**
 * WorktreeStore — the single on-disk layout for the Openp41ge repositories
 * store, shared by the Explorer (NodeGitService) and the Workspaces overlay
 * (workspaceData:* IPC). Extracted from workspace-handlers.ts so the layout
 * rules and git operations are:
 *
 *   1. One source of truth (repos belong to the workspace; one store).
 *   2. Testable against a temporary directory (no Electron imports).
 *   3. Behaviourally identical to NodeGitService.checkoutWorktree for
 *      materialization (local branch → remote fetch → create-from-HEAD).
 *
 * Layout:
 *   <reposRootDir>/<provider>/<org-path>/<repo>/   (e.g. github.com/tw050x/ascii-drawing-tool)
 *       .git/                       — bare repo
 *       <branch with "/"→"--">/      — sibling worktree folders
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export function runGit(
  args: string[],
  cwd?: string,
  timeout = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Derive the repository directory name from a git URL, matching
 * NodeGitService._deriveRepoName so both surfaces land on the same repo.
 *   git@github.com:tw050x/ascii-drawing-tool.git → github.com/tw050x/ascii-drawing-tool
 */
function deriveRepoDirName(url: string): string {
  const cleaned = url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "");
  const parts = cleaned.split(/[/:]/);
  const provider = parts[0];
  const repoName = parts[parts.length - 1];
  const orgPath = parts.slice(1, -1).join("/");
  return orgPath ? `${provider}/${orgPath}/${repoName}` : `${provider}/${repoName}`;
}

export interface WorktreeStore {
  /** Root of the store (all repos, one per <provider>/<org>/<repo> subtree). */
  getReposDir(): string;
  deriveRepoDirName(url: string): string;
  /** Parent directory holding .git/ and the sibling worktree folders. */
  getRepoParent(url: string): string;
  /** Bare .git directory for a repo URL. */
  getRepoDir(url: string): string;
  /** Worktree folder for a repo URL + branch (sibling of .git/). */
  getWorktreePath(url: string, branch: string): string;
  /** Whether the repo has been cloned (bare .git exists). */
  repoAlreadyCloned(url: string): boolean;
  /** Check a worktree branch for existence/divergence (see checkWorktreeBranch). */
  checkWorktreeBranch(
    wsDir: string,
    url: string,
    branch: string,
    isDetail?: boolean,
  ): Promise<WorktreeBranchStatus>;
  /** Materialize (create or re-create) a worktree for a repo URL + branch. */
  checkoutWorktreeBranch(url: string, branch: string): Promise<{ ok: boolean; error?: string }>;
  /** Resync a worktree branch to match its remote. */
  syncWorktreeBranch(url: string, branch: string): Promise<{ ok: boolean; error?: string }>;
  /** Clone a bare repo for the given URL (idempotent). */
  cloneBareRepo(url: string): Promise<{ ok: boolean; error?: string }>;
  /** Check remote URL accessibility via git ls-remote. */
  checkRepoAccess(url: string): Promise<{ ok: boolean; error?: string }>;
}

export type WorktreeBranchStatus = {
  status: "success" | "failure" | "diverged" | "needs-sync" | "missing";
  error?: string;
  warning?: string;
};

/**
 * Ensure a bare repo fetches remote-tracking refs (refs/remotes/origin/*)
 * so ahead/behind divergence checks work. Bare clones don't get a fetch
 * refspec by default, which silently disables sync-status detection.
 */
async function ensureRemoteRefs(gitDir: string): Promise<void> {
  let fetchSpec = "";
  try {
    const { stdout } = await runGit(["config", "--get", "remote.origin.fetch"], gitDir);
    fetchSpec = stdout.trim();
  } catch {
    // Key missing — fetchSpec stays empty and we set it below.
  }
  if (fetchSpec !== "+refs/heads/*:refs/remotes/origin/*") {
    await runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], gitDir);
  }
  await runGit(["fetch", "origin", "--quiet"], gitDir);
}

export function createWorktreeStore(reposRootDir: string): WorktreeStore {
  const getReposDir = (): string => reposRootDir;

  const getRepoParent = (url: string): string =>
    path.join(reposRootDir, deriveRepoDirName(url));

  const getRepoDir = (url: string): string =>
    path.join(getRepoParent(url), ".git");

  const getWorktreePath = (url: string, branch: string): string =>
    path.join(getRepoParent(url), branch.replace(/\//g, "--"));

  const repoAlreadyCloned = (url: string): boolean => {
    const gitDir = getRepoDir(url);
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  };

  /**
   * Check if a remote URL is accessible via git ls-remote.
   * Returns { ok: true } or { ok: false, error: string }.
   */
  async function checkRepoAccess(url: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await runGit(["ls-remote", "--heads", url]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Check a worktree branch for existence and divergence.
   *
   * If the repo isn't cloned yet, checks via ls-remote.
   * If cloned, fetches then checks local/remote divergence.
   * A declared worktree whose folder is absent is surfaced as "missing".
   */
  async function checkWorktreeBranch(
    wsDir: string,
    url: string,
    branch: string,
    _isDetail = false,
  ): Promise<WorktreeBranchStatus> {
    const gitDir = getRepoDir(url);
    const cloned = fs.existsSync(gitDir);

    if (!cloned) {
      // Repo not cloned yet — check if branch exists on remote via ls-remote
      try {
        const { stdout } = await runGit(["ls-remote", "--heads", url, "refs/heads/" + branch]);
        if (stdout.trim()) {
          return { status: "success" };
        }
        // Also check if the ref is the default branch (HEAD)
        const { stdout: headStdout } = await runGit(["ls-remote", "--symref", url, "HEAD"]);
        const headMatch = headStdout.match(/ref: refs\/heads\/(\S+)\tHEAD/);
        if (headMatch && headMatch[1] === branch) {
          return { status: "success" };
        }
        return {
          status: "success",
          warning: `Branch "${branch}" not found on remote — will be created locally`,
        };
      } catch (e) {
        return { status: "failure", error: (e as Error).message };
      }
    }

    // Repo is cloned — fetch to get latest remote state
    try {
      await ensureRemoteRefs(gitDir);
    } catch {
      // Fetch is best-effort — proceed with what we have
    }

    // Declared worktree whose folder hasn't been materialized yet (e.g. the
    // bare repo was added but the user hasn't created the worktree, or the
    // folder was deleted). Surface it as "missing" so the Workspaces overlay
    // can offer a create/re-create (re-materialize) action.
    const wtDir = getWorktreePath(url, branch);
    if (!fs.existsSync(wtDir)) {
      return { status: "missing" };
    }

    // Check if branch exists locally
    try {
      const { stdout: localBranches } = await runGit(["branch", "--list", branch], gitDir);
      const existsLocally = localBranches.trim().length > 0;

      // Check if branch exists on remote
      let existsRemotely = false;
      try {
        const { stdout: remoteBranches } = await runGit(
          ["branch", "--list", "-r", "origin/" + branch],
          gitDir,
        );
        existsRemotely = remoteBranches.trim().length > 0;
      } catch {
        // If remote check fails, proceed with local-only check
      }

      if (!existsLocally && !existsRemotely) {
        return {
          status: "success",
          warning: `Branch "${branch}" does not exist yet — will be created locally on checkout`,
        };
      }

      if (existsLocally && existsRemotely) {
        // Check divergence: git rev-list --left-right --count
        try {
          const { stdout: counts } = await runGit(
            ["rev-list", "--left-right", "--count", `origin/${branch}...${branch}`],
            gitDir,
          );
          const trimmed = counts.trim();
          const parts = trimmed.split(/\s+/);
          if (parts.length === 2) {
            const behindRemote = parseInt(parts[0], 10);
            const aheadRemote = parseInt(parts[1], 10);
            if (behindRemote > 0 && aheadRemote > 0) {
              return {
                status: "diverged",
                error: `Local and remote branches have diverged (${aheadRemote} ahead, ${behindRemote} behind). Resolve before checking out.`,
              };
            }
            if (behindRemote > 0 || aheadRemote > 0) {
              return {
                status: "needs-sync",
                error: `Branch is ${aheadRemote > 0 ? aheadRemote + " ahead" : ""}${aheadRemote > 0 && behindRemote > 0 ? ", " : ""}${behindRemote > 0 ? behindRemote + " behind" : ""} remote. Sync to continue.`,
              };
            }
          }
        } catch {
          // Divergence check is best-effort
        }
      }

      return { status: "success" };
    } catch (e) {
      return { status: "failure", error: (e as Error).message };
    }
  }

  /**
   * git worktree add, tolerating stale registrations: if the path is already
   * registered in the bare repo's metadata but the folder is gone (folder
   * deleted behind git's back), prune then retry once.
   */
  async function addWorktree(wtDir: string, branch: string, gitDir: string): Promise<true | string> {
    const attempt = (): Promise<void> =>
      runGit(["worktree", "add", "--checkout", wtDir, branch], gitDir).then(() => undefined);
    try {
      await attempt();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Stale worktree metadata (dir deleted while still registered): prune
      // and retry once. Match the same collision wording git uses.
      if (/already registered|already used by worktree|add -f|already checked out/i.test(msg)) {
        try {
          await runGit(["worktree", "prune"], gitDir);
          if (fs.existsSync(wtDir)) return true;
          await attempt();
          return true;
        } catch (err2) {
          return err2 instanceof Error ? err2.message : String(err2);
        }
      }
      return msg;
    }
  }

  /**
   * Materialize a worktree for a given repo URL + branch — mirroring
   * NodeGitService.checkoutWorktree so the Workspaces overlay's
   * create/re-create behaves exactly like Explorer/workspace activation:
   * local branch → remote fetch → create-from-HEAD, idempotent + collision
   * tolerant. Also prunes stale registrations left by a deleted folder.
   */
  async function checkoutWorktreeBranch(
    url: string,
    branch: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const gitDir = getRepoDir(url);
    const parent = getRepoParent(url);
    const wtDir = getWorktreePath(url, branch);

    if (!fs.existsSync(parent) || !fs.existsSync(gitDir)) {
      return { ok: false, error: "Repository not cloned yet. Clone before checking out worktrees." };
    }

    if (fs.existsSync(wtDir)) {
      return { ok: true }; // Already exists
    }

    try {
      fs.mkdirSync(parent, { recursive: true });

      // Local branch exists — create worktree directly.
      let branchExists = false;
      try {
        const { stdout } = await runGit(["rev-parse", "--verify", branch], gitDir);
        branchExists = !!stdout;
      } catch {
        branchExists = false;
      }
      if (branchExists) {
        const res = await addWorktree(wtDir, branch, gitDir);
        return res === true ? { ok: true } : { ok: false, error: res };
      }

      // Branch exists on remote — fetch it into a local branch, then worktree.
      let remoteExists = false;
      try {
        const { stdout } = await runGit(["ls-remote", "--heads", url, "refs/heads/" + branch], gitDir);
        remoteExists = !!stdout.trim();
      } catch {
        remoteExists = false;
      }
      if (remoteExists) {
        await runGit(["fetch", "origin", `${branch}:${branch}`], gitDir);
        const res = await addWorktree(wtDir, branch, gitDir);
        return res === true ? { ok: true } : { ok: false, error: res };
      }

      // Branch exists nowhere we can see — create it from HEAD (a branch
      // created locally but never materialized). "Already exists" from a
      // concurrent window is not an error, just worktree-add it.
      try {
        await runGit(["branch", branch], gitDir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(msg)) return { ok: false, error: msg };
      }
      const res = await addWorktree(wtDir, branch, gitDir);
      return res === true ? { ok: true } : { ok: false, error: res };
    } catch (err) {
      // Another window may have checked out this branch's worktree
      // concurrently; if the dir now exists treat it as materialized.
      const msg = err instanceof Error ? err.message : String(err);
      if (/already used by worktree|already checked out/i.test(msg) && fs.existsSync(wtDir)) {
        return { ok: true };
      }
      return { ok: false, error: msg };
    }
  }

  /**
   * Resync a worktree branch to match its remote: fetch, then reset the local
   * branch (and checked-out worktree, if any) to origin/<branch>.
   * Discards local-only commits on that branch.
   */
  async function syncWorktreeBranch(
    url: string,
    branch: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const gitDir = getRepoDir(url);
    const wtDir = getWorktreePath(url, branch);
    if (!fs.existsSync(gitDir)) {
      return { ok: false, error: "Repository not cloned yet. Clone before syncing." };
    }
    try {
      await ensureRemoteRefs(gitDir);
      const { stdout: remoteBranches } = await runGit(
        ["branch", "--list", "-r", "origin/" + branch],
        gitDir,
      );
      if (!remoteBranches.trim()) {
        return { ok: false, error: `Branch "${branch}" does not exist on remote.` };
      }
      if (fs.existsSync(wtDir)) {
        // Worktree checked out — reset it in place (also moves the branch ref).
        await runGit(["reset", "--hard", "origin/" + branch], wtDir);
      } else {
        // No worktree — move the local branch ref to match remote.
        await runGit(["update-ref", "refs/heads/" + branch, "refs/remotes/origin/" + branch], gitDir);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Clone a bare repo for the given URL (idempotent).
   */
  async function cloneBareRepo(url: string): Promise<{ ok: boolean; error?: string }> {
    const repoParentDir = path.dirname(getRepoDir(url));
    const gitDir = getRepoDir(url);

    if (fs.existsSync(gitDir)) {
      return { ok: true }; // Already exists
    }

    try {
      fs.mkdirSync(repoParentDir, { recursive: true });
      await runGit(["clone", "--bare", url, gitDir]);
      // Ensure future fetches build remote-tracking refs for sync-status checks.
      await runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], gitDir);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      // Best effort: a partial clone dir may exist — clean it up on failure.
      try {
        fs.rmSync(gitDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg };
    }
  }

  return {
    getReposDir,
    deriveRepoDirName,
    getRepoParent,
    getRepoDir,
    getWorktreePath,
    repoAlreadyCloned,
    checkWorktreeBranch,
    checkoutWorktreeBranch,
    syncWorktreeBranch,
    cloneBareRepo,
    checkRepoAccess,
  };
}
