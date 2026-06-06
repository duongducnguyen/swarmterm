// src-tauri/src/deeplink.rs

use tauri::{AppHandle, Emitter, Manager};
use crate::pty::AppState;
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
    Some(AuthCallback { code })
}

/// A validated request to open a web preview for a terminal session.
#[derive(Debug, PartialEq)]
pub struct PreviewOpen {
    pub terminal_id: String,
    pub url: String,
}

/// Why a deep link was rejected (logged, never shown to the user).
#[derive(Debug, PartialEq)]
pub enum Reject {
    NotPreview,
    MissingField,
    UnknownSession,
    BadUrl,
}

/// Parse and validate a `swarmterm://preview?session=&url=` deep link.
/// `session_is_live` reports whether a session id maps to a currently-running
/// terminal — the session UUID is the unguessable secret, so a live session is
/// sufficient authorisation. The url must be http/https.
pub fn parse_preview(
    uri: &str,
    session_is_live: impl Fn(&str) -> bool,
) -> Result<PreviewOpen, Reject> {
    let parsed = url::Url::parse(uri).map_err(|_| Reject::NotPreview)?;
    if parsed.scheme() != "swarmterm" || parsed.host_str() != Some("preview") {
        return Err(Reject::NotPreview);
    }
    let mut session = None;
    let mut target = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "session" => session = Some(v.into_owned()),
            "url" => target = Some(v.into_owned()),
            _ => {}
        }
    }
    let session = session.ok_or(Reject::MissingField)?;
    let target = target.ok_or(Reject::MissingField)?;

    if !session_is_live(&session) {
        return Err(Reject::UnknownSession);
    }

    let scheme_ok = url::Url::parse(&target)
        .map(|u| matches!(u.scheme(), "http" | "https"))
        .unwrap_or(false);
    if !scheme_ok {
        return Err(Reject::BadUrl);
    }

    Ok(PreviewOpen { terminal_id: session, url: target })
}

/// Payload emitted to the renderer when a valid preview link arrives.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOpenEvent {
    pub terminal_id: String,
    pub url: String,
}

/// Payload emitted to the renderer when a valid OAuth callback arrives.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCallbackEvent {
    pub code: String,
}

/// Validate every URL in `uris` and emit `preview:open` for the good ones.
pub fn handle_uris(app: &AppHandle, uris: &[String]) {
    let state = app.state::<AppState>();
    for uri in uris {
        match parse_preview(uri, |id| state.terminals.lock().unwrap().contains_key(id)) {
            Ok(open) => {
                let _ = app.emit(
                    "preview:open",
                    PreviewOpenEvent { terminal_id: open.terminal_id, url: open.url },
                );
            }
            Err(reason) => {
                eprintln!("ignored deep link {uri}: {reason:?}");
            }
        }
        // Also check for OAuth auth callback.
        if let Some(auth) = parse_auth_callback(uri) {
            let _ = app.emit("auth:callback", AuthCallbackEvent { code: auth.code });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_live(id: &str) -> bool {
        id == "t1"
    }

    #[test]
    fn accepts_valid_link() {
        let uri = "swarmterm://preview?session=t1&url=http%3A%2F%2Flocalhost%3A3000";
        assert_eq!(
            parse_preview(uri, is_live),
            Ok(PreviewOpen { terminal_id: "t1".into(), url: "http://localhost:3000".into() })
        );
    }

    #[test]
    fn rejects_wrong_host() {
        let uri = "swarmterm://other?session=t1&url=http%3A%2F%2Fa";
        assert_eq!(parse_preview(uri, is_live), Err(Reject::NotPreview));
    }

    #[test]
    fn rejects_unknown_session() {
        let uri = "swarmterm://preview?session=ghost&url=http%3A%2F%2Fa";
        assert_eq!(parse_preview(uri, is_live), Err(Reject::UnknownSession));
    }

    #[test]
    fn rejects_non_http_url() {
        let uri = "swarmterm://preview?session=t1&url=file%3A%2F%2F%2Fetc";
        assert_eq!(parse_preview(uri, is_live), Err(Reject::BadUrl));
    }

    #[test]
    fn rejects_missing_session() {
        let uri = "swarmterm://preview?url=http%3A%2F%2Fa";
        assert_eq!(parse_preview(uri, is_live), Err(Reject::MissingField));
    }

    #[test]
    fn rejects_missing_url() {
        let uri = "swarmterm://preview?session=t1";
        assert_eq!(parse_preview(uri, is_live), Err(Reject::MissingField));
    }

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
}
