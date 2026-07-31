<div align="center">

<!-- ẢNH: thay bằng docs/images/logo.png (256×256) — xem docs/images/README.md -->
<img src="https://placehold.co/128x128/1e1e1e/6b7280/png?text=LOGO" alt="Swarmterm" width="96" height="96">

# Swarmterm

**Một cửa sổ terminal cho cả bầy AI coding agent.**
Nhiều workspace · split pane thật · mỗi agent một git worktree · preview web ngay cạnh pane · và một War Room để các agent nói chuyện với nhau.

[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-CE422B?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-644%20JS%20%2B%20147%20Rust-4ec994)](#kiểm-thử)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6b7280)](#yêu-cầu-môi-trường)
[![Status](https://img.shields.io/badge/status-pre--1.0-f97316)](#giới-hạn-đã-biết--roadmap)

<!-- ẢNH: thay bằng docs/images/hero.png (1600×900) -->
<img src="https://placehold.co/1600x900/1e1e1e/6b7280/png?text=Hero+screenshot" alt="Toàn cảnh Swarmterm" width="100%">

</div>

---

## Mục lục

- [Swarmterm giải quyết vấn đề gì](#swarmterm-giải-quyết-vấn-đề-gì)
- [Ảnh màn hình](#ảnh-màn-hình)
- [Tính năng](#tính-năng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt & chạy](#cài-đặt--chạy)
- [MCP server & tool](#mcp-server--tool)
- [Phím tắt](#phím-tắt)
- [Kiến trúc](#kiến-trúc)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Kiểm thử](#kiểm-thử)
- [Giới hạn đã biết & roadmap](#giới-hạn-đã-biết--roadmap)
- [Đóng góp](#đóng-góp)

---

## Swarmterm giải quyết vấn đề gì

Chạy **một** AI coding agent trong terminal thì terminal nào cũng làm được. Chạy **năm** agent song song mới là chỗ mọi thứ vỡ:

| Vấn đề khi chạy nhiều agent | Cách Swarmterm giải quyết |
|---|---|
| Mỗi agent một cửa sổ/tab terminal → lạc mất pane nào đang chạy gì, alt-tab liên tục. | **Workspace + cây split thật**: mỗi workspace là một cây split nhị phân của pane thật, có navbar trái, tab workspace, danh sách terminal và **chấm hoạt động** báo pane nào đang stream output. |
| Nhiều agent cùng sửa một checkout → giẫm chân nhau, diff trộn lẫn, không rollback nổi. | **Worktree-per-agent**: bật một toggle lúc tạo workspace là mỗi pane agent được sinh sẵn trong git worktree riêng (`<repo>.worktrees/<slug>`, nhánh `swarm/<agent>-<n>`). Diff tách bạch từ giây đầu tiên. |
| Agent in ra `http://localhost:5173` → phải copy sang browser, mất ngữ cảnh. | **Cột web preview** ngay cạnh pane. Agent gọi MCP tool `browser.open_preview(url)` là trang hiện lên đúng pane đó — mỗi terminal có preview riêng, click pane nào thấy trang của pane đó. |
| Agent A và agent B không nói chuyện được — con người phải làm cầu nối copy-paste. | **War Room**: kéo pane vào panel là agent nối vào một phòng chung, nhắn tin / tranh luận / bàn giao task cho nhau qua MCP. Nhiều phòng độc lập, và bạn có một ghế **Moderator** để chen vào. |
| Gửi cùng một prompt cho N agent = paste N lần. | **Broadcast input**: chọn nhóm pane bằng `Alt + Click`, gõ một lần, mọi pane trong nhóm cùng nhận. |
| Không biết agent nào đang bận, nào đang chờ mình. | Chấm hoạt động theo pane, icon agent trên header, tiêu đề pane bám theo tiến trình đang chạy, và badge số tin đang chờ gửi của War Room. |
| Agent lỡ tay xoá worktree / chạy nhầm file khi bấm link. | Rào chắn cứng: `worktree.remove` **từ chối** worktree còn thay đổi chưa commit hoặc nằm ngoài `<repo>.worktrees`; **không link nào trong terminal được mở bằng app mặc định của OS** — bấm nhầm `.sh`/`.exe` không bao giờ chạy nó. |

Swarmterm là app desktop **Tauri 2 + Rust** (không phải Electron), terminal thật chạy qua `portable-pty`, giao diện bám sát VS Code.

---

## Ảnh màn hình

> Ảnh dưới đây đang là **placeholder**. Xem [`docs/images/README.md`](docs/images/README.md) để biết tên file + kích thước cần upload; thay `src` của từng thẻ `<img>` bằng đường dẫn tương ứng là xong.

<table>
<tr>
<td width="50%">

<!-- ẢNH: docs/images/composer.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Workspace+composer" alt="Workspace composer" width="100%">

**Composer** — chọn thư mục, số pane, phân bổ agent, bật cách ly worktree, xem trước layout rồi `⌘/Ctrl + Enter`.

</td>
<td width="50%">

<!-- ẢNH: docs/images/split-panes.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Split+panes+%2B+broadcast" alt="Split pane và broadcast" width="100%">

**Split pane + broadcast** — cây split nhị phân, kéo đổi chỗ pane, gõ một lần cho cả nhóm.

</td>
</tr>
<tr>
<td width="50%">

<!-- ẢNH: docs/images/war-room.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=War+Room" alt="War Room" width="100%">

**War Room** — nhiều phòng, transcript, danh sách thành viên, composer của Moderator.

</td>
<td width="50%">

<!-- ẢNH: docs/images/git-worktrees.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Git+%2B+worktrees" alt="Git panel và worktree" width="100%">

**Git panel** — worktree của từng agent, file đã đổi, diff inline có số dòng.

</td>
</tr>
<tr>
<td width="50%">

<!-- ẢNH: docs/images/web-preview.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Web+preview" alt="Web preview" width="100%">

**Web preview** — agent tự mở trang qua MCP, mỗi pane một preview + history riêng.

</td>
<td width="50%">

<!-- ẢNH: docs/images/settings.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Settings" alt="Settings" width="100%">

**Settings** — Appearance, Terminal (font/ligature/shell), Keyboard Shortcuts, Account.

</td>
</tr>
</table>

---

## Tính năng

### Workspace & layout

- **Navbar trái** — danh sách workspace: tạo / chuyển / đổi tên / đóng / kéo sắp xếp lại; kèm danh sách terminal của workspace đang mở (click là nhảy tới pane) và nhãn phiên bản app.
- **Composer tạo workspace** — chọn thư mục làm việc (native folder picker) hoặc chọn lại từ **recent folders**, đặt số terminal, phân bổ số lượng cho từng agent bằng stepper, xem **live layout preview**, bật/tắt cách ly worktree, tạo bằng nút hoặc `⌘/Ctrl + Enter`.
- **Cây split nhị phân** — split ngang/dọc bất kỳ pane, kéo separator chỉnh kích thước, đóng pane thì cây tự gộp; **kéo header pane để đổi chỗ hai pane**.
- **Tab workspace** — chuyển nhanh, kéo sắp xếp, đóng.
- **Ẩn/hiện sidebar** bằng `⌘/Ctrl + B`.

### Terminal engine

- **PTY thật trong Rust** — `portable-pty` (ConPTY trên Windows), không phải shell giả lập.
- **Truecolor 24-bit** đi thẳng từ shell tới xterm.js, không downscale; render bằng WebGL addon.
- **UTF-8 an toàn theo chunk** — ký tự đa byte bị cắt đôi giữa hai lần đọc được đệm lại, không mojibake với emoji / box-drawing / tiếng Việt.
- **Chọn shell theo pane** — backend dò shell có thật trên máy (PowerShell / cmd / pwsh / Git Bash trên Windows; zsh / bash / fish… trên macOS–Linux) và đổi được từng pane.
- **Copy/paste kiểu VS Code** — `Ctrl+C` chỉ copy khi đang có vùng chọn, còn lại vẫn là SIGINT; `Ctrl/⌘+V` luôn paste (không double-paste).
- **Nhập tiếng Việt / IME** — lớp `terminal-input-client` đối chiếu textarea ẩn với những gì đã ghi vào pty theo **grapheme**, nên Telex/Unikey và IME đa ký tự không mất hay nhân đôi chữ.
- **Kéo file vào pane** — thả file/thư mục vào terminal là đường dẫn được chèn vào dòng lệnh, escape đúng theo shell của pane.
- **Link trong terminal** — click **thường** vào URL → mở trình duyệt mặc định của OS; `⌘/Ctrl + click` vào đường dẫn file → mở đúng dòng trong editor (`src/foo.ts:42:9`, kể cả dạng `src/foo.ts(42,9)` của tsc và `File "x.py", line 42` của Python). Đường dẫn không tồn tại thì không thành link (Rust kiểm tra trên filesystem trước). Nhận cả OSC 8 hyperlink. **Không link nào chạy bằng app mặc định của OS.**
- **Tiêu đề pane thông minh** — header hiện agent/lệnh đang chạy, tự rút gọn theo bề rộng pane.
- **Chấm hoạt động** — pane sáng đèn khi pty đang stream output, tắt sau khi im lặng.
- **Registry ngoài React** — instance xterm sống ngoài cây render, nên re-parent pane (gộp cây khi đóng split) **không giết shell**.

### Điều phối nhiều agent

- **Nhận diện agent CLI** — backend probe `claude` / `codex` / `opencode` trong `$PATH` (và các thư mục bin phổ biến); CLI chưa cài thì bị disable trong composer, cài xong mở lại composer là thấy ngay, không cần restart app.
- **Broadcast input** — `⌘/Ctrl + Shift + B` bật chế độ broadcast, `Alt + Click` thêm/bớt pane khỏi nhóm, `Esc` thoát; banner hiển thị nhóm đang nhận.
- **Worktree-per-agent** — toggle *"Isolate features in git worktrees"* trong composer: mỗi pane agent sinh ra **bên trong** worktree riêng trên nhánh `swarm/<agent>-<n>` (pane Terminal thường vẫn ở gốc repo). Folder chưa phải repo git sẽ được `git init` + commit đầu tiên tự động. Tạo worktree thất bại thì pane rơi về gốc repo chứ không chặn việc tạo workspace.
- **Git panel** — chọn worktree (kèm agent đang giữ nhánh nào), danh sách file thay đổi, diff inline có số dòng, số commit chưa merge; theo dõi thư mục làm việc của pane đang focus.
- **Dọn worktree** — context menu *Clear worktree* với xác nhận; đóng pane/workspace **không bao giờ** xoá worktree.

### War Room — các agent nói chuyện với nhau

- **Kéo là vào phòng** — kéo header pane thả vào panel là pane đó gia nhập phòng; kéo chip thành viên ra (hoặc bấm ✕) là thu hồi quyền ngay lập tức.
- **Nhiều phòng** — dải tab phòng: `+` tạo phòng, double-click đổi tên inline, ✕ xoá (xác nhận 2 bước, phòng cuối cùng không xoá được). Một pane chỉ ở trong tối đa **một** phòng; kéo sang tab phòng khác là chuyển phòng. Transcript, danh sách thành viên và Moderator tách riêng theo từng phòng.
- **Hai chế độ gửi** — `probe` (vào inbox của peer, peer được nhắc đọc) và `execute` (paste + chạy hẳn prompt trong pane của peer). `execute` bị backend từ chối nếu đích là pane shell thường.
- **Ghế Moderator** — bạn cũng là một thành viên: gõ thẳng vào transcript, gửi cho một agent hoặc broadcast cả phòng; agent trả lời về `__moderator__` thì tin hiện trong tab Discussion chứ không gõ vào pane nào.
- **Không phá ngang người đang gõ** — tin nhắn chỉ được gõ vào pane khi pane đó thật sự rảnh: đang có dòng lệnh gõ dở hoặc vừa gõ xong thì hàng đợi được **giữ lại** (pill trong pane + badge `⏸N` trên tab phòng), tự thử lại, và có nút *Deliver now*. Không bao giờ vứt tin đi.
- **Tự dọn** — pane chết là tự rời phòng, `list_peers` không còn thành viên ma.

### Web preview

- Cột preview docked kèm address bar, back/forward — **mỗi terminal một preview riêng**, click pane nào thấy trang của pane đó; agent ở pane không focus cập nhật ngầm, không cướp view.
- Trigger từ trong terminal qua MCP tool `browser.open_preview(url)`; gọi lại lần nữa là điều hướng chứ không sinh thêm preview.

### Vỏ app & tiện ích

- **Cửa sổ frameless** kiểu VS Code — titlebar tự vẽ, kéo di chuyển, minimize/maximize/close (macOS dùng traffic lights native), theo dõi trạng thái fullscreen.
- **System tray** — đóng cửa sổ là ẩn xuống tray, pty vẫn sống; tray → *Show* để mở lại, tray → *Quit* mới thật sự tắt và kill toàn bộ pty.
- **Single instance** — mở app lần hai chỉ focus lại cửa sổ cũ.
- **Teardown sạch trên Windows** — shell được nhốt trong **Job Object** kill-on-close, đóng pane là chết cả cây tiến trình con/cháu.
- **Settings** — Appearance (style *VS Code Dark Modern*), Terminal (font, cỡ chữ, line-height, ligature, shell mặc định, có preview trực tiếp), Keyboard Shortcuts, Account.
- **Account** — đăng nhập OAuth (Google/GitHub) qua Supabase với PKCE, callback về deeplink `swarmterm://auth/callback`, phiên lưu trong keychain của hệ điều hành.

> **Không lưu trạng thái giữa các lần mở app** — đây là chủ ý: mỗi lần khởi động là một khởi đầu sạch (Welcome → workspace).

---

## Bắt đầu nhanh

1. `npm install && npm run tauri dev`.
2. Ở màn hình Welcome: chọn thư mục dự án → đặt **4 terminal** → phân bổ **3 Claude Code** (pane còn lại là shell thường) → bật **Isolate features in git worktrees** → `⌘/Ctrl + Enter`.
3. Ba pane agent khởi động sẵn trong ba worktree riêng (badge 🌿 trên header). Bật **Git** ở panel phải để thấy ba nhánh tách bạch.
4. `⌘/Ctrl + Shift + B` → `Alt + Click` chọn ba pane agent → gõ một prompt chung cho cả ba.
5. Kéo hai pane vào tab **War Room** → bảo một agent `war_room.send` cho peer để chúng tự chốt hợp đồng API với nhau, rồi bàn giao task bằng `mode: "execute"`.
6. Bảo agent chạy dev server và gọi `browser.open_preview` → trang hiện ngay ở cột **Preview** cạnh pane đó.

Kịch bản demo chi tiết (Claude Code × Codex tranh luận một API contract): [`docs/war-room-demo.md`](docs/war-room-demo.md).

---

## Yêu cầu môi trường

| Thành phần | Yêu cầu |
|---|---|
| **Node.js** | 18+ (đã chạy trên v23) + npm 10+ |
| **Rust** | toolchain stable qua [rustup](https://rustup.rs) (1.75+) |
| **Windows** | [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Win 10/11 thường có sẵn) + Microsoft C++ Build Tools (VS 2022 hoặc VS Build Tools) |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | `webkit2gtk-4.1`, `librsvg`, `libayatana-appindicator3`, `build-essential` — xem [Tauri prerequisites](https://tauri.app/start/prerequisites/) |
| **Tuỳ chọn** | CLI của agent: `claude`, `codex`, `opencode` (thiếu cái nào thì cái đó bị disable trong composer) |

---

## Cài đặt & chạy

```bash
npm install                          # cài JS dependencies
npm run tauri dev                    # chạy app (Vite HMR + Rust auto-rebuild)
npm run tauri build                  # bundle production (installer)
npm run tauri build -- --no-bundle   # chỉ binary release, bỏ qua installer
```

### Scripts

| Lệnh | Mô tả |
|---|---|
| `npm run tauri dev` | Chạy app ở chế độ dev. |
| `npm run tauri build` | Build production + installer. |
| `npm run build` | Build frontend (`tsc && vite build`) vào `dist/` — không cần Rust. |
| `npm test` | Unit test JS/TS (Vitest, chạy một lần). |
| `npm run test:watch` | Vitest ở chế độ watch. |
| `npx tsc --noEmit` | Type-check toàn bộ frontend (strict). |
| `cargo test` *(trong `src-tauri/`)* | Unit test Rust. |

---

## MCP server & tool

Khi khởi động, tiến trình Rust bind một cổng loopback ngẫu nhiên và chạy một **MCP server (Streamable HTTP)**. Mỗi PTY được spawn kèm:

```
SWARMTERM_MCP_URL=http://127.0.0.1:<port>/mcp
SWARMTERM_SESSION=<terminalId>
```

`SWARMTERM_SESSION` vừa là danh tính vừa là **bearer token** của pane: nó chỉ tồn tại trong env của terminal đó và hết hiệu lực ngay khi pty bị kill. Nhờ vậy mỗi tool call luôn biết **pane nào** gọi — đó là cách preview bám đúng pane và War Room biết ai đang nói. Cấu hình MCP được ghi cho agent **tự động mỗi lần boot**, ghi kiểu merge + rename nguyên tử nên không bao giờ làm hỏng file có sẵn: Claude Code ở user scope `~/.claude.json` (mọi thư mục và mọi worktree đều thấy server, không cần `.mcp.json` riêng cho từng project), Codex ở `~/.codex/config.toml`.

| Tool | Dùng để | Ghi chú |
|---|---|---|
| `browser.open_preview` | Mở/điều hướng trang trong cột preview của chính pane gọi. | Gọi lại = điều hướng, không sinh thêm preview. |
| `worktree.spawn` | Tạo worktree mới + mở pane agent chạy trong đó (giao việc giữa phiên). | Chỉ hoạt động khi workspace bật worktree mode. |
| `worktree.list` | Liệt kê worktree của repo (path, branch, HEAD, main). | |
| `worktree.remove` | Xoá worktree sau khi nhánh đã merge. | **Từ chối** nếu còn thay đổi chưa commit hoặc path nằm ngoài `<repo>.worktrees`. |
| `war_room.list_peers` | Xem ai đang ở cùng phòng (tên, loại agent, thư mục). | Chỉ chạy khi pane đã được kéo vào phòng. |
| `war_room.send` | Gửi cho peer: `probe` (vào inbox + nhắc đọc) hoặc `execute` (paste & chạy prompt). | Bỏ `to` = broadcast probe cả phòng. |
| `war_room.read_inbox` | Đọc & xoá tin đang chờ của mình. | Gọi khi được nhắc. |

Thêm tool mới: tạo file trong `src-tauri/src/mcp/tools/` + một dòng `mod`. Spec: [`docs/design-docs/specs/2026-07-04-swarmterm-mcp-server-design.md`](docs/design-docs/specs/2026-07-04-swarmterm-mcp-server-design.md).

---

## Phím tắt

| Phím | Hành động |
|---|---|
| `⌘/Ctrl + B` | Ẩn/hiện sidebar |
| `⌘/Ctrl + Shift + B` | Bật/tắt broadcast input |
| `Alt + Click` | Thêm/bớt pane khỏi nhóm broadcast |
| `Esc` | Thoát broadcast / đóng Settings |
| `⌘/Ctrl + Enter` | Tạo workspace từ composer |
| `⌘/Ctrl + C` · `⌘/Ctrl + V` | Copy (khi có vùng chọn) · Paste |
| `⌘/Ctrl + Click` | Mở đường dẫn file trong editor, đúng dòng |

> Trên macOS dùng `⌘` để `Ctrl + B` vẫn thuộc về terminal (prefix của tmux).

---

## Kiến trúc

```
┌─ Renderer (src/) ──────────────┐         ┌─ Backend (src-tauri/src/) ──┐
│ components/  React UI           │         │ lib.rs      builder/plugins │
│ store/       zustand state      │ invoke  │ commands.rs #[command] fns  │
│ lib/         logic thuần (TDD)  │ ──────► │ pty.rs      spawn + reader  │
│ tauri/       cầu IPC ───────────┼─────────┤ shell.rs    dò shell        │
│                                 │ Channel │ warroom.rs  phòng + inbox   │
│                                 │ ◄────── │ mcp/        MCP server+tool │
└─────────────────────────────────┘  PtyOut └─────────────────────────────┘
```

**Nguyên tắc chia lớp**

- `src/tauri/*` là **bề mặt IPC duy nhất** — không có shim `window.api`, component không bao giờ gọi thẳng `invoke`.
- `#[tauri::command]` nằm gọn trong `commands.rs`, uỷ quyền xuống module (`pty.rs`, `shell.rs`, `git.rs`, `warroom.rs`); đăng ký trong `invoke_handler!` ở `lib.rs`.
- `src/lib/` là logic thuần, không DOM/framework, mỗi file có `*.test.ts` bên cạnh — đây là chỗ chứa quy tắc nghiệp vụ.
- `src/store/` là zustand: state + action; biến đổi thuần thì gọi xuống `lib/`.
- `src/lib/terminal-registry.ts` giữ instance xterm **ngoài** cây React, key theo `terminalId`.

**Streaming PTY** — mỗi terminal có một `Channel<PtyOut>` riêng; thread đọc trong Rust decode output rồi bắn `Data`, kết thúc bằng đúng một `Exit`:

```rust
pub enum PtyOut {
    Data(String),
    Exit { exit_code: i32 },
}
```

**Vài quyết định không hiển nhiên** (chi tiết trong [`CLAUDE.md`](CLAUDE.md)): thứ tự teardown khi respawn cùng `terminalId`; Job Object trên Windows; đệm UTF-8 qua ranh giới chunk; trả focus về terminal sau khi click vào chrome (dnd-kit gắn `tabIndex` lên node kéo-thả); `prevent_close()` cho close-to-tray.

Toàn bộ tính năng đều đi qua trình tự **spec → plan → TDD**; hồ sơ thiết kế nằm trong [`docs/design-docs/specs/`](docs/design-docs/specs/) và là nguồn giải thích *vì sao* tốt nhất.

---

## Cấu trúc thư mục

```
src/                              # Frontend React 19 + TypeScript
  App.tsx                         # Bố cục gốc: TitleBar + Navbar + Workspace + RightPanel
  components/
    TitleBar/  Navbar/  WorkspaceTabs/     # Vỏ app (frameless titlebar, sidebar, tab)
    Welcome/                                # Composer tạo workspace + layout preview
    Workspace/  TerminalPane/               # Cây split, pane, header, pill giữ tin
    Browser/                                # Cột web preview + address bar
    Git/                                    # Worktree selector, file thay đổi, diff inline
    WarRoom/                                # Tab phòng, transcript, thành viên, composer
    RightPanel/                             # Chuyển tab Preview / Git / War Room
    Settings/                               # Appearance, Terminal, Shortcuts, Account
    Account/  ui/                           # Login modal; primitive kiểu shadcn
  lib/                            # Logic thuần + test (layout-tree, war-room-*, terminal-*, git-diff…)
  store/                          # zustand: app, git, browser, war-room, appearance, activity…
  tauri/                          # Cầu IPC: terminal, window, dialog, git, warroom, worktree…

src-tauri/                        # Backend Rust
  src/
    lib.rs  main.rs               # Builder, plugin, AppState, đăng ký command
    commands.rs                   # #[tauri::command]
    pty.rs                        # Spawn pty, read loop, Job Object, helper UTF-8
    shell.rs  agents.rs           # Dò shell & agent CLI có trên máy
    git.rs                        # worktree, file thay đổi, diff
    warroom.rs                    # Registry phòng, thành viên, inbox
    mcp/                          # MCP server + tools/{browser,worktree,warroom}.rs
    tray.rs  deeplink.rs  auth.rs # Tray, swarmterm://, phiên đăng nhập
  tauri.conf.json                 # Cửa sổ frameless, bundle, deep-link scheme

docs/
  images/                         # Ảnh cho README (xem docs/images/README.md)
  manual-smoke-tests.md           # Checklist smoke test thủ công
  war-room-demo.md                # Kịch bản demo War Room
  design-docs/specs/              # Hồ sơ thiết kế từng tính năng
```

---

## Kiểm thử

```bash
npm test                     # 644 test JS/TS trong 53 file (Vitest)
npx tsc --noEmit             # Type-check strict toàn frontend
cd src-tauri && cargo test   # 147 test Rust
```

*(Số liệu chạy ngày 2026-07-31 trên nhánh `main`.)*

Checklist smoke test thủ công — chạy trước mỗi lần release: [`docs/manual-smoke-tests.md`](docs/manual-smoke-tests.md).

---

## Giới hạn đã biết & roadmap

**Giới hạn hiện tại**

- **Không persistence.** Layout, workspace và preview không được lưu giữa các lần mở app (chủ ý ở giai đoạn này).
- **Link tương đối trên PowerShell.** PowerShell không có hook để inject OSC 7 nên đường dẫn *tương đối* hết resolve sau khi `cd` (đường dẫn tuyệt đối — gồm mọi thứ Claude Code in ra — vẫn chạy). Tên file trần không có separator (`foo.ts:42`) cố tình không thành link để tránh false positive. Ký tự rộng (CJK) cùng dòng có thể làm lệch vị trí gạch chân vài ô; commit hash / số issue chưa được linkify.
- **Membership War Room không sống qua respawn.** Đổi agent/shell/cwd của pane (respawn cùng id) là pane rời phòng — kéo lại vào.
- **Reload renderer thủ công lúc dev** để lại pty cũ chạy tới khi đóng cửa sổ (chưa có reconnect xterm).
- **Một style giao diện.** Hiện chỉ có *VS Code Dark Modern*; theme sáng và style khác nằm trong hàng đợi.
- **Kiểm thử đa nền tảng.** Phát triển chính trên Windows và macOS; đường Linux đã được gate `#[cfg]`/runtime nhưng chưa được smoke-test rộng.

**Đang cân nhắc**

- Lưu/khôi phục workspace + preview giữa các phiên.
- Theme sáng và bộ style bổ sung.
- Tìm kiếm trong terminal (`@xterm/addon-search` đã có sẵn trong dependency).
- Transcript War Room xuất ra file; lịch sử phòng lâu dài.

---

## Đóng góp

- Đọc [`CLAUDE.md`](CLAUDE.md) trước — nó ghi ranh giới module và các gotcha đã trả giá để biết.
- Tính năng mới đi theo trình tự: spec trong `docs/design-docs/specs/` → plan trong `docs/design-docs/plans/` → TDD.
- Logic thuần vào `src/lib/` kèm `*.test.ts`; component giữ mỏng.
- **Trước khi báo xong:** chạy `npm test`, `npx tsc --noEmit`, và `cargo test` nếu có đụng `src-tauri/`.

---

<details>
<summary><b>English TL;DR</b></summary>

**Swarmterm** is a desktop multi-terminal built for running a *swarm* of AI coding agents: a workspace navbar, real split panes backed by `portable-pty`, one git worktree per agent so parallel work never collides, a per-pane web preview column, and a **War Room** where agents talk to each other over an embedded MCP server (`browser.open_preview`, `worktree.*`, `war_room.*`). Built on Tauri 2 + Rust with a React 19 + TypeScript frontend. See the sections above (Vietnamese) for features, setup, MCP tools, and architecture.

</details>
