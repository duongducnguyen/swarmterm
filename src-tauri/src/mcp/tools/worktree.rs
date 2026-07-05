//! MCP worktree tools: spawn an agent pane inside a fresh git worktree, list
//! worktrees, remove merged ones. Gated per-terminal on the workspace's
//! "Isolate features in git worktrees" toggle (worktree_mode in the map).

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Wire shapes for the renderer. camelCase must match src/tauri/worktree.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSpawnEvent {
    pub requester_terminal_id: String,
    pub path: String,
    pub branch: String,
    pub agent: Option<String>,
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRemovedEvent {
    pub path: String,
}

/// Ids must stay in sync with TEMPLATES in src/lib/templates.ts. "terminal"
/// is deliberately absent: worktree.spawn exists to start an agent on a task.
const AGENT_IDS: [&str; 3] = ["claude-code", "codex", "opencode"];

pub fn validate_agent_id(agent: Option<&str>) -> Result<(), String> {
    match agent {
        None => Ok(()),
        Some(a) if AGENT_IDS.contains(&a) => Ok(()),
        Some(a) => Err(format!(
            "unknown agent \"{a}\" — pass one of: {} (or omit to reuse the calling pane's agent)",
            AGENT_IDS.join(", ")
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_event_serializes_camelcase() {
        let ev = WorktreeSpawnEvent {
            requester_terminal_id: "t1".into(),
            path: "C:/dev/myapp.worktrees/feat-login".into(),
            branch: "feat/login".into(),
            agent: None,
            prompt: "Implement login".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["requesterTerminalId"], "t1");
        assert_eq!(json["branch"], "feat/login");
        assert_eq!(json["agent"], serde_json::Value::Null);
    }

    #[test]
    fn agent_id_allow_list() {
        assert!(validate_agent_id(None).is_ok());
        assert!(validate_agent_id(Some("claude-code")).is_ok());
        assert!(validate_agent_id(Some("codex")).is_ok());
        assert!(validate_agent_id(Some("opencode")).is_ok());
        assert!(validate_agent_id(Some("terminal")).is_err());
        assert!(validate_agent_id(Some("nope")).is_err());
    }
}

// --- tool methods on the shared server struct ---

use rmcp::handler::server::wrapper::{Json, Parameters};
// `tool` / `tool_router` MUST be imported bare — see mcp/server.rs module docs.
use rmcp::{schemars, tool, tool_router};
use tauri::{Emitter, Manager};

use crate::mcp::server::SwarmtermMcpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WorktreeSpawnArgs {
    /// Branch for the new worktree, named after the task (e.g. "feat/login").
    pub branch: String,
    /// The task brief the spawned agent starts working on immediately.
    pub prompt: String,
    /// Agent template id: "claude-code", "codex" or "opencode". Omit to reuse
    /// the calling pane's agent.
    pub agent: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WorktreeSpawnResult {
    pub path: String,
    pub branch: String,
    /// Guidance the calling agent should follow after spawning.
    pub note: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WorktreeRemoveArgs {
    /// Absolute path of the worktree to remove (from worktree.spawn or .list).
    pub path: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WorktreeRemoveResult {
    pub ok: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WorktreeListResult {
    pub worktrees: Vec<crate::git::WorktreeInfo>,
}

#[tool_router(router = tool_router_worktree, vis = "pub")]
impl SwarmtermMcpServer {
    #[tool(
        name = "worktree.spawn",
        description = "Create an isolated git worktree for a task and open a new Swarmterm pane running a coding agent inside it. The worktree is created as <repo>.worktrees/<branch-slug> next to the repository, on a new branch. Use this instead of `git worktree add` when delegating a feature/fix to a parallel agent. Dependencies are NOT installed in the fresh worktree — the spawned agent must run project setup first."
    )]
    pub async fn worktree_spawn(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
        Parameters(args): Parameters<WorktreeSpawnArgs>,
    ) -> Result<Json<WorktreeSpawnResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let repo_root = self.worktree_ctx(&terminal)?;
        if args.prompt.trim().is_empty() {
            return Err(rmcp::ErrorData::invalid_params("prompt must not be empty", None));
        }
        validate_agent_id(args.agent.as_deref())
            .map_err(|m| rmcp::ErrorData::invalid_params(m, None))?;

        let branch = args.branch.clone();
        let created = tauri::async_runtime::spawn_blocking(move || {
            crate::git::create_worktree(Path::new(&repo_root), &branch)
        })
        .await
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?
        .map_err(|m| rmcp::ErrorData::invalid_params(m, None))?;

        self.app
            .emit(
                "worktree:spawn",
                WorktreeSpawnEvent {
                    requester_terminal_id: terminal.0.clone(),
                    path: created.path.clone(),
                    branch: created.branch.clone(),
                    agent: args.agent,
                    prompt: args.prompt,
                },
            )
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;

        Ok(Json(WorktreeSpawnResult {
            path: created.path,
            branch: created.branch,
            note: "A new agent pane is opening inside the worktree and will start on the \
                   prompt. Do not edit files under that path yourself. Dependencies are not \
                   installed there yet — the new agent handles setup."
                .into(),
        }))
    }

    #[tool(
        name = "worktree.list",
        description = "List all git worktrees of this workspace's repository (path, branch, HEAD, main flag)."
    )]
    pub async fn worktree_list(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
    ) -> Result<Json<WorktreeListResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let repo_root = self.worktree_ctx(&terminal)?;
        let home = self
            .app
            .path()
            .home_dir()
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
        let worktrees = tauri::async_runtime::spawn_blocking(move || {
            crate::git::list_worktrees(Path::new(&repo_root), &home)
        })
        .await
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?
        .map_err(|m| rmcp::ErrorData::internal_error(m, None))?;
        Ok(Json(WorktreeListResult { worktrees }))
    }

    #[tool(
        name = "worktree.remove",
        description = "Remove a swarmterm-created worktree after its branch is merged. Refuses if uncommitted changes remain or the path is not under <repo>.worktrees."
    )]
    pub async fn worktree_remove(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
        Parameters(args): Parameters<WorktreeRemoveArgs>,
    ) -> Result<Json<WorktreeRemoveResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let repo_root = self.worktree_ctx(&terminal)?;
        let path = args.path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            crate::git::remove_worktree(Path::new(&repo_root), Path::new(&path))
        })
        .await
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?
        .map_err(|m| rmcp::ErrorData::invalid_params(m, None))?;

        self.app
            .emit("worktree:removed", WorktreeRemovedEvent { path: args.path })
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
        Ok(Json(WorktreeRemoveResult { ok: true }))
    }
}
