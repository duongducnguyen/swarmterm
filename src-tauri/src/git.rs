// src-tauri/src/git.rs
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
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

pub fn list_worktrees(cwd: &Path) -> Result<Vec<WorktreeInfo>, String> {
    let p = cwd.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", cwd.display()))?;
    let out = Command::new("git")
        .args(["-C", p, "worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(parse_worktree_list(&String::from_utf8_lossy(&out.stdout)))
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

        let (added, removed) = counts.get(&path).copied().unwrap_or((0, 0));
        files.push(ChangedFile { path, status, added, removed });
    }
    files
}

pub fn get_changed_files(worktree_path: &Path) -> Result<Vec<ChangedFile>, String> {
    let p = worktree_path.to_str().ok_or_else(|| format!("non-UTF-8 path: {}", worktree_path.display()))?;

    let status_out = Command::new("git")
        .args(["-C", p, "status", "--porcelain=v1"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !status_out.status.success() {
        return Err(String::from_utf8_lossy(&status_out.stderr).trim().to_string());
    }

    // numstat may fail on a fresh repo with no commits — treat as empty
    let numstat_out = Command::new("git")
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
