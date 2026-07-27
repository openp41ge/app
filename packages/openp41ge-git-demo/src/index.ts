import { GitService, TestGitAdapter } from "openp41ge-git";

const adapter = new TestGitAdapter();
const service = new GitService(adapter);

// ---- Seed some test data ----
adapter.addBranch("demo-repo", "main");
adapter.addBranch("demo-repo", "develop");
adapter.addBranch("demo-repo", "feature/new-ui");
adapter.addWorktreeData("demo-repo", "main", "/workspaces/demo-repo/main");
adapter.addRepo(
  "demo-repo",
  "https://github.com/example/demo-repo.git",
  "/workspaces/demo-repo",
);

// ---- DOM refs ----
const $ = (id: string) => document.getElementById(id)!;

const cloneUrl = $("clone-url") as HTMLInputElement;
const cloneBtn = $("clone-btn") as HTMLButtonElement;
const cloneProgress = $("clone-progress");
const repoList = $("repo-list");
const repoDetail = $("repo-detail");
const branchName = $("branch-name") as HTMLInputElement;
const addBranchBtn = $("add-branch-btn") as HTMLButtonElement;
const branchList = $("branch-list");
const wtBranch = $("wt-branch") as HTMLInputElement;
const addWtBtn = $("add-wt-btn") as HTMLButtonElement;
const wtList = $("wt-list");

let selectedRepo: string | null = null;

// ---- Render helpers ----

function tag(text: string, cls: string = ""): string {
  return `<span class="tag ${cls}">${escapeHtml(text)}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clear(el: HTMLElement): void {
  el.innerHTML = "";
}

function empty(el: HTMLElement, msg: string): void {
  el.innerHTML = `<div class="empty">${escapeHtml(msg)}</div>`;
}

function btn(label: string, cls: string = "", onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

// ---- Clone ----

cloneBtn.addEventListener("click", async () => {
  const url = cloneUrl.value.trim();
  if (!url) return;

  cloneBtn.disabled = true;
  cloneProgress.innerHTML = `<div class="loading"></div> Cloning...`;

  try {
    const session = service.clone(url);
    session.onProgress((p) => {
      cloneProgress.innerHTML = `
        <div>Cloning... ${p.percent}%</div>
        <div class="progress-bar"><div class="fill" style="width:${p.percent}%"></div></div>
      `;
    });
    const result = await session.promise;
    if (result.success) {
      cloneProgress.innerHTML = `<div>${tag("Cloned successfully", "success")} → ${escapeHtml(result.path ?? "")}</div>`;
      cloneUrl.value = "";
    } else {
      cloneProgress.innerHTML = `<div>${tag("Error", "error")} ${escapeHtml(result.error ?? "Unknown error")}</div>`;
    }
  } catch (err: any) {
    cloneProgress.innerHTML = `<div>${tag("Error", "error")} ${escapeHtml(err.message ?? String(err))}</div>`;
  } finally {
    cloneBtn.disabled = false;
    renderRepos();
  }
});

// ---- Repos ----

async function renderRepos(): Promise<void> {
  const repos = await service.listRepos();
  clear(repoList);
  if (repos.length === 0) {
    empty(repoList, "No repos. Clone one above.");
    return;
  }
  const ul = document.createElement("ul");
  for (const repo of repos) {
    const li = document.createElement("li");
    li.style.cursor = "pointer";
    li.innerHTML = `
      <span class="repo-name">${escapeHtml(repo.name)}</span>
      <span style="color:#888;font-size:11px;">${escapeHtml(repo.url)}</span>
    `;
    li.addEventListener("click", () => selectRepo(repo.name));
    ul.appendChild(li);
  }
  repoList.appendChild(ul);
}

async function selectRepo(name: string): Promise<void> {
  selectedRepo = name;
  renderRepoDetail();
  renderBranches();
  renderWorktrees();
}

async function renderRepoDetail(): Promise<void> {
  if (!selectedRepo) {
    empty(repoDetail, "Select a repo to see details");
    return;
  }
  const repo = await service.getRepo(selectedRepo);
  if (!repo) {
    empty(repoDetail, "Repo not found");
    return;
  }
  const wts = await service.listWorktrees(selectedRepo);
  repoDetail.innerHTML = `
    <div class="row"><strong>Name:</strong> ${escapeHtml(repo.name)}</div>
    <div class="row"><strong>URL:</strong> ${escapeHtml(repo.url)}</div>
    <div class="row"><strong>Path:</strong> ${escapeHtml(repo.path)}</div>
    <div class="row"><strong>Worktrees:</strong> ${wts.length}</div>
    <div class="row" style="margin-top:8px;">
      <button class="danger" id="remove-repo-btn">Remove Repo</button>
      <button id="pull-btn">Pull</button>
      <button id="fetch-btn">Fetch</button>
    </div>
  `;
  $("remove-repo-btn")?.addEventListener("click", async () => {
    await service.removeRepo(selectedRepo!);
    selectedRepo = null;
    renderRepos();
    renderRepoDetail();
    renderBranches();
    renderWorktrees();
  });
  $("pull-btn")?.addEventListener("click", async () => {
    await service.pullBranch(selectedRepo!, "main");
    alert("Pull completed (no-op in memory)");
  });
  $("fetch-btn")?.addEventListener("click", async () => {
    await service.fetch(selectedRepo!);
    alert("Fetch completed (no-op in memory)");
  });
}

// ---- Branches ----

addBranchBtn.addEventListener("click", async () => {
  const name = branchName.value.trim();
  if (!name || !selectedRepo) return;
  adapter.addBranch(selectedRepo, name);
  branchName.value = "";
  renderBranches();
});

async function renderBranches(): Promise<void> {
  if (!selectedRepo) {
    empty(branchList, "Select a repo first");
    return;
  }
  const branches = await service.listBranches(selectedRepo);
  clear(branchList);
  if (branches.length === 0) {
    empty(branchList, "No branches");
    return;
  }
  const ul = document.createElement("ul");
  for (const b of branches) {
    const li = document.createElement("li");
    const def = await service.getDefaultBranch(selectedRepo);
    li.innerHTML = `
      ${escapeHtml(b)}
      ${b === def ? tag("default", "success") : ""}
    `;
    ul.appendChild(li);
  }
  branchList.appendChild(ul);
}

// ---- Worktrees ----

addWtBtn.addEventListener("click", async () => {
  const branch = wtBranch.value.trim();
  if (!branch || !selectedRepo) return;
  try {
    await service.addWorktree(selectedRepo, branch);
    wtBranch.value = "";
    renderWorktrees();
    renderRepoDetail();
  } catch (err: any) {
    alert(`Error: ${err.message}`);
  }
});

async function renderWorktrees(): Promise<void> {
  if (!selectedRepo) {
    empty(wtList, "Select a repo first");
    return;
  }
  const wts = await service.listWorktrees(selectedRepo);
  clear(wtList);
  if (wts.length === 0) {
    empty(wtList, "No worktrees");
    return;
  }
  const ul = document.createElement("ul");
  for (const wt of wts) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${escapeHtml(wt.branch)}</span>
      <span style="color:#888;font-size:11px;">${escapeHtml(wt.path)}</span>
      ${wt.exists ? tag("exists", "success") : tag("missing", "error")}
    `;
    const delBtn = btn("Delete", "danger", async () => {
      await service.deleteWorktree(selectedRepo!, wt.branch);
      renderWorktrees();
      renderRepoDetail();
    });
    li.appendChild(delBtn);
    ul.appendChild(li);
  }
  wtList.appendChild(ul);
}

// ---- Init ----

renderRepos();
renderRepoDetail();
renderBranches();
renderWorktrees();
