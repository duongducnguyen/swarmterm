//! Shell catalog + per-platform probing. Probes once per app start; later calls
//! return the cached vector. App restart re-probes.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;

/// One entry in the shell catalog. `available == true` means the renderer can
/// offer this shell as a selectable option. `id` matches the frontend ShellId
/// string union.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEntry {
    pub id: String,
    pub available: bool,
    pub detected_path: Option<String>,
    pub args: Vec<String>,
}

/// Cached probe result. Lazily populated on first call to `list_shells()`.
static CACHE: OnceLock<Vec<ShellEntry>> = OnceLock::new();

/// Walk `$PATH` (split on the platform separator) looking for `exe_name`.
/// Returns the first match, or `None`.
pub fn find_in_path(path_var: &str, exe_name: &str) -> Option<PathBuf> {
    for segment in std::env::split_paths(path_var) {
        let candidate = segment.join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Given the path to `git.exe`, derive the sibling `bin\bash.exe` (used by the
/// "Git Bash" detection fallback when the GitForWindows registry key is absent).
/// Returns `None` if `git_exe` has no parent directory.
pub fn git_bash_from_git_exe(git_exe: &std::path::Path) -> Option<PathBuf> {
    // git.exe usually lives at <install>\cmd\git.exe, so the bash is two levels
    // up + \bin\bash.exe. We resolve relative to <install>.
    let cmd_dir = git_exe.parent()?;
    let install_dir = cmd_dir.parent()?;
    Some(install_dir.join("bin").join("bash.exe"))
}

/// Parse the output of `wsl.exe -l -q`. The command emits UTF-16 LE with a BOM
/// and CR-LF line endings; the caller is expected to decode to a Rust `String`
/// first. Returns the list of distro names (non-empty, BOM-stripped).
pub fn parse_wsl_distros(decoded: &str) -> Vec<String> {
    decoded
        .lines()
        .map(|line| line.trim().trim_start_matches('\u{FEFF}').trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn tempdir() -> tempfile::TempDir {
        tempfile::tempdir().expect("create tempdir")
    }

    #[test]
    fn find_in_path_returns_first_match() {
        let dir = tempdir();
        let exe = if cfg!(windows) { "tool.exe" } else { "tool" };
        let target = dir.path().join(exe);
        fs::write(&target, b"").unwrap();
        let path_var = format!(
            "{}{}{}",
            dir.path().display(),
            if cfg!(windows) { ";" } else { ":" },
            "/nonexistent"
        );
        assert_eq!(find_in_path(&path_var, exe), Some(target));
    }

    #[test]
    fn find_in_path_returns_none_when_missing() {
        let dir = tempdir();
        let path_var = dir.path().display().to_string();
        assert_eq!(find_in_path(&path_var, "absent.exe"), None);
    }

    #[test]
    fn git_bash_from_git_exe_uses_install_root() {
        let git_exe = Path::new("C:/Program Files/Git/cmd/git.exe");
        assert_eq!(
            git_bash_from_git_exe(git_exe),
            Some(PathBuf::from("C:/Program Files/Git/bin/bash.exe"))
        );
    }

    #[test]
    fn git_bash_from_git_exe_returns_none_for_root() {
        assert_eq!(git_bash_from_git_exe(Path::new("/")), None);
    }

    #[test]
    fn parse_wsl_distros_strips_bom_and_blanks() {
        let raw = "\u{FEFF}Ubuntu\r\nDebian\r\n\r\n";
        assert_eq!(parse_wsl_distros(raw), vec!["Ubuntu", "Debian"]);
    }

    #[test]
    fn parse_wsl_distros_empty_returns_empty() {
        assert!(parse_wsl_distros("").is_empty());
        assert!(parse_wsl_distros("\u{FEFF}\r\n").is_empty());
    }

    #[test]
    fn parse_wsl_distros_handles_lf_only() {
        assert_eq!(parse_wsl_distros("Alpine\nKali\n"), vec!["Alpine", "Kali"]);
    }
}
