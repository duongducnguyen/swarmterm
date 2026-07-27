//! War Room state: the single app-wide membership map + per-member inboxes.
//! Pure data + rules so it unit-tests without Tauri; commands.rs and
//! mcp/tools/warroom.rs own the locking, event emission, and timestamps.
//! Spec: docs/design-docs/specs/2026-07-27-war-room-design.md.

use std::collections::{HashMap, VecDeque};

use rmcp::schemars;
use serde::Serialize;

/// ms since epoch. Lives here so commands and MCP tools stamp identically.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MessageMode {
    /// Content goes to the recipient's inbox; the terminal only gets a short nudge.
    Probe,
    /// Content is pasted into the recipient's terminal and run as a prompt.
    Execute,
}

impl MessageMode {
    pub fn parse(s: Option<&str>) -> Result<Self, String> {
        match s {
            None | Some("probe") => Ok(Self::Probe),
            Some("execute") => Ok(Self::Execute),
            Some(other) => Err(format!(
                "unknown mode \"{other}\" — use \"probe\" (message via inbox) or \"execute\" (run in the peer's terminal)"
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RoomMessage {
    pub seq: u64,
    pub from_id: String,
    pub from_name: String,
    pub content: String,
    pub mode: MessageMode,
    /// ms since epoch, stamped by the caller (commands/tools own the clock).
    pub ts: u64,
}

#[derive(Debug, Clone)]
pub struct RoomMember {
    pub agent_id: Option<String>,
    pub cwd: String,
    pub display_name: String,
    /// False until the process inside the pane makes its first successful
    /// war_room.* call — the MCP handshake proving an agent (not a bare
    /// shell) is actually listening. Dragging a pane in only makes it
    /// *pending*; messages are routed to connected members only.
    pub connected: bool,
    pub inbox: VecDeque<RoomMessage>,
}

/// Snapshot for the renderer (war_room_members command / boot hydration).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberInfo {
    pub terminal_id: String,
    pub name: String,
    pub agent_id: Option<String>,
    pub cwd: String,
    pub connected: bool,
}

/// Transcript event pushed to the renderer over `warroom:event`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum WarRoomEvent {
    Join { seq: u64, terminal_id: String, name: String, agent_id: Option<String>, cwd: String, connected: bool, ts: u64 },
    Leave { seq: u64, terminal_id: String, name: String, ts: u64 },
    /// First successful war_room.* call from a pending member — the agent
    /// inside the pane has proven itself (a dragged-in bare shell never will).
    Connected { seq: u64, terminal_id: String, name: String, ts: u64 },
    Message {
        seq: u64,
        from_id: String,
        from_name: String,
        /// None = broadcast to every other member.
        to_id: Option<String>,
        to_name: Option<String>,
        content: String,
        mode: MessageMode,
        ts: u64,
    },
}

/// Delivery instruction pushed to the renderer over `warroom:deliver`. The
/// renderer owns idle-detection, so the backend never decides WHEN to type
/// into a terminal — only WHAT.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarRoomDeliver {
    pub to_id: String,
    pub from_name: String,
    pub mode: MessageMode,
    /// Full prompt for execute; None for probe (the body stays in the inbox
    /// so message content never bloats the recipient's terminal context).
    pub content: Option<String>,
}

#[derive(Debug)]
pub struct SendOutcome {
    pub event: WarRoomEvent,
    pub deliveries: Vec<WarRoomDeliver>,
}

#[derive(Default)]
pub struct WarRoom {
    members: HashMap<String, RoomMember>,
    seq: u64,
}

impl WarRoom {
    fn next_seq(&mut self) -> u64 {
        self.seq += 1;
        self.seq
    }

    pub fn is_member(&self, terminal_id: &str) -> bool {
        self.members.contains_key(terminal_id)
    }

    /// Members as (terminalId, member) sorted by display name for stable output.
    pub fn peers(&self) -> Vec<(String, &RoomMember)> {
        let mut v: Vec<_> = self.members.iter().map(|(k, m)| (k.clone(), m)).collect();
        v.sort_by(|a, b| a.1.display_name.cmp(&b.1.display_name));
        v
    }

    /// Insert or refresh a member. Re-join updates metadata but keeps the
    /// inbox AND the connected flag — a pane re-dropped into the zone must
    /// not lose queued messages, and an agent that already proved itself
    /// stays proven.
    pub fn join(
        &mut self,
        terminal_id: String,
        agent_id: Option<String>,
        cwd: String,
        display_name: String,
        ts: u64,
    ) -> WarRoomEvent {
        let (inbox, connected) = self
            .members
            .remove(&terminal_id)
            .map(|m| (m.inbox, m.connected))
            .unwrap_or_default();
        self.members.insert(
            terminal_id.clone(),
            RoomMember {
                agent_id: agent_id.clone(),
                cwd: cwd.clone(),
                display_name: display_name.clone(),
                connected,
                inbox,
            },
        );
        let seq = self.next_seq();
        WarRoomEvent::Join { seq, terminal_id, name: display_name, agent_id, cwd, connected, ts }
    }

    /// The MCP handshake: flips a pending member to connected on its first
    /// successful tool call. Returns the transcript event only on the
    /// false→true edge (repeat calls are silent), None for non-members.
    pub fn mark_connected(&mut self, terminal_id: &str, ts: u64) -> Option<WarRoomEvent> {
        let member = self.members.get_mut(terminal_id)?;
        if member.connected {
            return None;
        }
        member.connected = true;
        let name = member.display_name.clone();
        let seq = self.next_seq();
        Some(WarRoomEvent::Connected { seq, terminal_id: terminal_id.into(), name, ts })
    }

    /// Renderer snapshot, sorted like `peers()`.
    pub fn members_info(&self) -> Vec<MemberInfo> {
        self.peers()
            .into_iter()
            .map(|(id, m)| MemberInfo {
                terminal_id: id,
                name: m.display_name.clone(),
                agent_id: m.agent_id.clone(),
                cwd: m.cwd.clone(),
                connected: m.connected,
            })
            .collect()
    }

    pub fn leave(&mut self, terminal_id: &str, ts: u64) -> Option<WarRoomEvent> {
        let member = self.members.remove(terminal_id)?;
        let seq = self.next_seq();
        Some(WarRoomEvent::Leave { seq, terminal_id: terminal_id.into(), name: member.display_name, ts })
    }

    pub fn send(
        &mut self,
        from_id: &str,
        to: Option<&str>,
        content: &str,
        mode: MessageMode,
        ts: u64,
    ) -> Result<SendOutcome, String> {
        let content = content.trim();
        if content.is_empty() {
            return Err("content must not be empty".into());
        }
        let from_name = self
            .members
            .get(from_id)
            .ok_or("sender is not in the War Room")?
            .display_name
            .clone();

        let target_ids: Vec<String> = match to {
            Some(t) if t == from_id => return Err("cannot send to yourself".into()),
            Some(t) => {
                let target = self.members.get(t).ok_or_else(|| {
                    format!("\"{t}\" is not in the War Room — call war_room.list_peers for current members")
                })?;
                if !target.connected {
                    return Err(format!(
                        "\"{t}\" has not connected to the War Room yet — the agent inside that \
                         pane must make a war_room call first (a bare shell never will). Check \
                         war_room.list_peers for connection status."
                    ));
                }
                if mode == MessageMode::Execute && target.agent_id.is_none() {
                    return Err(
                        "mode \"execute\" is only allowed toward panes running a coding agent — \
                         pasting a prompt into a plain shell would execute arbitrary commands"
                            .into(),
                    );
                }
                vec![t.to_string()]
            }
            None => {
                if mode == MessageMode::Execute {
                    return Err("mode \"execute\" requires \"to\" — a prompt runs in exactly one peer's terminal".into());
                }
                // Pending members are skipped, not errored: a broadcast is
                // best-effort room-wide and a bare shell can never read it.
                let others: Vec<String> = self
                    .members
                    .iter()
                    .filter(|(k, m)| *k != from_id && m.connected)
                    .map(|(k, _)| k.clone())
                    .collect();
                if others.is_empty() {
                    return Err("no connected peers in the War Room yet".into());
                }
                others
            }
        };

        let seq = self.next_seq();
        let to_name = to.and_then(|t| self.members.get(t)).map(|m| m.display_name.clone());
        let event = WarRoomEvent::Message {
            seq,
            from_id: from_id.into(),
            from_name: from_name.clone(),
            to_id: to.map(String::from),
            to_name,
            content: content.into(),
            mode,
            ts,
        };

        let mut deliveries = Vec::new();
        for tid in &target_ids {
            let target = self.members.get_mut(tid).expect("validated above");
            if mode == MessageMode::Probe {
                target.inbox.push_back(RoomMessage {
                    seq,
                    from_id: from_id.into(),
                    from_name: from_name.clone(),
                    content: content.into(),
                    mode,
                    ts,
                });
            }
            // Nudges/paste only make sense for panes running an agent CLI —
            // a plain shell keeps the inbox entry but is never typed into.
            if target.agent_id.is_some() {
                deliveries.push(WarRoomDeliver {
                    to_id: tid.clone(),
                    from_name: from_name.clone(),
                    mode,
                    content: (mode == MessageMode::Execute).then(|| content.to_string()),
                });
            }
        }
        Ok(SendOutcome { event, deliveries })
    }

    pub fn drain_inbox(&mut self, terminal_id: &str) -> Option<Vec<RoomMessage>> {
        let member = self.members.get_mut(terminal_id)?;
        Some(member.inbox.drain(..).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn room_with_two() -> WarRoom {
        let mut r = WarRoom::default();
        r.join("t1".into(), Some("claude-code".into()), "/a".into(), "Claude".into(), 1);
        r.join("t2".into(), Some("codex".into()), "/b".into(), "Codex".into(), 2);
        // Both agents complete the MCP handshake, like real ones do on intro.
        r.mark_connected("t1", 1);
        r.mark_connected("t2", 2);
        r
    }

    #[test]
    fn mark_connected_fires_once_and_needs_membership() {
        let mut r = WarRoom::default();
        assert!(r.mark_connected("ghost", 1).is_none());
        r.join("t1".into(), Some("codex".into()), "/a".into(), "Codex".into(), 1);
        let ev = r.mark_connected("t1", 2).expect("first call flips");
        assert!(matches!(ev, WarRoomEvent::Connected { .. }));
        assert!(r.mark_connected("t1", 3).is_none()); // edge-triggered
    }

    #[test]
    fn rejoin_preserves_connected_flag() {
        let mut r = WarRoom::default();
        r.join("t1".into(), Some("codex".into()), "/a".into(), "Codex".into(), 1);
        r.mark_connected("t1", 2);
        let ev = r.join("t1".into(), Some("codex".into()), "/a".into(), "Codex".into(), 3);
        assert!(matches!(ev, WarRoomEvent::Join { connected: true, .. }));
    }

    #[test]
    fn direct_send_to_pending_member_is_rejected() {
        let mut r = room_with_two();
        r.join("t3".into(), Some("codex".into()), "/c".into(), "Pending".into(), 3);
        let err = r.send("t1", Some("t3"), "hi", MessageMode::Probe, 4).unwrap_err();
        assert!(err.contains("not connected"));
    }

    #[test]
    fn broadcast_skips_pending_members() {
        let mut r = room_with_two();
        r.join("t3".into(), Some("codex".into()), "/c".into(), "Pending".into(), 3);
        let out = r.send("t1", None, "all hands", MessageMode::Probe, 4).unwrap();
        assert_eq!(out.deliveries.len(), 1); // only connected t2
        assert!(r.drain_inbox("t3").unwrap().is_empty());
        let mut solo = WarRoom::default();
        solo.join("a".into(), Some("codex".into()), "/a".into(), "A".into(), 1);
        solo.mark_connected("a", 1);
        solo.join("b".into(), Some("codex".into()), "/b".into(), "B".into(), 2);
        // Only pending peers around → broadcast has nobody to reach.
        assert!(solo.send("a", None, "x", MessageMode::Probe, 3).is_err());
    }

    #[test]
    fn members_info_reports_status_sorted_by_name() {
        let mut r = room_with_two();
        r.join("t3".into(), None, "/c".into(), "AShell".into(), 3);
        let info = r.members_info();
        assert_eq!(info.len(), 3);
        assert_eq!(info[0].name, "AShell");
        assert!(!info[0].connected);
        assert!(info.iter().find(|m| m.terminal_id == "t1").unwrap().connected);
    }

    #[test]
    fn join_adds_member_and_rejoin_updates_without_duplicate() {
        let mut r = WarRoom::default();
        let ev = r.join("t1".into(), None, "/a".into(), "Term".into(), 1);
        assert!(matches!(ev, WarRoomEvent::Join { .. }));
        r.join("t1".into(), Some("codex".into()), "/b".into(), "Codex".into(), 2);
        assert_eq!(r.peers().len(), 1);
        assert_eq!(r.peers()[0].1.agent_id.as_deref(), Some("codex"));
    }

    #[test]
    fn leave_removes_and_is_idempotent() {
        let mut r = room_with_two();
        assert!(r.leave("t1", 3).is_some());
        assert!(r.leave("t1", 4).is_none());
        assert!(!r.is_member("t1"));
        assert!(r.is_member("t2"));
    }

    #[test]
    fn probe_send_lands_in_target_inbox_and_yields_delivery() {
        let mut r = room_with_two();
        let out = r.send("t1", Some("t2"), "hello", MessageMode::Probe, 10).unwrap();
        assert_eq!(out.deliveries.len(), 1);
        assert_eq!(out.deliveries[0].to_id, "t2");
        assert_eq!(out.deliveries[0].content, None); // probe body stays server-side
        let inbox = r.drain_inbox("t2").unwrap();
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].content, "hello");
        assert!(r.drain_inbox("t2").unwrap().is_empty()); // drained
    }

    #[test]
    fn broadcast_reaches_every_connected_peer_but_sender() {
        let mut r = room_with_two();
        r.join("t3".into(), Some("opencode".into()), "/c".into(), "Open".into(), 3);
        r.mark_connected("t3", 3);
        let out = r.send("t1", None, "all hands", MessageMode::Probe, 11).unwrap();
        assert_eq!(r.drain_inbox("t2").unwrap().len(), 1);
        assert_eq!(r.drain_inbox("t3").unwrap().len(), 1);
        assert_eq!(out.deliveries.len(), 2);
    }

    #[test]
    fn send_rejections() {
        let mut r = room_with_two();
        assert!(r.send("ghost", Some("t2"), "x", MessageMode::Probe, 1).is_err()); // non-member sender
        assert!(r.send("t1", Some("ghost"), "x", MessageMode::Probe, 1).is_err()); // non-member target
        assert!(r.send("t1", Some("t2"), "   ", MessageMode::Probe, 1).is_err()); // blank content
        assert!(r.send("t1", Some("t1"), "x", MessageMode::Probe, 1).is_err()); // self-send
        assert!(r.send("t1", None, "x", MessageMode::Execute, 1).is_err()); // execute needs a target
        // A shell CAN become connected (anything in the pane may curl the MCP
        // endpoint) — the execute guard must still hold for it.
        r.join("t3".into(), None, "/c".into(), "Shell".into(), 3);
        r.mark_connected("t3", 3);
        assert!(r.send("t1", Some("t3"), "x", MessageMode::Execute, 1).is_err()); // execute into plain shell
        let mut solo = WarRoom::default();
        solo.join("t1".into(), None, "/a".into(), "A".into(), 1);
        assert!(solo.send("t1", None, "x", MessageMode::Probe, 1).is_err()); // broadcast with no peers
    }

    #[test]
    fn execute_skips_inbox_and_carries_content() {
        let mut r = room_with_two();
        let out = r.send("t1", Some("t2"), "run this", MessageMode::Execute, 12).unwrap();
        assert_eq!(out.deliveries[0].content.as_deref(), Some("run this"));
        assert!(r.drain_inbox("t2").unwrap().is_empty());
    }

    #[test]
    fn drain_inbox_of_non_member_is_none() {
        let mut r = WarRoom::default();
        assert!(r.drain_inbox("nope").is_none());
    }

    #[test]
    fn mode_parses() {
        assert_eq!(MessageMode::parse(None).unwrap(), MessageMode::Probe);
        assert_eq!(MessageMode::parse(Some("probe")).unwrap(), MessageMode::Probe);
        assert_eq!(MessageMode::parse(Some("execute")).unwrap(), MessageMode::Execute);
        assert!(MessageMode::parse(Some("yolo")).is_err());
    }

    #[test]
    fn events_serialize_camelcase_with_kind_tag() {
        let mut r = WarRoom::default();
        let ev = r.join("t1".into(), Some("codex".into()), "/a".into(), "Codex".into(), 5);
        let j = serde_json::to_value(&ev).unwrap();
        assert_eq!(j["kind"], "join");
        assert_eq!(j["terminalId"], "t1");
        assert_eq!(j["agentId"], "codex");
        assert_eq!(j["connected"], false);
        let c = serde_json::to_value(r.mark_connected("t1", 6).unwrap()).unwrap();
        assert_eq!(c["kind"], "connected");
        assert_eq!(c["terminalId"], "t1");
        r.join("t2".into(), Some("agent2".into()), "/b".into(), "B".into(), 6);
        r.mark_connected("t2", 6);
        let out = r.send("t1", Some("t2"), "hi", MessageMode::Probe, 7).unwrap();
        let m = serde_json::to_value(&out.event).unwrap();
        assert_eq!(m["kind"], "message");
        assert_eq!(m["fromName"], "Codex");
        assert_eq!(m["toId"], "t2");
        assert_eq!(m["mode"], "probe");
        let d = serde_json::to_value(&out.deliveries[0]).unwrap();
        assert_eq!(d["toId"], "t2");
        assert_eq!(d["fromName"], "Codex");
    }

    #[test]
    fn seq_increments_across_all_event_kinds() {
        let mut r = room_with_two(); // seqs 1-4: two joins + two connects
        let out = r.send("t1", Some("t2"), "hi", MessageMode::Probe, 9).unwrap();
        let seq_of = |e: &WarRoomEvent| match e {
            WarRoomEvent::Join { seq, .. }
            | WarRoomEvent::Leave { seq, .. }
            | WarRoomEvent::Connected { seq, .. }
            | WarRoomEvent::Message { seq, .. } => *seq,
        };
        assert_eq!(seq_of(&out.event), 5);
        let leave = r.leave("t2", 10).unwrap();
        assert_eq!(seq_of(&leave), 6);
    }

    #[test]
    fn now_ms_returns_epoch_millis() {
        let ts = now_ms();
        assert!(ts > 1_700_000_000_000);
    }
}
