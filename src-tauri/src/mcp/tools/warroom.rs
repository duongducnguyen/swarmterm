//! MCP War Room tools: list peers, send (probe/execute), read inbox. Gated
//! per-call on live room membership — drag-out revokes by removing the map
//! entry, so the next call from an evicted pane fails right here. See the
//! 2026-07-27 war-room spec.

use serde::{Deserialize, Serialize};

/// Told to any caller outside every room. Written for the agent: it names the
/// user action that fixes it, mirroring worktree_ctx's error posture.
pub const NOT_IN_ROOM: &str =
    "this terminal is not in a War Room — ask the user to drag this pane into a room \
     in the War Room panel (right sidebar) to join";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peer_entry_serializes_camelcase() {
        let p = PeerEntry {
            terminal_id: "t1".into(),
            name: "Claude".into(),
            agent_id: Some("claude-code".into()),
            cwd: "/x".into(),
            is_self: true,
            connected: false,
        };
        let j = serde_json::to_value(&p).unwrap();
        assert_eq!(j["terminalId"], "t1");
        assert_eq!(j["isSelf"], true);
        assert_eq!(j["agentId"], "claude-code");
        assert_eq!(j["connected"], false);
    }

    #[test]
    fn not_in_room_message_names_the_fix() {
        assert!(NOT_IN_ROOM.contains("drag"));
        assert!(NOT_IN_ROOM.contains("War Room"));
    }

    #[test]
    fn list_peers_result_serializes_room() {
        let result = ListPeersResult {
            room: "Website A".into(),
            peers: vec![],
            note: String::new(),
        };
        let j = serde_json::to_value(&result).unwrap();
        assert_eq!(j["room"], "Website A");
    }
}

// --- tool methods on the shared server struct ---

use rmcp::handler::server::wrapper::{Json, Parameters};
// `tool` / `tool_router` MUST be imported bare — see mcp/server.rs module docs.
use rmcp::{schemars, tool, tool_router};
use tauri::{Emitter, Manager};

use crate::mcp::server::SwarmtermMcpServer;
use crate::pty::AppState;
use crate::warroom::{now_ms, MessageMode, RoomMessage};

#[derive(Debug, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PeerEntry {
    pub terminal_id: String,
    pub name: String,
    pub agent_id: Option<String>,
    pub cwd: String,
    pub is_self: bool,
    /// False = dragged in but no agent has made a war_room call from that
    /// pane yet — it cannot receive messages until it does.
    pub connected: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListPeersResult {
    /// Display name of the room this terminal is in.
    pub room: String,
    pub peers: Vec<PeerEntry>,
    pub note: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WarRoomSendArgs {
    /// Target peer's terminalId (from war_room.list_peers). Omit to broadcast
    /// to every other member. Required when mode is "execute".
    pub to: Option<String>,
    /// The message (probe) or the exact prompt to run in the peer's terminal (execute).
    pub content: String,
    /// "probe" (default): deliver to the peer's inbox; they read it with
    /// war_room.read_inbox. "execute": paste into the peer's terminal and run.
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WarRoomSendResult {
    pub delivered: usize,
    pub note: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ReadInboxResult {
    pub messages: Vec<RoomMessage>,
    pub note: String,
}

#[tool_router(router = tool_router_warroom, vis = "pub")]
impl SwarmtermMcpServer {
    #[tool(
        name = "war_room.list_peers",
        description = "List the terminals currently in Swarmterm's War Room: name, agent type, working directory. Only works when the user has dragged this pane into the War Room."
    )]
    pub async fn war_room_list_peers(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
    ) -> Result<Json<ListPeersResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let state = self.app.state::<AppState>();
        // Lock scoped to a block so the handshake event is emitted lock-free.
        let (room_id, connected_ev, room_name, peers) = {
            let mut rooms = state.war_rooms.lock().unwrap();
            let entry = rooms
                .find_room_of(&terminal.0)
                .ok_or_else(|| rmcp::ErrorData::invalid_request(NOT_IN_ROOM, None))?;
            let room_id = entry.id.clone();
            let room = &mut entry.room;
            let connected_ev = room.mark_connected(&terminal.0, now_ms());
            let peers: Vec<PeerEntry> = room
                .peers()
                .into_iter()
                .map(|(id, m)| PeerEntry {
                    is_self: id == terminal.0,
                    terminal_id: id,
                    name: m.display_name.clone(),
                    agent_id: m.agent_id.clone(),
                    cwd: m.cwd.clone(),
                    connected: m.connected,
                })
                .collect();
            (room_id, connected_ev, entry.name.clone(), peers)
        };
        if let Some(ev) = connected_ev {
            let _ = self.app.emit("warroom:event", &crate::warroom::scoped(&room_id, ev));
        }
        Ok(Json(ListPeersResult {
            room: room_name,
            peers,
            note: "Message a peer with war_room.send (mode \"probe\"), or hand one a task \
                   with mode \"execute\". Peers inspect their own codebase — ask them \
                   instead of requesting their files. The peer \"Moderator\" is the human \
                   user: probe them for a decision, never send them mode \"execute\" (they \
                   have no terminal)."
                .into(),
        }))
    }

    #[tool(
        name = "war_room.send",
        description = "Send to War Room peers. mode \"probe\" (default): the content goes to the peer's inbox and they are nudged to read it — use for questions, debate, coordination. mode \"execute\": the content is pasted into the peer's terminal and run as their next prompt — use to hand over an agreed task. Omit \"to\" to broadcast a probe to all peers."
    )]
    pub async fn war_room_send(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
        Parameters(args): Parameters<WarRoomSendArgs>,
    ) -> Result<Json<WarRoomSendResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let mode = MessageMode::parse(args.mode.as_deref())
            .map_err(|m| rmcp::ErrorData::invalid_params(m, None))?;
        let state = self.app.state::<AppState>();
        // Lock, mutate, collect what to emit, drop the lock BEFORE emitting —
        // emit re-enters Tauri and must never run under our mutex.
        let (room_id, connected_ev, event, deliveries) = {
            let mut rooms = state.war_rooms.lock().unwrap();
            let entry = rooms
                .find_room_of(&terminal.0)
                .ok_or_else(|| rmcp::ErrorData::invalid_request(NOT_IN_ROOM, None))?;
            let room_id = entry.id.clone();
            let room = &mut entry.room;
            // The call itself IS the handshake — a sender is proven by definition.
            let connected_ev = room.mark_connected(&terminal.0, now_ms());
            let out = room
                .send(&terminal.0, args.to.as_deref(), &args.content, mode, now_ms())
                .map_err(|m| rmcp::ErrorData::invalid_params(m, None))?;
            (room_id, connected_ev, out.event, out.deliveries)
        };
        let delivered = deliveries.len();
        if let Some(ev) = connected_ev {
            let _ = self.app.emit("warroom:event", &crate::warroom::scoped(&room_id, ev));
        }
        let _ = self.app.emit("warroom:event", &crate::warroom::scoped(&room_id, event));
        for d in deliveries {
            let _ = self.app.emit("warroom:deliver", &d);
        }
        Ok(Json(WarRoomSendResult {
            delivered,
            note: match mode {
                MessageMode::Probe => "Delivered to the peer's inbox; they will be nudged when idle. \
                                       Expect a reply via your own inbox — check war_room.read_inbox."
                    .into(),
                MessageMode::Execute => "The prompt will be pasted into the peer's terminal and run \
                                         when that pane is idle."
                    .into(),
            },
        }))
    }

    #[tool(
        name = "war_room.read_inbox",
        description = "Read and clear your pending War Room messages. Call this when nudged; reply with war_room.send."
    )]
    pub async fn war_room_read_inbox(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
    ) -> Result<Json<ReadInboxResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let state = self.app.state::<AppState>();
        let (room_id, connected_ev, messages) = {
            let mut rooms = state.war_rooms.lock().unwrap();
            let entry = rooms
                .find_room_of(&terminal.0)
                .ok_or_else(|| rmcp::ErrorData::invalid_request(NOT_IN_ROOM, None))?;
            let room_id = entry.id.clone();
            let room = &mut entry.room;
            let connected_ev = room.mark_connected(&terminal.0, now_ms());
            let messages = room.drain_inbox(&terminal.0).unwrap_or_default();
            (room_id, connected_ev, messages)
        };
        if let Some(ev) = connected_ev {
            let _ = self.app.emit("warroom:event", &crate::warroom::scoped(&room_id, ev));
        }
        let note = if messages.is_empty() {
            "No pending messages.".into()
        } else {
            "Reply with war_room.send — keep the conversation in the tools, not the terminal.".to_string()
        };
        Ok(Json(ReadInboxResult { messages, note }))
    }
}
