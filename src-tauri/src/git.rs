// src-tauri/src/git.rs
use serde::Serialize;
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
    let out = Command::new("git")
        .args(["-C", cwd.to_str().unwrap_or("."), "worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(parse_worktree_list(&String::from_utf8_lossy(&out.stdout)))
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
}
