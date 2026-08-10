fn main() {
    // tauri_build embeds the bundle icons into the binary (they become the
    // default window icon, and on macOS the Dock icon in `tauri dev`, which
    // runs an unbundled executable). Cargo only reruns a build script when
    // something it was told to watch changes, and tauri_build does not declare
    // the icon directory — so regenerating icons alone leaves a stale icon
    // compiled in, with nothing in the build output to say so.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
