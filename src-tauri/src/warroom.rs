//! War Room state: the single app-wide membership map + per-member inboxes.
//! Pure data + rules so it unit-tests without Tauri; commands.rs and
//! mcp/tools/warroom.rs own the locking, event emission, and timestamps.

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

/// The human user's seat in the room. Seeded at construction and never
/// joined or left, so the transcript never opens with "Moderator joined" and
/// no `Join` seq is burned on it. Making it an ordinary member is what keeps
/// this feature small: every rule in `send` — sender must be a member,
/// execute needs a target, execute only toward agent panes, broadcast skips
/// pending members — applies to it unchanged.
pub const MODERATOR_ID: &str = "__moderator__";
pub const MODERATOR_NAME: &str = "Moderator";

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

/// Snapshot for the renderer (war_room_rooms command / boot hydration).
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

pub struct WarRoom {
    members: HashMap<String, RoomMember>,
    seq: u64,
}

impl Default for WarRoom {
    fn default() -> Self {
        let mut members = HashMap::new();
        members.insert(
            MODERATOR_ID.to_string(),
            RoomMember {
                agent_id: None,
                cwd: String::new(),
                display_name: MODERATOR_NAME.to_string(),
                // Connected from birth: there is no MCP handshake to wait for,
                // and a pending Moderator could never become connected.
                connected: true,
                inbox: VecDeque::new(),
            },
        );
        Self { members, seq: 0 }
    }
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

    /// Renderer snapshot, sorted like `peers()`. The Moderator is excluded:
    /// that seat is the user themself, and a roster chip would carry a ✕ that
    /// kicks the user from their own room.
    pub fn members_info(&self) -> Vec<MemberInfo> {
        self.peers()
            .into_iter()
            .filter(|(id, _)| id != MODERATOR_ID)
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
        // The seat is the user, not a pane; there is nothing to revoke and no
        // way back in if it were removed.
        if terminal_id == MODERATOR_ID {
            return None;
        }
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
                    return Err(if t == MODERATOR_ID {
                        "mode \"execute\" cannot target the Moderator — that seat is the human \
                         user driving Swarmterm, not a terminal. Use mode \"probe\" to ask them."
                            .into()
                    } else {
                        "mode \"execute\" is only allowed toward panes running a coding agent — \
                         pasting a prompt into a plain shell would execute arbitrary commands"
                            .to_string()
                    });
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
            // The Moderator reads the Discussion transcript, which already
            // carries this content — pushing here would grow a VecDeque that
            // nothing ever drains.
            if mode == MessageMode::Probe && tid != MODERATOR_ID {
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

/// Name of the room seeded at boot — drag-in works with zero setup.
pub const DEFAULT_ROOM_NAME: &str = "War Room";

pub struct RoomEntry {
    pub id: String,
    pub name: String,
    pub room: WarRoom,
}

/// Registry of independent rooms. A Vec, not a HashMap: creation order IS the
/// renderer's tab order, and with a handful of rooms every lookup is a linear
/// scan anyway. Ids are a process-local counter — nothing persists, so they
/// only need uniqueness within one launch.
pub struct WarRooms {
    rooms: Vec<RoomEntry>,
    next_id: u64,
}

impl Default for WarRooms {
    fn default() -> Self {
        let mut s = Self { rooms: Vec::new(), next_id: 1 };
        s.create(DEFAULT_ROOM_NAME).expect("default room name is non-blank");
        s
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomMeta {
    pub room_id: String,
    pub name: String,
}

/// Boot-hydration snapshot: rooms in tab order, each with its roster.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomInfo {
    pub room_id: String,
    pub name: String,
    pub members: Vec<MemberInfo>,
}

/// Wire envelope for `warroom:event`: the existing kind-tagged payload plus a
/// flattened `roomId`, so the renderer routes without a nested object.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomScopedEvent {
    pub room_id: String,
    #[serde(flatten)]
    pub event: WarRoomEvent,
}

pub fn scoped(room_id: &str, event: WarRoomEvent) -> RoomScopedEvent {
    RoomScopedEvent { room_id: room_id.to_string(), event }
}

pub struct JoinOutcome {
    /// `(old_room_id, Leave)` when the join was a move from another room.
    pub left: Option<(String, WarRoomEvent)>,
    pub joined: WarRoomEvent,
}

impl WarRooms {
    pub fn create(&mut self, name: &str) -> Result<RoomMeta, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("room name must not be empty".into());
        }
        let id = format!("room-{}", self.next_id);
        self.next_id += 1;
        self.rooms.push(RoomEntry { id: id.clone(), name: name.to_string(), room: WarRoom::default() });
        Ok(RoomMeta { room_id: id, name: name.to_string() })
    }

    pub fn rename(&mut self, room_id: &str, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("room name must not be empty".into());
        }
        let entry = self
            .rooms
            .iter_mut()
            .find(|r| r.id == room_id)
            .ok_or_else(|| format!("no such room \"{room_id}\""))?;
        entry.name = name.to_string();
        Ok(())
    }

    /// Removes the room and returns one Leave per (non-Moderator) member so the
    /// caller can emit them — the renderer's existing leave handling is what
    /// drops that terminal's queued deliveries and held flag.
    pub fn delete(&mut self, room_id: &str, ts: u64) -> Result<Vec<WarRoomEvent>, String> {
        let idx = self
            .rooms
            .iter()
            .position(|r| r.id == room_id)
            .ok_or_else(|| format!("no such room \"{room_id}\""))?;
        if self.rooms.len() == 1 {
            // The drop zone must always have a target; the UI disables the
            // button too, this is the authoritative guard.
            return Err("cannot delete the last room".into());
        }
        let mut entry = self.rooms.remove(idx);
        let ids: Vec<String> =
            entry.room.members_info().iter().map(|m| m.terminal_id.clone()).collect();
        Ok(ids.iter().filter_map(|id| entry.room.leave(id, ts)).collect())
    }

    /// The move semantics: joining room X while a member of room Y leaves Y
    /// first (inbox and handshake die with the old membership). A same-room
    /// re-join skips the leave so `WarRoom::join` keeps inbox + connected.
    pub fn join(
        &mut self,
        room_id: &str,
        terminal_id: String,
        agent_id: Option<String>,
        cwd: String,
        display_name: String,
        ts: u64,
    ) -> Result<JoinOutcome, String> {
        if !self.rooms.iter().any(|r| r.id == room_id) {
            return Err(format!("no such room \"{room_id}\""));
        }
        let left = match self.find_room_of(&terminal_id) {
            Some(entry) if entry.id == room_id => None,
            Some(_) => self.leave_everywhere(&terminal_id, ts),
            None => None,
        };
        let entry = self.rooms.iter_mut().find(|r| r.id == room_id).expect("checked above");
        let joined = entry.room.join(terminal_id, agent_id, cwd, display_name, ts);
        Ok(JoinOutcome { left, joined })
    }

    /// Backs `war_room_leave` and both PTY-death auto-leave paths — the caller
    /// doesn't know (or care) which room the pane was in.
    pub fn leave_everywhere(&mut self, terminal_id: &str, ts: u64) -> Option<(String, WarRoomEvent)> {
        for entry in self.rooms.iter_mut() {
            if let Some(ev) = entry.room.leave(terminal_id, ts) {
                return Some((entry.id.clone(), ev));
            }
        }
        None
    }

    /// The MCP gate: which room is this terminal in? The Moderator id would
    /// match every room, but MCP callers are always real terminal ids.
    pub fn find_room_of(&mut self, terminal_id: &str) -> Option<&mut RoomEntry> {
        self.rooms.iter_mut().find(|r| r.room.is_member(terminal_id))
    }

    pub fn get(&mut self, room_id: &str) -> Option<&mut RoomEntry> {
        self.rooms.iter_mut().find(|r| r.id == room_id)
    }

    pub fn rooms_meta(&self) -> Vec<RoomMeta> {
        self.rooms
            .iter()
            .map(|r| RoomMeta { room_id: r.id.clone(), name: r.name.clone() })
            .collect()
    }

    pub fn rooms_info(&self) -> Vec<RoomInfo> {
        self.rooms
            .iter()
            .map(|r| RoomInfo { room_id: r.id.clone(), name: r.name.clone(), members: r.room.members_info() })
            .collect()
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
        // Pending peer b is skipped, but the Moderator seat is always
        // connected — so a broadcast now always has somewhere to go. It just
        // produces no delivery, because the Moderator has no terminal.
        let out = solo.send("a", None, "x", MessageMode::Probe, 3).unwrap();
        assert!(out.deliveries.is_empty());
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
        assert_eq!(r.peers().len(), 2); // t1 + the seeded Moderator
        assert_eq!(r.members_info().len(), 1); // roster excludes the Moderator
        assert_eq!(
            r.peers().iter().find(|(id, _)| id == "t1").unwrap().1.agent_id.as_deref(),
            Some("codex")
        );
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
        // Was "broadcast with no peers" — the Moderator is now always a peer.
        assert!(solo.send("t1", None, "x", MessageMode::Probe, 1).is_ok());
        // The "no connected peers" branch IS still reachable, just from the
        // other direction: a Moderator broadcast into a room with no agent
        // panes at all finds no connected peer once it filters itself out.
        assert!(WarRoom::default().send(MODERATOR_ID, None, "x", MessageMode::Probe, 1).is_err());
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

    #[test]
    fn moderator_is_seeded_and_visible_to_agents_only() {
        let r = WarRoom::default();
        assert!(r.is_member(MODERATOR_ID));
        // peers() feeds MCP list_peers — agents must see the human.
        assert!(r.peers().iter().any(|(id, _)| id == MODERATOR_ID));
        // members_info() feeds the renderer roster — the user needs no chip.
        assert!(r.members_info().iter().all(|m| m.terminal_id != MODERATOR_ID));
        let (_, m) = r.peers().into_iter().find(|(id, _)| id == MODERATOR_ID).unwrap();
        assert_eq!(m.display_name, MODERATOR_NAME);
        assert!(m.connected);
        assert!(m.agent_id.is_none());
    }

    #[test]
    fn moderator_seat_cannot_be_vacated() {
        let mut r = WarRoom::default();
        assert!(r.leave(MODERATOR_ID, 1).is_none());
        assert!(r.is_member(MODERATOR_ID));
    }

    #[test]
    fn probe_to_moderator_skips_the_inbox() {
        let mut r = room_with_two();
        let out = r.send("t1", Some(MODERATOR_ID), "need a call on this", MessageMode::Probe, 5).unwrap();
        // Transcript event only: no terminal to nudge, no inbox to drain.
        assert!(out.deliveries.is_empty());
        assert!(r.drain_inbox(MODERATOR_ID).unwrap().is_empty());
    }

    #[test]
    fn execute_to_moderator_is_rejected_by_name() {
        let mut r = room_with_two();
        let err = r.send("t1", Some(MODERATOR_ID), "do it", MessageMode::Execute, 5).unwrap_err();
        assert!(err.contains("Moderator"));
    }

    #[test]
    fn moderator_broadcast_reaches_connected_agents_and_not_itself() {
        let mut r = room_with_two();
        let out = r.send(MODERATOR_ID, None, "all hands", MessageMode::Probe, 6).unwrap();
        assert_eq!(out.deliveries.len(), 2);
        assert!(out.deliveries.iter().all(|d| d.to_id != MODERATOR_ID));
        assert_eq!(r.drain_inbox("t1").unwrap().len(), 1);
        assert_eq!(r.drain_inbox("t2").unwrap().len(), 1);
    }

    #[test]
    fn moderator_send_carries_its_display_name() {
        let mut r = room_with_two();
        let out = r.send(MODERATOR_ID, Some("t1"), "hi", MessageMode::Probe, 7).unwrap();
        let j = serde_json::to_value(&out.event).unwrap();
        assert_eq!(j["fromName"], MODERATOR_NAME);
        assert_eq!(j["fromId"], MODERATOR_ID);
    }

    #[test]
    fn agent_broadcast_reaches_the_moderator_without_a_delivery() {
        let mut r = room_with_two();
        let out = r.send("t1", None, "status?", MessageMode::Probe, 8).unwrap();
        // t2 gets a delivery; the Moderator gets neither a delivery nor an inbox entry.
        assert_eq!(out.deliveries.len(), 1);
        assert_eq!(out.deliveries[0].to_id, "t2");
        assert!(r.drain_inbox(MODERATOR_ID).unwrap().is_empty());
    }

    // ---- WarRooms registry ----

    fn registry() -> WarRooms {
        WarRooms::default()
    }

    #[test]
    fn default_seeds_one_room_and_ids_increment() {
        let mut r = registry();
        let meta = r.rooms_meta();
        assert_eq!(meta.len(), 1);
        assert_eq!(meta[0].room_id, "room-1");
        assert_eq!(meta[0].name, DEFAULT_ROOM_NAME);
        let b = r.create("Website B").unwrap();
        assert_eq!(b.room_id, "room-2");
        r.delete("room-2", 1).unwrap();
        // Ids never recycle, even after a delete.
        assert_eq!(r.create("C").unwrap().room_id, "room-3");
    }

    #[test]
    fn create_and_rename_reject_blank_names_and_unknown_ids() {
        let mut r = registry();
        assert!(r.create("   ").is_err());
        assert!(r.rename("room-1", "").is_err());
        assert!(r.rename("ghost", "X").is_err());
        r.rename("room-1", "  Website A  ").unwrap();
        assert_eq!(r.rooms_meta()[0].name, "Website A"); // trimmed
    }

    #[test]
    fn delete_rejects_last_room_and_unknown_id() {
        let mut r = registry();
        assert!(r.delete("ghost", 1).is_err());
        let err = r.delete("room-1", 1).unwrap_err();
        assert!(err.contains("last room"));
        r.create("B").unwrap();
        r.delete("room-1", 1).unwrap(); // fine once another exists
        assert_eq!(r.rooms_meta().len(), 1);
    }

    #[test]
    fn delete_returns_a_leave_per_member_and_never_for_the_moderator() {
        let mut r = registry();
        r.create("B").unwrap();
        r.join("room-2", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 1).unwrap();
        r.join("room-2", "t2".into(), None, "/b".into(), "B".into(), 2).unwrap();
        let events = r.delete("room-2", 3).unwrap();
        assert_eq!(events.len(), 2);
        assert!(events.iter().all(|e| matches!(e, WarRoomEvent::Leave { .. })));
        assert!(r.find_room_of("t1").is_none());
    }

    #[test]
    fn join_moves_between_rooms_and_rejects_unknown_room() {
        let mut r = registry();
        r.create("B").unwrap();
        assert!(r.join("ghost", "t1".into(), None, "/a".into(), "A".into(), 1).is_err());
        let first = r.join("room-1", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 1).unwrap();
        assert!(first.left.is_none());
        assert_eq!(r.find_room_of("t1").unwrap().id, "room-1");
        let moved = r.join("room-2", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 2).unwrap();
        let (old_room, ev) = moved.left.expect("move yields the old room's leave");
        assert_eq!(old_room, "room-1");
        assert!(matches!(ev, WarRoomEvent::Leave { .. }));
        assert_eq!(r.find_room_of("t1").unwrap().id, "room-2");
        // Never in two rooms at once.
        assert!(!r.get("room-1").unwrap().room.is_member("t1"));
    }

    #[test]
    fn same_room_rejoin_does_not_leave_and_keeps_connected() {
        let mut r = registry();
        r.join("room-1", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 1).unwrap();
        r.find_room_of("t1").unwrap().room.mark_connected("t1", 2);
        let again = r.join("room-1", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 3).unwrap();
        assert!(again.left.is_none());
        assert!(matches!(again.joined, WarRoomEvent::Join { connected: true, .. }));
    }

    #[test]
    fn cross_room_move_resets_connected_to_pending() {
        let mut r = registry();
        r.create("B").unwrap();
        r.join("room-1", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 1).unwrap();
        r.find_room_of("t1").unwrap().room.mark_connected("t1", 2);
        let moved = r.join("room-2", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 3).unwrap();
        // Old inbox and handshake die with the old membership; the intro tells
        // the agent to call list_peers, which re-flips it immediately.
        assert!(matches!(moved.joined, WarRoomEvent::Join { connected: false, .. }));
    }

    #[test]
    fn leave_everywhere_finds_the_right_room_and_ignores_strangers_and_moderator() {
        let mut r = registry();
        r.create("B").unwrap();
        r.join("room-2", "t1".into(), None, "/a".into(), "A".into(), 1).unwrap();
        assert!(r.leave_everywhere("ghost", 2).is_none());
        assert!(r.leave_everywhere(MODERATOR_ID, 2).is_none()); // seat is per-room and unevictable
        let (room_id, _) = r.leave_everywhere("t1", 3).unwrap();
        assert_eq!(room_id, "room-2");
        assert!(r.leave_everywhere("t1", 4).is_none()); // idempotent
    }

    #[test]
    fn rooms_are_isolated_for_broadcast_and_each_has_its_own_moderator() {
        let mut r = registry();
        r.create("B").unwrap();
        r.join("room-1", "a1".into(), Some("codex".into()), "/a".into(), "A1".into(), 1).unwrap();
        r.join("room-1", "a2".into(), Some("codex".into()), "/a".into(), "A2".into(), 2).unwrap();
        r.join("room-2", "b1".into(), Some("codex".into()), "/b".into(), "B1".into(), 3).unwrap();
        for id in ["a1", "a2"] { r.get("room-1").unwrap().room.mark_connected(id, 4); }
        r.get("room-2").unwrap().room.mark_connected("b1", 4);
        let out = r.get("room-1").unwrap().room.send("a1", None, "hi", MessageMode::Probe, 5).unwrap();
        assert!(out.deliveries.iter().all(|d| d.to_id != "b1"));
        assert!(r.get("room-2").unwrap().room.drain_inbox("b1").unwrap().is_empty());
        // Each room's Moderator is addressable independently.
        assert!(r.get("room-2").unwrap().room.is_member(MODERATOR_ID));
        let out = r.get("room-2").unwrap().room
            .send(MODERATOR_ID, Some("b1"), "only B", MessageMode::Probe, 6).unwrap();
        assert_eq!(out.deliveries.len(), 1);
        assert!(r.get("room-1").unwrap().room.drain_inbox("a1").unwrap().is_empty());
    }

    #[test]
    fn rooms_info_reports_rooms_in_creation_order_with_members() {
        let mut r = registry();
        r.create("B").unwrap();
        r.join("room-2", "t1".into(), None, "/x".into(), "X".into(), 1).unwrap();
        let info = r.rooms_info();
        assert_eq!(info.len(), 2);
        assert_eq!(info[0].room_id, "room-1");
        assert!(info[0].members.is_empty());
        assert_eq!(info[1].members.len(), 1);
        assert_eq!(info[1].members[0].terminal_id, "t1");
    }

    #[test]
    fn room_scoped_event_serializes_flat_with_room_id() {
        let mut r = registry();
        let out = r.join("room-1", "t1".into(), Some("codex".into()), "/a".into(), "A".into(), 1).unwrap();
        let j = serde_json::to_value(scoped("room-1", out.joined)).unwrap();
        assert_eq!(j["roomId"], "room-1");
        assert_eq!(j["kind"], "join"); // flattened, not nested under "event"
        assert_eq!(j["terminalId"], "t1");
        let meta = serde_json::to_value(&r.rooms_meta()[0]).unwrap();
        assert_eq!(meta["roomId"], "room-1");
        let info = serde_json::to_value(&r.rooms_info()[0]).unwrap();
        assert_eq!(info["members"].as_array().unwrap().len(), 1);
    }
}
