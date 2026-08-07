#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalId(pub String);

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    /// Header absent, empty, or whitespace.
    Missing,
    /// Token doesn't map to a currently-live terminal (killed, or never existed).
    Unknown,
}

/// Resolve a bearer token to a live TerminalId, or explain why not.
/// `is_live(id)` reports whether the token identifies a currently-running PTY.
pub fn resolve(token: &str, is_live: impl Fn(&str) -> bool) -> Result<TerminalId, AuthError> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err(AuthError::Missing);
    }
    if !is_live(trimmed) {
        return Err(AuthError::Unknown);
    }
    Ok(TerminalId(trimmed.to_owned()))
}

/// Pull the token out of an `Authorization` header value. Tolerates a bare
/// token (no `Bearer ` prefix) because both the MCP client and our own status
/// probe are first-party, and a missing scheme is not worth a 401 of its own —
/// `resolve` still rejects anything that is not a live terminal id.
pub fn bearer(header: &str) -> &str {
    header.strip_prefix("Bearer ").unwrap_or(header)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_live(id: &str) -> bool {
        id == "abc-123"
    }

    #[test]
    fn resolves_live_token() {
        assert_eq!(
            resolve("abc-123", is_live),
            Ok(TerminalId("abc-123".into()))
        );
    }

    #[test]
    fn rejects_empty_token() {
        assert_eq!(resolve("", is_live), Err(AuthError::Missing));
        assert_eq!(resolve("   ", is_live), Err(AuthError::Missing));
    }

    #[test]
    fn rejects_unknown_token() {
        assert_eq!(resolve("ghost", is_live), Err(AuthError::Unknown));
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(
            resolve("  abc-123  ", is_live),
            Ok(TerminalId("abc-123".into()))
        );
    }

    #[test]
    fn bearer_strips_the_scheme_prefix() {
        assert_eq!(bearer("Bearer abc-123"), "abc-123");
    }

    #[test]
    fn bearer_passes_through_a_bare_token() {
        assert_eq!(bearer("abc-123"), "abc-123");
    }

    #[test]
    fn bearer_handles_an_empty_header() {
        assert_eq!(bearer(""), "");
    }
}
