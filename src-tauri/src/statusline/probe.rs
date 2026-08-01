//! One 300 ms loopback `GET /status`, hand-rolled over `std::net::TcpStream`.
//!
//! No reqwest, no tokio: this runs in the `--statusline` CLI path, which Claude
//! Code re-executes on every render. Spinning up an async runtime to make one
//! request to 127.0.0.1 would cost more than the request. The framing is
//! deliberately minimal — the server answers `Connection: close` with a
//! `Content-Length`, so there is no chunked or keep-alive case to handle.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// Split a raw response into `(status_code, body)`, or `None` if more bytes are
/// still needed. Returning `None` for "incomplete" is what lets the read loop
/// below stop exactly when it has enough, without relying on the peer closing.
pub fn parse_http_response(buf: &[u8]) -> Option<(u16, &[u8])> {
    let head_end = buf.windows(4).position(|w| w == b"\r\n\r\n")? + 4;
    let head = std::str::from_utf8(&buf[..head_end]).ok()?;
    let mut lines = head.split("\r\n");

    let status_line = lines.next()?;
    let mut status_parts = status_line.split(' ');
    if !status_parts.next()?.starts_with("HTTP/") {
        return None;
    }
    let code: u16 = status_parts.next()?.parse().ok()?;

    let len: usize = lines
        .find_map(|l| {
            let (name, value) = l.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())?
        })
        .unwrap_or(0);

    let body = buf.get(head_end..)?;
    if body.len() < len {
        return None;
    }
    Some((code, body))
}

/// Read `mcp.connected` out of a `/status` body. Anything else — a different
/// shape, invalid JSON — is `None`, which the caller renders as `mcp ✗`.
pub fn parse_connected(body: &[u8]) -> Option<bool> {
    let v: serde_json::Value = serde_json::from_slice(body).ok()?;
    v.get("mcp")?.get("connected")?.as_bool()
}

/// `http://127.0.0.1:52431/mcp` → `("127.0.0.1", "127.0.0.1:52431")`.
pub fn status_addr(mcp_url: &str) -> Option<(String, String)> {
    let u = url::Url::parse(mcp_url).ok()?;
    let host = u.host_str()?.to_owned();
    let port = u.port()?;
    Some((host.clone(), format!("{host}:{port}")))
}

/// `Some(connected)` when Swarmterm answered `200` with a well-formed body;
/// `None` for every failure — refused, timed out, 401 from a dead pane,
/// malformed reply. The caller collapses `None` to `mcp ✗`, because from the
/// status line's point of view those are the same fact: we cannot vouch for
/// this pane's MCP link.
pub fn probe(mcp_url: &str, token: &str, timeout: Duration) -> Option<bool> {
    let (_host, authority) = status_addr(mcp_url)?;
    let addr = authority.to_socket_addrs().ok()?.next()?;
    let mut stream = TcpStream::connect_timeout(&addr, timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;

    // Host carries the port: the server is on an ephemeral one, and a bare host
    // is a malformed Host header for anything but :80.
    let req = format!(
        "GET /status HTTP/1.1\r\nHost: {authority}\r\nAuthorization: Bearer {token}\r\n\
         Connection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).ok()?;
    stream.flush().ok()?;

    // Accumulate until `parse_http_response` says it has a whole message, or
    // the peer closes, or a read times out. Capped so a wedged peer can't grow
    // this unbounded — the real body is ~30 bytes.
    let mut buf = Vec::with_capacity(256);
    let mut chunk = [0u8; 512];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if parse_http_response(&buf).is_some() || buf.len() > 8192 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let (code, body) = parse_http_response(&buf)?;
    if code != 200 {
        return None;
    }
    parse_connected(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_complete_200() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 26\r\n\r\n{\"mcp\":{\"connected\":true}}";
        let (code, body) = parse_http_response(raw).unwrap();
        assert_eq!(code, 200);
        assert_eq!(body, b"{\"mcp\":{\"connected\":true}}");
    }

    #[test]
    fn parses_a_401_with_an_empty_body() {
        let raw = b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
        let (code, body) = parse_http_response(raw).unwrap();
        assert_eq!(code, 401);
        assert!(body.is_empty());
    }

    #[test]
    fn returns_none_while_headers_are_incomplete() {
        assert!(parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Len").is_none());
    }

    #[test]
    fn returns_none_while_the_body_is_short() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 26\r\n\r\n{\"mcp\":";
        assert!(parse_http_response(raw).is_none());
    }

    #[test]
    fn reads_content_length_case_insensitively() {
        let raw = b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}";
        let (code, body) = parse_http_response(raw).unwrap();
        assert_eq!(code, 200);
        assert_eq!(body, b"{}");
    }

    #[test]
    fn returns_none_on_a_garbage_status_line() {
        assert!(parse_http_response(b"NOT HTTP AT ALL\r\n\r\n").is_none());
    }

    #[test]
    fn extracts_the_connected_flag() {
        assert_eq!(parse_connected(br#"{"mcp":{"connected":true}}"#), Some(true));
        assert_eq!(
            parse_connected(br#"{"mcp":{"connected":false}}"#),
            Some(false)
        );
    }

    #[test]
    fn rejects_a_body_that_is_not_the_status_shape() {
        assert_eq!(parse_connected(b"{}"), None);
        assert_eq!(parse_connected(b"not json"), None);
        assert_eq!(parse_connected(br#"{"mcp":{}}"#), None);
    }

    #[test]
    fn derives_the_authority_from_the_mcp_url() {
        let (host, authority) = status_addr("http://127.0.0.1:52431/mcp").unwrap();
        assert_eq!(host, "127.0.0.1");
        assert_eq!(authority, "127.0.0.1:52431");
    }

    #[test]
    fn rejects_a_url_without_a_port() {
        // The MCP server always binds an explicit ephemeral port; anything else
        // is a malformed env var, not a default-port case worth guessing at.
        assert!(status_addr("http://127.0.0.1/mcp").is_none());
        assert!(status_addr("not a url").is_none());
        assert!(status_addr("").is_none());
    }

    #[test]
    fn probe_reports_unreachable_when_nothing_is_listening() {
        // Port 1 on loopback is reserved and never bound by us; the connect is
        // refused immediately rather than waiting out the timeout.
        assert_eq!(
            probe("http://127.0.0.1:1/mcp", "tok", Duration::from_millis(300)),
            None
        );
    }
}
