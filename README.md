# Swarmterm — Tauri 2 + Rust

App desktop kiểu "swarmterm" — bộ khung điều hướng + multi-terminal.
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
  minimize / maximize-restore / close-to-tray hoạt động qua Tauri window API
  (Windows/Linux; trên macOS dùng traffic lights native — titleBarStyle Overlay).
- **Theme toggle** — chuyển sáng/tối, lưu vào `localStorage`, terminal đổi màu
  theo.
- **Web browser preview** — cột thứ 3 hiển thị web preview của terminal đang
  được chọn: mỗi terminal có tối đa MỘT preview (kèm history back/forward
  riêng), click pane nào thấy preview của pane đó. Trigger từ trong terminal
  qua MCP: mỗi PTY có sẵn env `SWARMTERM_MCP_URL` + `SWARMTERM_SESSION`, và
  Swarmterm tự viết `.mcp.json` vào workspace khi tạo, nên Claude Code (hoặc
  bất kỳ MCP client nào) gọi tool `browser.open_preview(url)` là preview cập
  nhật — gọi lần nữa là điều hướng. Agent ở terminal nền cập nhật âm thầm,
  không cướp view. Iframe DOM docked + address bar, gõ URL tự do.
- **Isolate features in git worktrees** — composer có toggle "Isolate features
  in git worktrees"; bật thì mỗi pane agent được tạo sẵn trong worktree riêng
  (`<repo>.worktrees/<slug>`) kèm badge 🌿 ngay lập tức. MCP tool `worktree.spawn`
  vẫn dùng để quản đốc giao việc giữa phiên (delegate mid-session). MCP tool
  `worktree.remove` từ chối nếu worktree chứa file chưa commit; đóng workspace
  không xoá worktree.

- **War Room** — kéo pane vào tab War Room để các agent nhắn tin/tranh luận/giao
  việc cho nhau qua MCP; kéo ra để thu hồi quyền.

- **Link trong terminal** — URL bấm thẳng một cái là mở bằng trình duyệt mặc
  định của hệ điều hành (cột web-preview trong app dành riêng cho MCP
  `browser.open_preview`, tức trang do agent chủ động mở); đường dẫn file bấm
  Cmd/Ctrl+click là mở trong editor đúng dòng (`src/foo.ts:42:9`, kể cả dạng
  `src/foo.ts(42,9)` của tsc và `File "x.py", line 42` của Python). Hai gesture
  khác nhau là cố ý: mở URL gần như miễn phí, còn mở editor thì cướp focus khỏi
  app nên phải chủ đích. Đường dẫn không tồn tại thì không thành link (Rust
  validate trên FS trước). Nhận cả OSC 8 hyperlink mà Claude Code phát ra.
  **Không link nào mở bằng app mặc định của OS** — click nhầm file `.sh`/`.exe`
  không bao giờ chạy nó.

Không lưu trạng thái — mỗi lần mở app là 1 workspace + 1 terminal mặc định.

## Tech stack

Tauri 2 (tính năng `unstable` multiwebview) · Rust · `portable-pty` ·
`tauri-plugin-single-instance` · `tauri-plugin-dialog` ·
`tauri-plugin-deep-link` · `url` · React 19 + TypeScript · Vite ·
Tailwind CSS · xterm.js · zustand · Vitest.

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
    deeplink.ts               # Bridge nghe event preview:open từ backend deep link
    preview.ts                # Bridge điều khiển webview preview docked
  components/
    TitleBar/                 # Frameless title bar; drag region, window controls
    Navbar/                   # Danh sách workspace (thêm/chuyển/đổi tên/đóng)
    WorkspaceTabs/            # Tabs chuyển workspace
    WorkspaceSetup/           # Setup wizard + template picker
    Workspace/                # Render cây layout (react-resizable-panels)
    TerminalPane/             # Bọc xterm.js; gắn vào bridge qua useTerminalSession
    Browser/                  # BrowserColumn, AddressBar (web preview)
    ui/                       # Button, dropdown-menu (kiểu shadcn)
  hooks/
    useTerminalSession.ts     # Effect: spawn pty → stream PtyOut vào xterm, retry
  store/
    app-store.ts              # zustand store: workspaces + layout actions
    theme-store.ts            # zustand store: theme (light/dark) + localStorage
    browser-store.ts          # zustand store: preview theo terminal (web preview)
  lib/
    layout-tree.ts            # Hàm cây split thuần (TDD; 37 test)
    theme.ts                  # Helpers theme (9 test)
    templates.ts              # Template lệnh khởi động workspace
    utils.ts                  # cn() helper (clsx + tailwind-merge)
    web-url.ts                # Chuẩn hoá/validate URL address bar (6 test)

src-tauri/                    # Backend Rust
  src/
    lib.rs                    # Builder: plugins, AppState, setup hook, command handler
    main.rs                   # Entry point (gọi lib::run)
    pty.rs                    # PtyOut enum, AppState, spawn_terminal, read_loop, UTF-8 helpers
    commands.rs               # #[tauri::command]: create/write/resize/kill_terminal
    tray.rs                   # TrayIconBuilder, menu Show/Quit, runtime-generated icon
    deeplink.rs               # Parse/validate deep link swarmterm://auth/callback (OAuth PKCE)
    mcp/                      # Embedded MCP server (browser.open_preview tool + framework)
    preview.rs                # #[tauri::command]: điều khiển webview preview docked
  Cargo.toml                  # portable-pty, tauri-plugin-single-instance, tauri-plugin-dialog,
                              #   tauri-plugin-deep-link, rmcp, axum, tokio, url, serde
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
  asset). Menu "Show Swarmterm" / "Quit" + left-click shows window.
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
npm test                     # 118 tests JS/TS (layout-tree × 37, theme × 9, app-store × 32,
                             #   browser-store × 5, web-url × 6, + các test khác)
cd src-tauri && cargo test   # 18 tests Rust (pty helpers, shell, deeplink)
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
- [ ] Link — URL: `echo https://example.com` → hover thấy gạch chân + con trỏ
      pointer; **bấm thường** một cái → trang mở ở trình duyệt mặc định của OS,
      cột web-preview trong app KHÔNG bật lên.
- [ ] Link — bôi đen: kéo chuột qua URL đó → chọn được text, trình duyệt KHÔNG mở.
- [ ] Link — path tuyệt đối: `ls $PWD/package.json` → bấm thường không có gì xảy
      ra; Cmd/Ctrl+click → file mở trong editor.
- [ ] Link — path tương đối + dòng: `echo "src/lib/terminal-links.ts:15:1"` →
      Cmd/Ctrl+click mở editor đúng dòng 15. Rồi `cd src`, `echo
      "lib/terminal-links.ts:15"` → vẫn resolve được (bash, hoặc zsh trên macOS;
      PowerShell thì không — xem Giới hạn đã biết).
- [ ] Link — path không tồn tại: `echo "src/lib/does-not-exist.ts:9"` → hover
      KHÔNG gạch chân, click không làm gì.
- [ ] Link — OSC 8 từ agent: chạy `claude` trong pane, bảo nó đọc một file để nó
      in đường dẫn ra → Cmd/Ctrl+click mở đúng file đó.
- [ ] Titlebar tự vẽ hiển thị; kéo vùng titlebar di chuyển cửa sổ; kéo viền resize được
      (Windows/Linux; trên macOS dùng traffic lights native — titleBarStyle Overlay).
- [ ] Nút minimize / maximize-restore hoạt động; icon nút maximize đổi đúng trạng thái
      (Windows/Linux only).
- [ ] Nút close ẩn cửa sổ xuống tray (app không tắt) (Windows/Linux only).
- [ ] Toggle theme đổi cả giao diện lẫn màu nền terminal.
- [ ] Khởi động lại app → theme giữ đúng lựa chọn lần trước.
- [ ] **Truecolor:** chạy CLI 24-bit màu (ví dụ `claude` nếu đã cài) → màu
      hiển thị đúng, không bị downscale về 256-color.
- [ ] **Worktree isolation:** Composer toggle "Isolate features in git worktrees"
      bị vô hiệu hoá trên folder không phải repo git; bật được trên repo thật.
      Bật toggle + tạo workspace với 3 pane Claude → 3 thư mục worktree tồn tại
      cạnh repo (badge 🌿 hiện ngay, không cần gõ prompt). Broadcast 1 prompt
      sang 3 pane → 3 diff riêng biệt, sạch trên 3 nhánh trong Git tab.
      `worktree.remove` từ chối nếu worktree chứa file chưa commit; commit rồi
      thử lại → thư mục xoá. Tạo workspace với toggle OFF, gọi `worktree.spawn` →
      lỗi "worktree isolation is not enabled".
- [ ] **Preview theo terminal:** 2 pane, mỗi pane bảo agent mở một URL khác
      nhau qua `browser.open_preview` → click qua lại giữa 2 pane thấy trang
      đổi đúng theo pane. Agent ở pane KHÔNG focus gọi tool → view hiện tại
      không bị cướp. Pane chưa có preview → empty state, gõ URL vào address
      bar tạo preview cho đúng pane. Agent gọi tool lần 2 → điều hướng,
      back/forward hoạt động, không sinh thêm gì.
- [ ] **War Room:** Kéo 2 pane agent vào tab War Room → chip thành viên hiện, intro được gõ vào từng pane.
- [ ] **War Room — probe:** Agent A gửi probe → transcript hiện tin, agent B (đang idle) nhận nudge và đọc inbox.
- [ ] **War Room — execute:** Agent A gửi execute → prompt chạy trong pane B, transcript đánh dấu màu cam.
- [ ] **War Room — revocation:** Kéo chip ra / bấm ✕ → tool call tiếp theo từ pane đó bị từ chối "not in the War Room".
- [ ] **War Room — PTY death:** Đóng pane thành viên → transcript ghi rời phòng, list_peers không còn ghost.

## Giới hạn đã biết (iteration 1)

- Không lưu/khôi phục trạng thái giữa các lần mở app (đúng phạm vi).
- **Link trong terminal**: PowerShell không có hook môi trường để inject OSC 7,
  nên path *tương đối* hết resolve sau khi `cd` (path tuyệt đối — gồm mọi thứ
  Claude Code in ra — vẫn chạy). Tên file trần không có dấu `/` (`foo.ts:42`)
  không thành link; phải có separator (`src/foo.ts:42`) — đây là biện pháp
  chính chống false positive. Ký tự rộng (CJK) cùng dòng với path có thể làm
  lệch vị trí gạch chân vài ô. Commit hash / số issue chưa được linkify.
- Khi reload renderer thủ công lúc dev, pty cũ vẫn chạy cho đến khi cửa sổ
  đóng (xterm reconnect chưa được implement).
- Code editor, file browser, kanban, AI agent, Settings là phạm vi của các
  iteration sau.
- Web browser preview đã có (một preview mỗi terminal, bám focus); lưu/khôi
  phục preview giữa các lần mở app chưa được implement.
