//! MCP server: an in-process HTTP endpoint that in-terminal AI agents call to
//! drive Swarmterm (open a browser preview today; more tools later). See
//! docs/design-docs/specs/2026-07-04-swarmterm-mcp-server-design.md.

pub mod auth;
pub mod config;
pub mod tools;
