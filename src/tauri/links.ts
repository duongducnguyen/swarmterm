import { invoke } from '@tauri-apps/api/core'

/**
 * Typed bridge for terminal link resolution. Path validation and editor
 * launching have to happen in Rust — a webview has no filesystem and cannot
 * spawn a process — so every link click crosses this boundary.
 */

/** Canonical path, or null when the candidate names no existing regular file. */
export function resolvePathLink(cwd: string, candidate: string): Promise<string | null> {
  return invoke<string | null>('resolve_path_link', { cwd, candidate })
}

/** First allowlisted editor id found on PATH, or null. */
export function findAvailableEditor(candidates: readonly string[]): Promise<string | null> {
  return invoke<string | null>('find_available_editor', { candidates })
}

export function openInEditor(bin: string, args: string[]): Promise<void> {
  return invoke<void>('open_in_editor', { bin, args })
}

export function revealInFileManager(path: string): Promise<void> {
  return invoke<void>('reveal_in_file_manager', { path })
}
