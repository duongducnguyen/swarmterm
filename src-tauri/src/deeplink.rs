// src-tauri/src/deeplink.rs

use tauri::{AppHandle, Emitter};
use serde::Serialize;

/// A validated OAuth callback with the PKCE exchange code.
#[derive(Debug, PartialEq)]
pub struct AuthCallback {
    pub code: String,
}

/// Parse `swarmterm://auth/callback?code=<pkce_code>`.
/// Returns None for any other URI or if the `code` query param is missing.
pub fn parse_auth_callback(uri: &str) -> Option<AuthCallback> {
    let parsed = url::Url::parse(uri).ok()?;
    if parsed.scheme() != "swarmterm" || parsed.host_str() != Some("auth") {
        return None;
    }
    if parsed.path() != "/callback" {
        return None;
    }
    let code = parsed
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.into_owned())?;
    if code.is_empty() {
        return None;
    }
    Some(AuthCallback { code })
}

/// Payload emitted to the renderer when a valid OAuth callback arrives.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCallbackEvent {
    pub code: String,
}

/// Validate every URL in `uris` and emit the appropriate event. Only OAuth
/// auth callbacks are handled here now — browser preview moved to the MCP
/// server (see mcp::tools::browser).
pub fn handle_uris(app: &AppHandle, uris: &[String]) {
    for uri in uris {
        if let Some(auth) = parse_auth_callback(uri) {
            let _ = app.emit("auth:callback", AuthCallbackEvent { code: auth.code });
        } else {
            eprintln!("ignored deep link {uri}: not an auth callback");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_auth_callback() {
        let uri = "swarmterm://auth/callback?code=pkce_code_abc123";
        assert_eq!(
            parse_auth_callback(uri),
            Some(AuthCallback { code: "pkce_code_abc123".into() })
        );
    }

    #[test]
    fn auth_callback_rejects_wrong_host() {
        let uri = "swarmterm://preview/callback?code=abc";
        assert_eq!(parse_auth_callback(uri), None);
    }

    #[test]
    fn auth_callback_rejects_wrong_path() {
        let uri = "swarmterm://auth/other?code=abc";
        assert_eq!(parse_auth_callback(uri), None);
    }

    #[test]
    fn auth_callback_rejects_missing_code() {
        let uri = "swarmterm://auth/callback?state=xyz";
        assert_eq!(parse_auth_callback(uri), None);
    }

    #[test]
    fn auth_callback_rejects_non_swarmterm_scheme() {
        let uri = "https://auth/callback?code=abc";
        assert_eq!(parse_auth_callback(uri), None);
    }

    #[test]
    fn auth_callback_rejects_empty_code() {
        let uri = "swarmterm://auth/callback?code=";
        assert_eq!(parse_auth_callback(uri), None);
    }
}
