//! MCP tool implementations. Adding a new tool group: create `<group>.rs`,
//! add `pub mod <group>;` here, add the tool method in `server.rs` (see the
//! next task) that delegates into it.

pub mod browser;
pub mod worktree;
