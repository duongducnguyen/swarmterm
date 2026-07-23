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
}
