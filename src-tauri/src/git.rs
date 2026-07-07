// src-tauri/src/git.rs
// git.rs has no direct schemars dependency; it reaches the crate through
// rmcp's re-export. The derive is needed so WorktreeInfo can ride inside a
// JsonSchema-described MCP tool result (see mcp/tools/worktree.rs).
use rmcp::schemars;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Build a `git` Command. On Windows, set CREATE_NO_WINDOW (0x08000000) so
/// spawning git from the GUI (no-console) release binary doesn't flash a
/// console window each call — same flag `shell.rs` uses for its wsl probe.
fn git_command() -> Command {
    let mut cmd = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    // Force English git output: error-classification (e.g. "already exists")
    // and porcelain-adjacent parsing must not depend on the user's locale —
    // git ships full translations (incl. Vietnamese) that would break both.
    cmd.env("LC_ALL", "C");
    cmd
}

#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
    pub is_main: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String, // "M", "A", "D", "R", "?"
    pub added: u32,
    pub removed: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub head_sha: String,
    pub branch: String,
    pub ahead: Option<i32>,
    pub behind: Option<i32>,
}

/// True when `repo_root` is the home directory or an ancestor of it — i.e. a
/// repo we should ignore because the project folder merely sits *inside* it
/// (e.g. the user's home dir is itself a git repo, so git discovery walks up
/// and attaches to it). `home.starts_with(repo_root)` holds both when
/// root == home and when root is an ancestor of home.
///
/// Inputs are assumed already normalized (see `list_worktrees`, which
/// canonicalizes before calling) so this stays trivially testable.
fn should_ignore_repo_root(repo_root: &Path, home: &Path) -> bool {
    home.starts_with(repo_root)
}

/// Parse the text output of `git worktree list --porcelain`.
pub fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
    let mut results = Vec::new();
    let mut path = String::new();
    let mut head = String::new();
    let mut branch = String::new();
    let mut is_first = true;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            if !path.is_empty() {
                results.push(WorktreeInfo {
                    path: path.clone(),
                    branch: branch.clone(),
                    head: head.chars().take(7).collect(),
                    is_main: is_first,
                });
                is_first = false;
                path.clear();
                head.clear();
                branch.clear();
            }
            path = line["worktree ".len()..].to_string();
        } else if line.starts_with("HEAD ") {
            head = line["HEAD ".len()..].to_string();
        } else if line.starts_with("branch ") {
            let refs = &line["branch ".len()..];
            branch = refs.strip_prefix("refs/heads/").unwrap_or(refs).to_string();
        } else if line == "detached" {
            branch = "(detached)".to_string();
        }
    }
    if !path.is_empty() {
        results.push(WorktreeInfo {
            path,
            branch,
            head: head.chars().take(7).collect(),
            is_main: is_first,
        });
    }
    results
}

pub fn list_worktrees(cwd: &Path, home: &Path) -> Result<Vec<WorktreeInfo>, String> {
    let p = cwd.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", cwd.display()))?;
    let out = git_command()
        .args(["-C", p, "worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    // Non-zero exit means cwd is not inside any git repo — treat as "no git
    // here" (empty list drives the panel's empty state) rather than surfacing
    // a raw "fatal: not a git repository" error.
    if !out.status.success() {
        return Ok(Vec::new());
    }
    let trees = parse_worktree_list(&String::from_utf8_lossy(&out.stdout));
    // The main worktree's path is the repo root. If that root is the home
    // directory or an ancestor of it, the project folder merely sits inside an
    // unrelated repo (e.g. home is itself a repo); return empty instead of
    // attaching — this also avoids the heavy `git status`/`diff` calls that
    // would otherwise run against the entire home tree downstream.
    if let Some(main) = trees.iter().find(|w| w.is_main) {
        let root = Path::new(&main.path);
        let root_norm = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        let home_norm = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
        if should_ignore_repo_root(&root_norm, &home_norm) {
            return Ok(Vec::new());
        }
    }
    Ok(trees)
}

/// Parse `git status --porcelain=v1` + `git diff HEAD --numstat` output.
/// Merges by file path: status letter from `status_out`, line counts from `numstat_out`.
///
/// Limitations:
/// - Binary files produce `added = 0, removed = 0` (numstat emits `-\t-\tpath` for binaries).
/// - Staged-new files (`A`) also produce `added = 0` because `git diff HEAD` omits files not
///   yet in HEAD; only `git diff --cached` would capture their line counts.
pub fn parse_changed_files(status_out: &str, numstat_out: &str) -> Vec<ChangedFile> {
    let mut counts: HashMap<String, (u32, u32)> = HashMap::new();
    for line in numstat_out.lines() {
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() == 3 {
            let added: u32 = parts[0].parse().unwrap_or(0);
            let removed: u32 = parts[1].parse().unwrap_or(0);
            counts.insert(parts[2].to_string(), (added, removed));
        }
    }

    let mut files = Vec::new();
    for line in status_out.lines() {
        if line.len() < 4 { continue; }
        let xy = &line[..2];
        let path = line[3..].trim().to_string();

        let status = if xy == "??" {
            "?".to_string()
        } else {
            // X (index) takes priority over Y (working-tree); a file appears at most once per path.
            let ch = if xy.chars().next() != Some(' ') {
                xy.chars().next().unwrap_or(' ')
            } else {
                xy.chars().nth(1).unwrap_or(' ')
            };
            ch.to_string()
        };

        // Renames are emitted as "new-path\told-path"; take the new path only.
        let display_path = path.split('\t').next().unwrap_or(&path).to_string();
        let (added, removed) = counts.get(&display_path).copied().unwrap_or((0, 0));
        files.push(ChangedFile { path: display_path, status, added, removed });
    }
    files
}

/// Parse the output of `git status --porcelain=v2 --branch` for commit metadata.
pub fn parse_commit_info(output: &str) -> CommitInfo {
    let mut head_sha = String::new();
    let mut branch = String::new();
    let mut ahead: Option<i32> = None;
    let mut behind: Option<i32> = None;

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("# branch.oid ") {
            head_sha = rest.chars().take(7).collect();
        } else if let Some(rest) = line.strip_prefix("# branch.head ") {
            branch = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // format: "+N -M"
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() == 2 {
                ahead = parts[0].trim_start_matches('+').parse().ok();
                behind = parts[1].trim_start_matches('-').parse().ok();
            }
        }
    }
    CommitInfo { head_sha, branch, ahead, behind }
}

pub fn get_file_diff(worktree_path: &Path, file: &str) -> Result<String, String> {
    let p = worktree_path.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", worktree_path.display()))?;
    let out = git_command()
        .args(["-C", p, "diff", "HEAD", "--", file])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn get_commit_info(worktree_path: &Path) -> Result<CommitInfo, String> {
    let p = worktree_path.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", worktree_path.display()))?;
    let out = git_command()
        .args(["-C", p, "status", "--porcelain=v2", "--branch"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(parse_commit_info(&String::from_utf8_lossy(&out.stdout)))
}

pub fn get_changed_files(worktree_path: &Path) -> Result<Vec<ChangedFile>, String> {
    let p = worktree_path.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", worktree_path.display()))?;

    let status_out = git_command()
        .args(["-C", p, "status", "--porcelain=v1"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !status_out.status.success() {
        return Err(String::from_utf8_lossy(&status_out.stderr).trim().to_string());
    }

    // numstat may fail on a fresh repo with no commits — treat as empty
    let numstat_out = git_command()
        .args(["-C", p, "diff", "HEAD", "--numstat"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    let numstat_str = if numstat_out.status.success() {
        String::from_utf8_lossy(&numstat_out.stdout).to_string()
    } else {
        String::new()
    };

    Ok(parse_changed_files(
        &String::from_utf8_lossy(&status_out.stdout),
        &numstat_str,
    ))
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWorktree {
    pub path: String,
    pub branch: String,
}

/// Conservative subset of git's ref rules. Stricter than git so a name that
/// passes here can never smuggle path traversal into the directory slug.
pub fn validate_branch_name(branch: &str) -> Result<(), String> {
    if branch.is_empty() || branch.len() > 100 {
        return Err("branch name must be 1-100 characters".into());
    }
    if !branch
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
    {
        return Err("branch name may only contain letters, digits, '-', '_', '.', '/'".into());
    }
    if branch.starts_with(['/', '-', '.']) || branch.ends_with(['/', '.']) {
        return Err("branch name may not start or end with '/', '-', '.'".into());
    }
    if branch.contains("..") || branch.contains("//") || branch.ends_with(".lock") {
        return Err("branch name may not contain '..', '//' or end with '.lock'".into());
    }
    Ok(())
}

/// Directory name for a branch's worktree. Callers validate first, so the only
/// transforms left are flattening '/' and capping length (Windows MAX_PATH).
pub fn branch_slug(branch: &str) -> String {
    branch
        .chars()
        .map(|c| if c == '/' { '-' } else { c })
        .take(48)
        .collect()
}

/// Sibling container next to the repo: C:\dev\myapp -> C:\dev\myapp.worktrees.
/// Outside the repo so in-repo watchers/linters/agents never scan checkouts.
pub fn worktrees_dir_for(main_root: &Path) -> Option<PathBuf> {
    let name = main_root.file_name()?.to_str()?;
    Some(main_root.parent()?.join(format!("{name}.worktrees")))
}

/// True only for paths strictly inside the swarmterm-managed container —
/// the removal guard that makes deleting the main worktree unrepresentable.
pub fn is_inside_worktrees_dir(path: &Path, main_root: &Path) -> bool {
    use std::path::Component;
    // `Path::starts_with` is a lexical prefix check: it does not resolve
    // `..`, so "…/myapp.worktrees/../../other" would pass a bare prefix
    // test while resolving outside the container. Rejecting ParentDir /
    // CurDir components keeps the guard sound without canonicalize(),
    // which fails on already-deleted paths.
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return false;
    }
    match worktrees_dir_for(main_root) {
        Some(dir) => path.starts_with(&dir) && path != dir,
        None => false,
    }
}

/// Main repo root, resolved via --git-common-dir so a call made from inside a
/// linked worktree still lands on the main root — worktrees stay siblings,
/// never nest (guard borrowed from the design-docs using-git-worktrees skill).
pub fn resolve_main_root(cwd: &Path) -> Result<PathBuf, String> {
    let p = cwd
        .to_str()
        .ok_or_else(|| format!("non-UTF-8 path: {}", cwd.display()))?;
    let out = git_command()
        .args(["-C", p, "rev-parse", "--path-format=absolute", "--git-common-dir"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err("not a git repository".into());
    }
    let git_dir = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    git_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "unexpected git dir layout".to_string())
}

/// Ensure a directory is a git repository with at least one commit, ready for
/// `create_worktree`. If `path` is not its own repo — or only sits *inside* an
/// unrelated parent repo (classically the user's home dir being a git repo) —
/// a fresh repo is initialized in `path`. If the repo has no commits (unborn
/// HEAD) a `.gitkeep` placeholder is committed so `git worktree add` (which
/// cannot check out an unborn HEAD) works. Returns Ok(()) once the repo is
/// ready, or Err(message) if any git step fails.
///
/// `home` is the user's home directory; it guards against attaching to a repo
/// that merely *contains* `path`, mirroring `list_worktrees`' own guard
/// (`should_ignore_repo_root`). Without it, picking any folder under a
/// home-level repo would make us provision worktrees of that whole repo.
pub fn ensure_repo_with_commit(path: &Path, home: &Path) -> Result<(), String> {
    let path_str = path
        .to_str()
        .ok_or_else(|| format!("non-UTF-8 path: {}", path.display()))?;

    // Step 1: Does `path` live in its OWN repo? `--show-toplevel` gives the
    // absolute root git found by walking up from `path`. If that root is home
    // (or an ancestor of home) the folder only sits inside an unrelated repo —
    // treat it as "no repo here" and init a fresh one, exactly as list_worktrees
    // ignores such roots. `--git-dir` is wrong here: it returns a bare ".git"
    // from a repo root, whose parent is empty, defeating the guard.
    let toplevel_out = git_command()
        .args(["-C", path_str, "rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    let is_own_repo = if toplevel_out.status.success() {
        let root = PathBuf::from(String::from_utf8_lossy(&toplevel_out.stdout).trim());
        let root_norm = root.canonicalize().unwrap_or_else(|_| root.clone());
        let home_norm = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
        !should_ignore_repo_root(&root_norm, &home_norm)
    } else {
        // Not inside any repo — a fresh init is exactly what's wanted.
        false
    };

    if !is_own_repo {
        // Not a repo yet, initialize it
        let init_out = git_command()
            .args(["-C", path_str, "init"])
            .output()
            .map_err(|e| format!("git not found: {e}"))?;

        if !init_out.status.success() {
            return Err(String::from_utf8_lossy(&init_out.stderr).trim().to_string());
        }

        // Configure git user for this repo (required to commit)
        git_command()
            .args(["-C", path_str, "config", "user.email", "user@example.com"])
            .output()
            .map_err(|e| format!("git config failed: {e}"))?;

        git_command()
            .args(["-C", path_str, "config", "user.name", "Swarmterm"])
            .output()
            .map_err(|e| format!("git config failed: {e}"))?;
    }

    // Step 2: Check if HEAD is valid (repo has commits)
    let head_ok = git_command()
        .args(["-C", path_str, "rev-parse", "--verify", "--quiet", "HEAD"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?
        .status
        .success();

    if !head_ok {
        // Unborn HEAD — repo exists but has no commits
        // Create .gitkeep placeholder so we have something to commit
        let gitkeep_path = path.join(".gitkeep");
        std::fs::write(&gitkeep_path, "")
            .map_err(|e| format!("failed to create .gitkeep: {e}"))?;

        // Stage and commit
        let add_out = git_command()
            .args(["-C", path_str, "add", "."])
            .output()
            .map_err(|e| format!("git not found: {e}"))?;

        if !add_out.status.success() {
            return Err(String::from_utf8_lossy(&add_out.stderr).trim().to_string());
        }

        let commit_out = git_command()
            .args(["-C", path_str, "commit", "-m", "Initial commit"])
            .output()
            .map_err(|e| format!("git not found: {e}"))?;

        if !commit_out.status.success() {
            return Err(String::from_utf8_lossy(&commit_out.stderr).trim().to_string());
        }
    }

    Ok(())
}

pub fn create_worktree(repo_cwd: &Path, branch: &str) -> Result<CreatedWorktree, String> {
    validate_branch_name(branch)?;
    let main_root = resolve_main_root(repo_cwd)?;
    let container = worktrees_dir_for(&main_root)
        .ok_or_else(|| "cannot derive a worktrees directory for this repo".to_string())?;
    let target = container.join(branch_slug(branch));
    if target.exists() {
        return Err(format!(
            "worktree directory already exists: {} — pick another branch name",
            target.display()
        ));
    }
    let root = main_root.to_str().ok_or("non-UTF-8 repo root")?;
    // `worktree add -b` checks out from HEAD; on an unborn HEAD (fresh
    // `git init`, zero commits) git fails with an opaque "invalid reference"
    // — pre-check so callers get an actionable message instead. The composer
    // also guards this, but MCP worktree.spawn reaches here directly.
    let head_ok = git_command()
        .args(["-C", root, "rev-parse", "--verify", "--quiet", "HEAD"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?
        .status
        .success();
    if !head_ok {
        return Err(
            "repository has no commits yet — make an initial commit before creating worktrees"
                .into(),
        );
    }
    let target_s = target.to_str().ok_or("non-UTF-8 target path")?.to_string();
    let out = git_command()
        .args(["-C", root, "worktree", "add", &target_s, "-b", branch])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(CreatedWorktree { path: target_s, branch: branch.to_string() })
}

pub fn remove_worktree(repo_cwd: &Path, worktree_path: &Path) -> Result<(), String> {
    let main_root = resolve_main_root(repo_cwd)?;
    if !is_inside_worktrees_dir(worktree_path, &main_root) {
        return Err("refusing: path is not a swarmterm-managed worktree".into());
    }
    if !get_changed_files(worktree_path)?.is_empty() {
        return Err(
            "refusing: worktree has uncommitted changes — commit or discard them first".into(),
        );
    }
    let root = main_root.to_str().ok_or("non-UTF-8 repo root")?;
    let target = worktree_path.to_str().ok_or("non-UTF-8 worktree path")?;
    let out = git_command()
        .args(["-C", root, "worktree", "remove", target])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        // Windows: open handles (a shell still cwd'd inside) block deletion.
        return Err(format!(
            "{err} (if files are locked, close the worktree's pane and retry)"
        ));
    }
    Ok(())
}

/// Count commits on `branch` not reachable from the main worktree's HEAD — the
/// real "unmerged work" signal. Measured against main's HEAD, NOT an upstream:
/// swarm branches created via `git worktree add -b` never have an upstream, so
/// `git status`'s ahead/behind is always null for them. `HEAD` here is resolved
/// in the main worktree (`resolve_main_root`), and branch refs are shared across
/// all worktrees of the repo, so `HEAD..<branch>` is well-defined.
pub fn branch_unmerged_count(repo_cwd: &Path, branch: &str) -> Result<u32, String> {
    let main_root = resolve_main_root(repo_cwd)?;
    let root = main_root.to_str().ok_or("non-UTF-8 repo root")?;
    let range = format!("HEAD..{branch}");
    let out = git_command()
        .args(["-C", root, "rev-list", "--count", &range])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<u32>()
        .map_err(|e| format!("could not parse rev-list count: {e}"))
}

/// UI-driven worktree removal: force-remove the directory and delete its branch.
/// Distinct from `remove_worktree` (the agent-facing MCP path, kept strict and
/// non-force): here the UI has already surfaced and gated any real unsaved work
/// in a confirmation dialog, and the app-written `.mcp.json` would otherwise
/// block a non-force remove. The `is_inside_worktrees_dir` guard — not the
/// dirty-check — is the real protection against nuking an arbitrary path.
///
/// The transient Windows lock (a pane's pty still cwd'd inside the worktree) is
/// handled by the CALLER retrying the IPC while the pane relocates home; a retry
/// loop here would block the command thread, so it is deliberately absent.
pub fn clear_worktree(repo_cwd: &Path, worktree_path: &Path, branch: &str) -> Result<(), String> {
    let main_root = resolve_main_root(repo_cwd)?;
    if !is_inside_worktrees_dir(worktree_path, &main_root) {
        return Err("refusing: path is not a swarmterm-managed worktree".into());
    }
    let root = main_root.to_str().ok_or("non-UTF-8 repo root")?;
    let target = worktree_path.to_str().ok_or("non-UTF-8 worktree path")?;

    let out = git_command()
        .args(["-C", root, "worktree", "remove", "--force", target])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        // Windows: an open handle (a shell still cwd'd inside) blocks deletion.
        return Err(format!(
            "{err} (if files are locked, close the worktree's pane and retry)"
        ));
    }

    // Delete the branch ref from the main repo. `-D` (force) because the UI has
    // already warned about unmerged commits; the branch is no longer checked out
    // anywhere now that its only worktree is gone.
    let out = git_command()
        .args(["-C", root, "branch", "-D", branch])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!("worktree removed, but branch delete failed: {err}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal real git repo for the worktree integration tests below (the rest
    /// of this module tests pure parsing functions, so no such helper existed
    /// yet). One commit so `create_worktree`'s HEAD-exists precheck passes.
    fn init_repo(path: &Path) {
        let p = path.to_str().unwrap();
        git_command().args(["-C", p, "init", "--quiet"]).output().unwrap();
        git_command()
            .args(["-C", p, "config", "user.email", "test@example.com"])
            .output()
            .unwrap();
        git_command()
            .args(["-C", p, "config", "user.name", "Test"])
            .output()
            .unwrap();
        std::fs::write(path.join("README.md"), "test").unwrap();
        git_command().args(["-C", p, "add", "."]).output().unwrap();
        git_command()
            .args(["-C", p, "commit", "--quiet", "-m", "init"])
            .output()
            .unwrap();
    }

    /// Run a git command inside `dir` for test setup (commits, adds, etc.) —
    /// mirrors how `init_repo` shells out, just parameterized on args/cwd.
    fn run_git(dir: &Path, args: &[&str]) {
        let status = git_command()
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed in {}", dir.display());
    }

    #[test]
    fn branch_unmerged_count_counts_commits_not_in_main() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        let created = create_worktree(&repo, "swarm/x").unwrap();
        let wt = std::path::PathBuf::from(&created.path);
        // Fresh worktree branch has no commits ahead of main.
        assert_eq!(branch_unmerged_count(&repo, "swarm/x").unwrap(), 0);
        // Commit inside the worktree → one unmerged commit.
        std::fs::write(wt.join("f.txt"), "hi").unwrap();
        run_git(&wt, &["add", "."]);
        run_git(&wt, &["commit", "-m", "work"]);
        assert_eq!(branch_unmerged_count(&repo, "swarm/x").unwrap(), 1);
    }

    #[test]
    fn clear_worktree_refuses_path_outside_worktrees_dir() {
        // A path that is not under <repo>.worktrees must be refused before any
        // git mutation — the guard is the real protection for the force remove.
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        let outside = tmp.path().join("not-a-worktree");
        std::fs::create_dir_all(&outside).unwrap();
        let err = clear_worktree(&repo, &outside, "swarm/x").unwrap_err();
        assert!(err.contains("not a swarmterm-managed worktree"), "got: {err}");
    }

    #[test]
    fn clear_worktree_removes_directory_and_branch() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        let created = create_worktree(&repo, "swarm/gone").unwrap();
        let wt = std::path::PathBuf::from(&created.path);
        assert!(wt.exists());

        clear_worktree(&repo, &wt, "swarm/gone").unwrap();

        assert!(!wt.exists(), "worktree directory should be gone");
        let branches = git_command()
            .args(["-C", repo.to_str().unwrap(), "branch", "--list", "swarm/gone"])
            .output()
            .unwrap();
        assert!(
            String::from_utf8_lossy(&branches.stdout).trim().is_empty(),
            "branch should be deleted"
        );
    }

    #[test]
    fn test_parse_worktree_list_two_entries() {
        let input = "\
worktree /home/user/project
HEAD abc1234567890abcdef
branch refs/heads/main

worktree /home/user/project-feat
HEAD def9876543210def01
branch refs/heads/feat/login

";
        let result = parse_worktree_list(input);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].branch, "main");
        assert!(result[0].is_main);
        assert_eq!(result[0].head, "abc1234");
        assert_eq!(result[1].branch, "feat/login");
        assert!(!result[1].is_main);
    }

    #[test]
    fn test_parse_worktree_list_detached() {
        let input = "\
worktree /home/user/project
HEAD abc1234567890abcdef
detached

";
        let result = parse_worktree_list(input);
        assert_eq!(result[0].branch, "(detached)");
    }

    #[test]
    fn test_parse_worktree_list_empty() {
        assert_eq!(parse_worktree_list("").len(), 0);
    }

    #[test]
    fn test_parse_changed_files_merges_counts() {
        let status = " M src/auth.ts\nA  src/hooks/useAuth.ts\n?? .env.local\n";
        let numstat = "4\t1\tsrc/auth.ts\n18\t0\tsrc/hooks/useAuth.ts\n";
        let result = parse_changed_files(status, numstat);
        assert_eq!(result.len(), 3);

        let auth = result.iter().find(|f| f.path == "src/auth.ts").unwrap();
        assert_eq!(auth.status, "M");
        assert_eq!(auth.added, 4);
        assert_eq!(auth.removed, 1);

        let hook = result.iter().find(|f| f.path == "src/hooks/useAuth.ts").unwrap();
        assert_eq!(hook.status, "A");
        assert_eq!(hook.added, 18);

        let env = result.iter().find(|f| f.path == ".env.local").unwrap();
        assert_eq!(env.status, "?");
        assert_eq!(env.added, 0);
    }

    #[test]
    fn test_parse_changed_files_empty() {
        assert_eq!(parse_changed_files("", "").len(), 0);
    }

    #[test]
    fn test_parse_commit_info_with_upstream() {
        let input = "\
# branch.oid abc1234567890abcdef
# branch.head feat/login
# branch.upstream origin/feat/login
# branch.ab +2 -0
";
        let result = parse_commit_info(input);
        assert_eq!(result.head_sha, "abc1234");
        assert_eq!(result.branch, "feat/login");
        assert_eq!(result.ahead, Some(2));
        assert_eq!(result.behind, Some(0));
    }

    #[test]
    fn test_parse_commit_info_no_upstream() {
        let input = "\
# branch.oid abc1234567890abcdef
# branch.head main
";
        let result = parse_commit_info(input);
        assert_eq!(result.ahead, None);
        assert_eq!(result.behind, None);
    }

    #[test]
    fn test_parse_changed_files_renamed() {
        // git status --porcelain=v1 emits renames as "R  new-path\told-path"
        let status = "R  src/new-name.ts\tsrc/old-name.ts\n";
        // numstat lists only the new path for renames (splitn(3) gives parts[2] = "src/new-name.ts")
        let numstat = "2\t1\tsrc/new-name.ts\n";
        let result = parse_changed_files(status, numstat);
        assert_eq!(result.len(), 1);
        // Only the new (destination) path should be stored
        assert_eq!(result[0].path, "src/new-name.ts");
        assert_eq!(result[0].status, "R");
        // Line counts should be associated with the new path
        assert_eq!(result[0].added, 2);
        assert_eq!(result[0].removed, 1);
    }

    #[test]
    fn test_should_ignore_repo_root_equals_home() {
        let home = Path::new("/home/user");
        assert!(should_ignore_repo_root(Path::new("/home/user"), home));
    }

    #[test]
    fn test_should_ignore_repo_root_ancestor_of_home() {
        let home = Path::new("/home/user");
        assert!(should_ignore_repo_root(Path::new("/home"), home));
        assert!(should_ignore_repo_root(Path::new("/"), home));
    }

    #[test]
    fn test_should_ignore_repo_root_below_home_kept() {
        let home = Path::new("/home/user");
        assert!(!should_ignore_repo_root(Path::new("/home/user/projects/app"), home));
    }

    #[test]
    fn test_should_ignore_repo_root_sibling_kept() {
        let home = Path::new("/home/user");
        assert!(!should_ignore_repo_root(Path::new("/srv/repo"), home));
    }

    #[test]
    fn validate_branch_accepts_typical_names() {
        assert!(validate_branch_name("feat/login").is_ok());
        assert!(validate_branch_name("fix-bug-42").is_ok());
        assert!(validate_branch_name("refactor/auth_v2.1").is_ok());
    }

    #[test]
    fn validate_branch_rejects_bad_names() {
        assert!(validate_branch_name("").is_err());
        assert!(validate_branch_name("feat/../escape").is_err());
        assert!(validate_branch_name("/leading").is_err());
        assert!(validate_branch_name("trailing/").is_err());
        assert!(validate_branch_name("-leading-dash").is_err());
        assert!(validate_branch_name("has space").is_err());
        assert!(validate_branch_name("semi;colon").is_err());
        assert!(validate_branch_name("double//slash").is_err());
        assert!(validate_branch_name("ends.lock").is_err());
        assert!(validate_branch_name(&"x".repeat(101)).is_err());
    }

    #[test]
    fn branch_slug_flattens_slashes_and_caps_length() {
        assert_eq!(branch_slug("feat/login"), "feat-login");
        assert_eq!(branch_slug("a/b/c"), "a-b-c");
        assert_eq!(branch_slug(&"y".repeat(80)).len(), 48);
    }

    #[test]
    fn worktrees_dir_is_sibling_of_main_root() {
        let dir = worktrees_dir_for(Path::new("/dev/myapp")).unwrap();
        assert_eq!(dir, Path::new("/dev/myapp.worktrees"));
    }

    #[test]
    fn inside_worktrees_dir_guards() {
        let main = Path::new("/dev/myapp");
        assert!(is_inside_worktrees_dir(Path::new("/dev/myapp.worktrees/feat-login"), main));
        // The container itself, the main worktree, and arbitrary dirs are refused.
        assert!(!is_inside_worktrees_dir(Path::new("/dev/myapp.worktrees"), main));
        assert!(!is_inside_worktrees_dir(Path::new("/dev/myapp"), main));
        assert!(!is_inside_worktrees_dir(Path::new("/dev/other"), main));
        // Lexical `..`/`.` tricks must not defeat the guard.
        assert!(!is_inside_worktrees_dir(
            Path::new("/dev/myapp.worktrees/../../etc/passwd"),
            main
        ));
        assert!(!is_inside_worktrees_dir(
            Path::new("/dev/myapp.worktrees/./feat-login/.."),
            main
        ));
    }

    /// The real home dir. On this codebase's dev machines `home` is itself a
    /// git repo and the OS temp dir lives under it, so tempdirs are discovered
    /// as "inside home's repo" — passing the true home lets the home-repo guard
    /// fire deterministically. On a machine where temp is outside any repo,
    /// `--show-toplevel` simply fails and the guard is moot; either way the
    /// fresh-init path is taken.
    fn test_home() -> PathBuf {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/nonexistent-home"))
    }

    #[test]
    fn ensure_repo_with_commit_initializes_nonexistent_repo() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("new-project");
        std::fs::create_dir(&path).unwrap();

        let result = ensure_repo_with_commit(&path, &test_home());

        assert!(result.is_ok(), "should succeed: {result:?}");
        // Verify .gitkeep exists
        assert!(path.join(".gitkeep").exists(), ".gitkeep should be created");
        // Verify it's a git repo
        let log_out = git_command()
            .args([
                "-C",
                path.to_str().unwrap(),
                "log",
                "--oneline",
            ])
            .output()
            .unwrap();
        let log = String::from_utf8_lossy(&log_out.stdout);
        assert!(
            log.contains("Initial commit"),
            "repo should have initial commit: {log}"
        );
    }

    #[test]
    fn ensure_repo_with_commit_skips_existing_repo_with_commits() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("existing-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo); // Uses existing test helper

        let result = ensure_repo_with_commit(&repo, &test_home());

        assert!(result.is_ok(), "should succeed: {result:?}");
        // Verify .gitkeep was NOT created (it would only be created if unborn)
        assert!(
            !repo.join(".gitkeep").exists(),
            ".gitkeep should not be created for existing repo with commits"
        );
        // Verify it still has exactly 1 commit (the init one, not a new one)
        let log_out = git_command()
            .args(["-C", repo.to_str().unwrap(), "rev-list", "--count", "HEAD"])
            .output()
            .unwrap();
        let count = String::from_utf8_lossy(&log_out.stdout).trim().parse::<u32>();
        assert_eq!(count, Ok(1), "should still have only 1 commit");
    }

    #[test]
    fn ensure_repo_with_commit_commits_unborn_repo() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("unborn-repo");
        std::fs::create_dir_all(&repo).unwrap();

        // Initialize a bare repo (unborn HEAD)
        let p = repo.to_str().unwrap();
        git_command()
            .args(["-C", p, "init", "--quiet"])
            .output()
            .unwrap();
        git_command()
            .args(["-C", p, "config", "user.email", "test@example.com"])
            .output()
            .unwrap();
        git_command()
            .args(["-C", p, "config", "user.name", "Test"])
            .output()
            .unwrap();

        let result = ensure_repo_with_commit(&repo, &test_home());

        assert!(result.is_ok(), "should succeed: {result:?}");
        // Verify .gitkeep was created
        assert!(repo.join(".gitkeep").exists(), ".gitkeep should be created");
        // Verify HEAD is now valid
        let head_ok = git_command()
            .args(["-C", p, "rev-parse", "--verify", "--quiet", "HEAD"])
            .output()
            .unwrap()
            .status
            .success();
        assert!(head_ok, "HEAD should be valid after ensure_repo_with_commit");
    }

    #[test]
    fn ensure_repo_with_commit_fails_on_permission_error() {
        // Try a non-existent deeply nested path
        let bad_path = std::path::Path::new("/nonexistent/does/not/exist/repo");

        let result = ensure_repo_with_commit(bad_path, &test_home());

        // Should fail with an error
        assert!(result.is_err(), "should fail on invalid path: {result:?}");
    }

    #[test]
    fn ensure_repo_with_commit_inits_fresh_repo_inside_parent_repo() {
        // A folder that merely sits INSIDE an unrelated parent repo (the
        // home-dir-is-a-repo case) must get its OWN fresh repo, not attach to
        // the parent — otherwise create_worktree would provision worktrees of
        // the whole parent. `parent` doubles as `home` so the guard treats it
        // as the ignorable root regardless of where the real temp dir lives.
        let tmp = tempfile::tempdir().unwrap();
        let parent = tmp.path().join("parent-repo");
        std::fs::create_dir_all(&parent).unwrap();
        init_repo(&parent); // parent is a git repo with a commit
        let child = parent.join("child-project");
        std::fs::create_dir_all(&child).unwrap();

        ensure_repo_with_commit(&child, &parent).unwrap();

        // child got its OWN repo + initial commit, not parent's.
        assert!(
            child.join(".gitkeep").exists(),
            "child should have its own .gitkeep"
        );
        let toplevel = git_command()
            .args(["-C", child.to_str().unwrap(), "rev-parse", "--show-toplevel"])
            .output()
            .unwrap();
        let root = String::from_utf8_lossy(&toplevel.stdout);
        assert!(
            root.trim().ends_with("child-project"),
            "child should be its own repo root, got: {root}"
        );
    }
}
