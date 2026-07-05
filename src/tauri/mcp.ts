import { invoke } from '@tauri-apps/api/core'

/**
 * Write (or merge) `.mcp.json` in the workspace root so Claude Code
 * auto-discovers Swarmterm's MCP server. Silent on success; rejects with the
 * backend error string on failure (malformed existing file, IO error).
 */
export function writeMcpConfig(cwd: string): Promise<void> {
  return invoke<void>('write_mcp_config', { cwd })
}
