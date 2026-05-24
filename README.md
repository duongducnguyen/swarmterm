# Command Center — Tauri 2 + Rust

App desktop kiểu "command center" — bộ khung điều hướng + multi-terminal.
Port lại từ bản Electron gốc (`workspace/`) sang **Tauri 2 + Rust**, toàn bộ
tính năng iteration 1 được giữ nguyên.

## Tính năng

- **Navbar trái** — danh sách workspace: thêm / chuyển / đổi tên / đóng.
- **Multi-terminal** — mỗi workspace là một cây split nhị phân; split ngang/dọc
  bất kỳ pane, kéo chỉnh kích thước, đóng pane (cây tự gộp).
- **Terminal thật** — shell qua `portable-pty` Rust (ConPTY truecolor trên
  Windows; mặc định PowerShell). Truecolor 24-bit được truyền thẳng qua ConPTY
  và xterm.js hiển thị không downscale.
- **Setup wizard + folder picker** — tạo workspace với thư mục làm việc tuỳ
  chọn và lệnh khởi động từ template (native dialog qua `tauri-plugin-dialog`).
- **System tray** — đóng cửa sổ → ẩn xuống tray (app chạy ngầm, pty vẫn sống);
  tray → Show mở lại; tray → Quit tắt hẳn và kill mọi pty.
- **Single-instance** — mở app lần 2 chỉ focus cửa sổ cũ
  (`tauri-plugin-single-instance`).
- **Frameless window** — titlebar tự vẽ; kéo vùng titlebar di chuyển cửa sổ;
  minimize / maximize-restore / close-to-tray hoạt động qua Tauri window API.
- **Theme toggle** — chuyển sáng/tối, lưu vào `localStorage`, terminal đổi màu
  theo.

Không lưu trạng thái — mỗi lần mở app là 1 workspace + 1 terminal mặc định.

## Tech stack

Tauri 2 · Rust · `portable-pty` · `tauri-plugin-single-instance` ·
`tauri-plugin-dialog` · React 19 + TypeScript · Vite · Tailwind CSS ·
xterm.js · zustand · Vitest.

## Yêu cầu môi trường

- **Rust toolchain** — `rustup` + `cargo` (stable, 1.75+). Cài từ
  <https://rustup.rs>.
- **Node.js 18+** (đã kiểm thử trên v23) + npm 10+.
- **WebView2 Runtime** — trên Windows 10/11 thường đã có sẵn; nếu thiếu tải từ
  <https://developer.microsoft.com/microsoft-edge/webview2/>.
- **Tauri prerequisites** trên Windows: Microsoft C++ Build Tools (đi kèm
  Visual Studio 2022 hoặc cài riêng qua VS Build Tools Installer).

## Cài đặt & chạy

```bash
npm install                  # cài JS dependencies
npm run tauri dev            # chạy app ở chế độ dev (hot reload frontend + Rust)
```

## Scripts

| Lệnh | Mô tả |
|---|---|
| `npm run tauri dev` | Chạy app dev (Vite + hot reload frontend, Rust rebuild tự động). |
| `npm run tauri build` | Build production (bundle installer). |
| `npm run tauri build -- --no-bundle` | Build release binary, bỏ qua tạo installer (WiX/NSIS). |
| `npm run build` | Build frontend (Vite + tsc) vào `dist/` — không cần Rust. |
| `npm test` | Chạy unit test JS/TS (Vitest). |
| `npm run test:watch` | Unit test ở chế độ watch. |
| `cargo test` _(từ `src-tauri/`)_ | Chạy unit test Rust (pty helpers). |

## Cấu trúc thư mục

```
src/                          # Frontend React/TS (renderer)
  App.tsx                     # Bố cục gốc: TitleBar + Navbar + Workspace
  main.tsx                    # React entry point
  index.css                   # Tailwind + CSS variables (light/dark theme)
  tauri/
    terminal.ts               # Bridge: invoke create/write/resize/kill_terminal + Channel<PtyOut>
    window.ts                 # Bridge: minimize, toggleMaximize, close, show, onMaximizedChanged
    dialog.ts                 # Bridge: pickDirectory (native folder picker), getHomeDir
  components/
    TitleBar/                 # Frameless title bar; drag region, window controls
    Navbar/                   # Danh sách workspace (thêm/chuyển/đổi tên/đóng)
    WorkspaceTabs/            # Tabs chuyển workspace
    WorkspaceSetup/           # Setup wizard + template picker
    Workspace/                # Render cây layout (react-resizable-panels)
    TerminalPane/             # Bọc xterm.js; gắn vào bridge qua useTerminalSession
    ui/                       # Button, dropdown-menu (kiểu shadcn)
  hooks/
    useTerminalSession.ts     # Effect: spawn pty → stream PtyOut vào xterm, retry
  store/
    app-store.ts              # zustand store: workspaces + layout actions
    theme-store.ts            # zustand store: theme (light/dark) + localStorage
  lib/
    layout-tree.ts            # Hàm cây split thuần (TDD; 31 test)
    theme.ts                  # Helpers theme (9 test)
    templates.ts              # Template lệnh khởi động workspace
    utils.ts                  # cn() helper (clsx + tailwind-merge)

src-tauri/                    # Backend Rust
  src/
    lib.rs                    # Builder: plugins, AppState, setup hook, command handler
    main.rs                   # Entry point (gọi lib::run)
    pty.rs                    # PtyOut enum, AppState, spawn_terminal, read_loop, UTF-8 helpers
    commands.rs               # #[tauri::command]: create/write/resize/kill_terminal
    tray.rs                   # TrayIconBuilder, menu Show/Quit, runtime-generated icon
  Cargo.toml                  # portable-pty, tauri-plugin-single-instance, tauri-plugin-dialog, serde
  tauri.conf.json             # App config: frameless window, productName, identifier
  capabilities/default.json  # ACL: core:default + window/event/dialog permissions
```

## Kiến trúc

### PTY trong Rust (`portable-pty` + ConPTY)

- Mỗi terminal được spawn trong Rust bằng `portable_pty::native_pty_system()`
  (ConPTY trên Windows → truecolor 24-bit passthrough).
- `AppState` giữ `Mutex<HashMap<String, ManagedTerminal>>` — mỗi entry chứa
  `writer`, `master` (để resize), và `killer` (để kill từ thread lệnh).
- Đọc output chạy trong **thread riêng** (`read_loop`): buffer 64 KB, drain
  UTF-8 prefix hợp lệ bằng `take_valid_utf8` (giữ lại byte cuối bị cắt đôi
  để tránh mojibake với ký tự đa byte / box-drawing / emoji), sau đó gửi qua
  `Channel<PtyOut>`.

### Streaming qua `Channel<PtyOut>`

Kiểu enum:
```rust
pub enum PtyOut {
    Data(String),
    Exit { exit_code: i32 },
}
```
Mỗi terminal nhận một `Channel<PtyOut>` riêng được truyền qua `invoke` từ
renderer. Output được gửi theo từng read (không coalesce chủ ý — YAGNI); bản
`Exit` cuối dọn sạch entry trong `AppState`.

### Tray + Single-instance + Close-to-tray (Rust)

- **Single-instance:** `tauri-plugin-single-instance` — callback focus +
  unminimize + show cửa sổ chính.
- **Tray:** `TrayIconBuilder` với icon 16×16 RGBA dựng runtime (không cần file
  asset). Menu "Show Command Center" / "Quit" + left-click shows window.
- **Close-to-tray:** `on_window_event` chặn `CloseRequested`, gọi
  `api.prevent_close()` + `window.hide()` — trừ khi `AppState.quitting` đã
  được set (do tray → Quit).

### Bridge renderer ↔ backend

Renderer **không** dùng `window.api` hay bất kỳ shim nào. Tất cả giao tiếp
chạy qua ba module trong `src/tauri/`:
- `terminal.ts` — `invoke` + `Channel` cho các lệnh PTY.
- `window.ts` — `@tauri-apps/api/window` cho điều khiển cửa sổ.
- `dialog.ts` — `@tauri-apps/plugin-dialog` cho folder picker.

## Kiểm thử

### Unit test tự động

```bash
npm test                     # 68 tests JS/TS (layout-tree × 31, theme × 9, app-store × 28)
cd src-tauri && cargo test   # 5 tests Rust (default_shell, take_valid_utf8 × 4)
npx tsc --noEmit             # Kiểm tra kiểu toàn bộ frontend
```

### Smoke test thủ công

Sau `npm run tauri dev`:

- [ ] Mở app → 1 workspace + 1 terminal PowerShell; gõ lệnh có kết quả.
- [ ] Split pane ngang/dọc; kéo separator chỉnh kích thước; đóng pane → cây gộp.
- [ ] Thêm / chuyển / đổi tên / đóng workspace qua navbar trái.
- [ ] Setup wizard mở → chọn thư mục (native folder picker trả về đường dẫn);
      template tạo đúng lệnh khởi động; workspace tab hiện và chuyển được.
- [ ] Đóng cửa sổ → ẩn xuống tray (pty vẫn sống); tray → Show mở lại;
      tray → Quit tắt hẳn và kill mọi pty.
- [ ] Mở app lần 2 → chỉ focus cửa sổ cũ (single-instance).
- [ ] Titlebar tự vẽ hiển thị; kéo vùng titlebar di chuyển cửa sổ; kéo viền resize được.
- [ ] Nút minimize / maximize-restore hoạt động; icon nút maximize đổi đúng trạng thái.
- [ ] Nút close ẩn cửa sổ xuống tray (app không tắt).
- [ ] Toggle theme đổi cả giao diện lẫn màu nền terminal.
- [ ] Khởi động lại app → theme giữ đúng lựa chọn lần trước.
- [ ] **Truecolor:** chạy CLI 24-bit màu (ví dụ `claude` nếu đã cài) → màu
      hiển thị đúng, không bị downscale về 256-color.

## Giới hạn đã biết (iteration 1)

- Không lưu/khôi phục trạng thái giữa các lần mở app (đúng phạm vi).
- Khi reload renderer thủ công lúc dev, pty cũ vẫn chạy cho đến khi cửa sổ
  đóng (xterm reconnect chưa được implement).
- Code editor, file browser, kanban, AI agent, Settings là phạm vi của các
  iteration sau.
