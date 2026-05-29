// src-tauri/src/deeplink.rs

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
}
