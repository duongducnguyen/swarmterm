// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `swarmterm --statusline` is Claude Code's status line command: read its
    // JSON from stdin, print one line, exit. Handled here, before `run()`, so
    // the Tauri builder / single-instance plugin / tray / AppKit are never
    // initialised for what is a sub-second CLI invocation.
    //
    // The `windows_subsystem = "windows"` attribute above suppresses console
    // ALLOCATION; it does not detach inherited standard handles. Claude Code
    // spawns this with piped stdio, so the pipes arrive through STARTUPINFO and
    // GetStdHandle resolves them normally. ("GUI subsystem means no stdio" is
    // the intuitive-but-wrong read of that attribute.)
    if std::env::args().skip(1).any(|a| a == "--statusline") {
        swarmterm_lib::statusline::run_cli();
        return;
    }
    swarmterm_lib::run()
}
