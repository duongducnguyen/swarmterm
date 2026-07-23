//! Resolving a terminal path candidate to a real file.
//!
//! The renderer detects path-shaped TEXT (see `src/lib/path-link-parse.ts`) but
//! cannot check whether it exists — a webview has no filesystem. So every
//! candidate comes here before it is allowed to become a clickable link. A
//! candidate that does not canonicalize to an existing regular file returns
//! `None` and is silently dropped, which is what keeps ordinary prose that
//! happens to look path-shaped from underlining itself all over the screen.

use std::path::{Path, PathBuf};

/// Mirrors MAX_CANDIDATE_LENGTH in path-link-parse.ts. Re-checked here because
/// the renderer is not a trust boundary we want to rely on for FS work.
const MAX_CANDIDATE_LEN: usize = 1024;

pub fn resolve_candidate(cwd: &Path, candidate: &str) -> Option<PathBuf> {
    if candidate.is_empty() || candidate.len() > MAX_CANDIDATE_LEN {
        return None;
    }

    let raw = Path::new(candidate);
    let joined = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        cwd.join(raw)
    };

    // canonicalize() both resolves `..`/symlinks and fails on a missing path, so
    // it is the existence check and the normalisation in one call.
    let canonical = std::fs::canonicalize(joined).ok()?;
    if canonical.is_file() {
        Some(canonical)
    } else {
        None
    }
}

/// Mirrors EditorId in `src/lib/editor-command.ts`. Duplicated rather than
/// shared because this copy is the one that matters: the renderer builds the
/// argv, but the renderer is not the security boundary. A misclick must never be
/// able to launch an arbitrary program, so the launcher re-checks the name here.
const ALLOWED_EDITORS: &[&str] = &["code", "cursor", "zed", "subl", "idea"];

pub fn is_allowed_editor(bin: &str) -> bool {
    ALLOWED_EDITORS.contains(&bin)
}

/// First entry of `preferred` that exists on `path_var`. Reuses the same PATH
/// scan the shell catalog uses, so platform quirks (Windows extensions) stay in
/// one place.
pub fn find_editor(path_var: &str, preferred: &[String]) -> Option<String> {
    preferred
        .iter()
        .find(|name| crate::shell::find_in_path(path_var, name).is_some())
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// The crate root — a real directory with known contents, so these tests need
    /// no temp-dir dependency.
    fn manifest_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    #[test]
    fn resolves_a_relative_file_against_cwd() {
        let got = resolve_candidate(&manifest_dir(), "Cargo.toml");
        assert_eq!(
            got,
            Some(manifest_dir().join("Cargo.toml").canonicalize().unwrap())
        );
    }

    #[test]
    fn resolves_a_nested_relative_file() {
        assert!(resolve_candidate(&manifest_dir(), "src/lib.rs").is_some());
    }

    #[test]
    fn resolves_an_absolute_file() {
        let abs = manifest_dir().join("Cargo.toml");
        assert!(resolve_candidate(&manifest_dir(), &abs.to_string_lossy()).is_some());
    }

    #[test]
    fn rejects_a_missing_file() {
        assert_eq!(
            resolve_candidate(&manifest_dir(), "definitely-not-here.toml"),
            None
        );
    }

    #[test]
    fn rejects_a_directory() {
        // A directory is not something the editor should be sent to, and letting
        // it through would make every path prefix in a line look clickable.
        assert_eq!(resolve_candidate(&manifest_dir(), "src"), None);
    }

    #[test]
    fn rejects_an_overlong_candidate() {
        let long = "a/".repeat(700);
        assert_eq!(resolve_candidate(&manifest_dir(), &long), None);
    }

    #[test]
    fn rejects_an_empty_candidate() {
        assert_eq!(resolve_candidate(&manifest_dir(), ""), None);
    }

    #[test]
    fn find_editor_prefers_the_first_candidate_present_on_path() {
        let dir = manifest_dir();
        let path_var = dir.to_string_lossy().into_owned();
        // find_in_path matches the name verbatim and only checks existence, so
        // any real file in the directory stands in for an editor binary here —
        // what's under test is the ordering, not executability.
        let got = find_editor(&path_var, &["nope-editor".into(), "Cargo.toml".into()]);
        assert_eq!(got.as_deref(), Some("Cargo.toml"));
    }

    #[test]
    fn find_editor_returns_none_when_nothing_is_present() {
        let path_var = manifest_dir().to_string_lossy().into_owned();
        assert_eq!(find_editor(&path_var, &["nope-editor".into()]), None);
    }

    #[test]
    fn allowlist_accepts_known_editors_only() {
        assert!(is_allowed_editor("code"));
        assert!(is_allowed_editor("cursor"));
        assert!(is_allowed_editor("idea"));
        assert!(!is_allowed_editor("bash"));
        assert!(!is_allowed_editor("code; rm -rf /"));
        assert!(!is_allowed_editor("/usr/bin/code"));
    }
}
