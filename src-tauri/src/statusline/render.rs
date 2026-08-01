//! Pure formatting for the status line. No I/O — everything the line shows is
//! passed in, so every state is a table-driven unit test.

use serde::Deserialize;

/// What we can say about this pane's MCP link.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpState {
    /// Swarmterm answered and a client has called in with this pane's token.
    Connected,
    /// Swarmterm answered, the token is live, but no client ever called in —
    /// Claude did not load our config. The state this feature exists to expose.
    NoClient,
    /// `SWARMTERM_*` env is present but the probe failed.
    Unreachable,
    /// No `SWARMTERM_*` env — this Claude session was not spawned by Swarmterm.
    Absent,
}

/// Context-window numbers, already reduced to what the line shows.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CtxInfo {
    pub used: u64,
    pub size: u64,
    pub pct: f64,
}

/// The subset of Claude Code's status-line stdin JSON that we read. Every field
/// is optional and unknown fields are ignored, so a Claude Code upgrade that
/// adds or reorders keys degrades to a shorter line instead of an error. The
/// full payload is much larger (model, workspace, rate limits, vim mode, …);
/// deliberately none of it is rendered.
#[derive(Debug, Default, Deserialize)]
pub struct StatusInput {
    pub context_window: Option<ContextWindow>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ContextWindow {
    pub total_input_tokens: Option<u64>,
    pub context_window_size: Option<u64>,
    pub used_percentage: Option<f64>,
    pub current_usage: Option<CurrentUsage>,
}

#[derive(Debug, Default, Deserialize)]
pub struct CurrentUsage {
    pub input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
}

/// Colour band for the context segment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CtxColor {
    Normal,
    Warn,
    Danger,
}

const RESET: &str = "\u{1b}[0m";
const GREEN: &str = "\u{1b}[32m";
const YELLOW: &str = "\u{1b}[33m";
const RED: &str = "\u{1b}[31m";
const DIM: &str = "\u{1b}[2m";

/// Reduce a `context_window` object to the three numbers the line shows.
/// `used_percentage` is Claude Code's documented "null until the first API
/// response" sentinel, so its absence — not a zero token count — is what means
/// "no turns yet".
pub fn ctx_info(cw: &ContextWindow) -> Option<CtxInfo> {
    let pct = cw.used_percentage?;
    let size = cw.context_window_size?;
    let used = cw.total_input_tokens.or_else(|| {
        // Older Claude Code builds omit the pre-summed field. The three parts
        // are what "input tokens currently in the context window" is made of.
        let u = cw.current_usage.as_ref()?;
        Some(
            u.input_tokens.unwrap_or(0)
                + u.cache_read_input_tokens.unwrap_or(0)
                + u.cache_creation_input_tokens.unwrap_or(0),
        )
    })?;
    Some(CtxInfo { used, size, pct })
}

/// `842` / `84k` / `1.0M`. Integer division below 1M keeps `200000` reading as
/// the familiar `200k` rather than `0.2M`.
pub fn format_tokens(n: u64) -> String {
    if n < 1_000 {
        n.to_string()
    } else if n < 1_000_000 {
        format!("{}k", n / 1_000)
    } else {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    }
}

/// Which band a usage percentage falls into.
pub fn ctx_color(pct: f64) -> CtxColor {
    if pct >= 90.0 {
        CtxColor::Danger
    } else if pct >= 70.0 {
        CtxColor::Warn
    } else {
        CtxColor::Normal
    }
}

fn paint(s: &str, code: &str, color: bool) -> String {
    if color {
        format!("{code}{s}{RESET}")
    } else {
        s.to_string()
    }
}

/// Build the whole line. Two segments joined by `"  ·  "`; the `mcp` one is
/// dropped entirely outside Swarmterm rather than rendered as a "no" — a status
/// line in a plain terminal should not nag about a product that isn't running.
pub fn render(mcp: McpState, ctx: Option<CtxInfo>, color: bool) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(2);

    match mcp {
        McpState::Connected => parts.push(paint("mcp ✓", GREEN, color)),
        McpState::NoClient => parts.push(paint("mcp …", YELLOW, color)),
        McpState::Unreachable => parts.push(paint("mcp ✗", RED, color)),
        McpState::Absent => {}
    }

    let ctx_text = match ctx {
        None => paint("ctx —", DIM, color),
        Some(c) => {
            let body = format!(
                "ctx {}/{} {}%",
                format_tokens(c.used),
                format_tokens(c.size),
                c.pct.round() as u64
            );
            match ctx_color(c.pct) {
                CtxColor::Normal => paint(&body, DIM, color),
                CtxColor::Warn => paint(&body, YELLOW, color),
                CtxColor::Danger => paint(&body, RED, color),
            }
        }
    };
    parts.push(ctx_text);

    parts.join("  ·  ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(used: u64, size: u64, pct: f64) -> Option<CtxInfo> {
        Some(CtxInfo { used, size, pct })
    }

    #[test]
    fn renders_connected_with_context() {
        let line = render(McpState::Connected, ctx(84_213, 200_000, 42.1), false);
        assert_eq!(line, "mcp ✓  ·  ctx 84k/200k 42%");
    }

    #[test]
    fn renders_no_client_state() {
        let line = render(McpState::NoClient, ctx(84_213, 200_000, 42.1), false);
        assert_eq!(line, "mcp …  ·  ctx 84k/200k 42%");
    }

    #[test]
    fn renders_unreachable_state() {
        let line = render(McpState::Unreachable, ctx(84_213, 200_000, 42.1), false);
        assert_eq!(line, "mcp ✗  ·  ctx 84k/200k 42%");
    }

    #[test]
    fn omits_the_mcp_segment_entirely_when_absent() {
        let line = render(McpState::Absent, ctx(84_213, 200_000, 42.1), false);
        assert_eq!(line, "ctx 84k/200k 42%");
    }

    #[test]
    fn renders_an_em_dash_before_the_first_turn() {
        let line = render(McpState::Connected, None, false);
        assert_eq!(line, "mcp ✓  ·  ctx —");
    }

    #[test]
    fn stays_narrow_at_its_widest() {
        let line = render(McpState::Connected, ctx(842_000, 1_000_000, 84.2), false);
        assert_eq!(line, "mcp ✓  ·  ctx 842k/1.0M 84%");
        assert!(
            line.chars().count() <= 28,
            "line was {} cols",
            line.chars().count()
        );
    }

    #[test]
    fn formats_tokens_by_magnitude() {
        assert_eq!(format_tokens(0), "0");
        assert_eq!(format_tokens(842), "842");
        assert_eq!(format_tokens(999), "999");
        assert_eq!(format_tokens(1_000), "1k");
        assert_eq!(format_tokens(84_213), "84k");
        assert_eq!(format_tokens(200_000), "200k");
        assert_eq!(format_tokens(999_999), "999k");
        assert_eq!(format_tokens(1_000_000), "1.0M");
        assert_eq!(format_tokens(1_500_000), "1.5M");
        // The `[1m]` models report a 1 000 000 window, so this is the real
        // upper bound the line has to render, not a hypothetical.
        assert_eq!(format_tokens(842_000), "842k");
    }

    #[test]
    fn rounds_the_percentage_to_a_whole_number() {
        assert!(render(McpState::Absent, ctx(1, 2, 41.4), false).ends_with("41%"));
        assert!(render(McpState::Absent, ctx(1, 2, 41.6), false).ends_with("42%"));
    }

    #[test]
    fn colours_the_context_segment_by_threshold() {
        assert_eq!(ctx_color(0.0), CtxColor::Normal);
        assert_eq!(ctx_color(69.9), CtxColor::Normal);
        assert_eq!(ctx_color(70.0), CtxColor::Warn);
        assert_eq!(ctx_color(89.9), CtxColor::Warn);
        assert_eq!(ctx_color(90.0), CtxColor::Danger);
        assert_eq!(ctx_color(100.0), CtxColor::Danger);
    }

    #[test]
    fn emits_ansi_only_when_colour_is_requested() {
        let plain = render(McpState::Connected, ctx(84_213, 200_000, 42.1), false);
        assert!(!plain.contains('\u{1b}'));
        let coloured = render(McpState::Connected, ctx(84_213, 200_000, 42.1), true);
        assert!(coloured.contains("\u{1b}[32m"), "expected green for ✓");
        assert!(coloured.ends_with("\u{1b}[0m"));
    }

    #[test]
    fn ctx_info_uses_total_input_tokens_when_present() {
        let cw = ContextWindow {
            total_input_tokens: Some(84_213),
            context_window_size: Some(200_000),
            used_percentage: Some(42.1),
            current_usage: Some(CurrentUsage {
                input_tokens: Some(2),
                cache_read_input_tokens: Some(46_160),
                cache_creation_input_tokens: Some(3_697),
            }),
        };
        assert_eq!(ctx_info(&cw), ctx(84_213, 200_000, 42.1));
    }

    #[test]
    fn ctx_info_falls_back_to_summing_current_usage() {
        let cw = ContextWindow {
            total_input_tokens: None,
            context_window_size: Some(200_000),
            used_percentage: Some(24.9),
            current_usage: Some(CurrentUsage {
                input_tokens: Some(2),
                cache_read_input_tokens: Some(46_160),
                cache_creation_input_tokens: Some(3_697),
            }),
        };
        assert_eq!(ctx_info(&cw), ctx(49_859, 200_000, 24.9));
    }

    #[test]
    fn ctx_info_is_none_before_the_first_turn() {
        let cw = ContextWindow {
            total_input_tokens: Some(0),
            context_window_size: Some(200_000),
            used_percentage: None,
            current_usage: None,
        };
        assert_eq!(ctx_info(&cw), None);
    }

    #[test]
    fn parses_a_realistic_stdin_payload_ignoring_unknown_fields() {
        let raw = r#"{
          "session_id": "abc",
          "model": { "id": "claude-opus-5", "display_name": "Opus" },
          "context_window": {
            "total_input_tokens": 84213,
            "total_output_tokens": 444,
            "context_window_size": 200000,
            "used_percentage": 42.1,
            "remaining_percentage": 57.9,
            "current_usage": { "input_tokens": 2, "output_tokens": 444,
                               "cache_creation_input_tokens": 3697,
                               "cache_read_input_tokens": 46160 }
          }
        }"#;
        let input: StatusInput = serde_json::from_str(raw).unwrap();
        assert_eq!(
            ctx_info(input.context_window.as_ref().unwrap()),
            ctx(84_213, 200_000, 42.1)
        );
    }

    #[test]
    fn missing_context_window_yields_no_ctx_info() {
        let input: StatusInput = serde_json::from_str(r#"{"session_id":"abc"}"#).unwrap();
        assert!(input.context_window.is_none());
    }
}
