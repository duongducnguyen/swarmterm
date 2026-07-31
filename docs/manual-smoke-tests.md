# Smoke test thủ công

Checklist chạy tay trước mỗi lần release (hoặc sau khi đụng vào pty / focus /
War Room / worktree). Bắt đầu bằng `npm run tauri dev`.

Kịch bản War Room chi tiết hơn (Claude Code × Codex) nằm ở
[`war-room-demo.md`](war-room-demo.md).

## Cơ bản

- [ ] Mở app → 1 workspace + 1 terminal; gõ lệnh có kết quả.
- [ ] Split pane ngang/dọc; kéo separator chỉnh kích thước; đóng pane → cây gộp.
- [ ] Kéo header pane thả lên pane khác → hai pane đổi chỗ, shell không chết.
- [ ] Thêm / chuyển / đổi tên / đóng / kéo sắp xếp workspace ở navbar trái.
- [ ] Composer: chọn thư mục (native picker trả đúng đường dẫn), recent folders
      hoạt động, stepper agent phân bổ đúng, layout preview khớp kết quả,
      `⌘/Ctrl + Enter` tạo workspace.
- [ ] Danh sách terminal ở navbar: click một mục → focus đúng pane.
- [ ] Đóng cửa sổ → ẩn xuống tray (pty vẫn sống); tray → Show mở lại;
      tray → Quit tắt hẳn và kill mọi pty.
- [ ] Mở app lần 2 → chỉ focus cửa sổ cũ (single-instance).
- [ ] Titlebar tự vẽ hiển thị; kéo vùng titlebar di chuyển cửa sổ; kéo viền
      resize được (Windows/Linux; macOS dùng traffic lights native).
- [ ] Nút minimize / maximize-restore đổi đúng trạng thái icon (Windows/Linux).
- [ ] Nút close ẩn cửa sổ xuống tray, app không tắt (Windows/Linux).

## Terminal

- [ ] **Truecolor:** chạy một CLI 24-bit màu → màu đúng, không downscale về 256.
- [ ] **UTF-8:** in emoji / box-drawing / tiếng Việt liên tục → không mojibake.
- [ ] **IME / Telex:** gõ tiếng Việt có dấu vào pane → không mất, không nhân đôi
      ký tự; backspace xoá đúng một ký tự (kể cả tổ hợp NFD).
- [ ] **Copy/paste:** bôi đen + `Ctrl/⌘+C` copy; không có vùng chọn thì `Ctrl+C`
      vẫn là SIGINT; `Ctrl/⌘+V` paste đúng một lần.
- [ ] **Kéo file:** thả file vào pane → đường dẫn được chèn, escape đúng shell.
- [ ] **Đổi shell theo pane:** chọn shell khác trong header → pane respawn bằng
      shell mới, các pane khác không đổi.
- [ ] **Focus bàn phím:** click vào titlebar / tab / header pane rồi gõ ngay →
      ký tự vào terminal, không rơi; nhấn Tab → shell completion chạy chứ không
      nhảy focus sang chrome.
- [ ] **Chấm hoạt động:** pane đang stream output sáng đèn, im lặng thì tắt.

## Link trong terminal

- [ ] URL: `echo https://example.com` → hover thấy gạch chân; **bấm thường** →
      mở trình duyệt mặc định của OS, cột web-preview KHÔNG bật lên.
- [ ] Bôi đen URL bằng chuột → chọn được text, trình duyệt KHÔNG mở.
- [ ] Path tuyệt đối: `ls $PWD/package.json` → bấm thường không có gì xảy ra;
      `⌘/Ctrl + click` → file mở trong editor.
- [ ] Path tương đối + dòng: `echo "src/lib/terminal-links.ts:15:1"` →
      `⌘/Ctrl + click` mở editor đúng dòng 15. Rồi `cd src`, `echo
      "lib/terminal-links.ts:15"` → vẫn resolve (bash/zsh; PowerShell thì không
      — xem Giới hạn đã biết trong README).
- [ ] Path không tồn tại: `echo "src/lib/does-not-exist.ts:9"` → không gạch
      chân, click không làm gì.
- [ ] OSC 8 từ agent: chạy `claude` trong pane, bảo nó đọc một file để in đường
      dẫn → `⌘/Ctrl + click` mở đúng file.

## Broadcast & Settings

- [ ] `⌘/Ctrl + Shift + B` bật broadcast; `Alt + Click` thêm/bớt pane; gõ một
      lần → mọi pane trong nhóm nhận; `Esc` thoát.
- [ ] Settings → Terminal: đổi font / cỡ chữ / line-height / ligature → preview
      và mọi pane cập nhật.
- [ ] Settings → Keyboard Shortcuts liệt kê đúng phím tắt của nền tảng đang chạy.
- [ ] `⌘/Ctrl + B` ẩn/hiện sidebar; `Esc` đóng Settings.
- [ ] Khởi động lại app → lựa chọn Appearance/Terminal được giữ.

## Worktree

- [ ] Toggle "Isolate features in git worktrees" bị vô hiệu hoá trên folder
      không phải repo git (hoặc repo chưa có commit nào).
- [ ] Bật toggle + tạo workspace 3 pane Claude → 3 thư mục worktree tồn tại
      cạnh repo, badge 🌿 hiện ngay (không cần gõ prompt).
- [ ] Broadcast 1 prompt sang 3 pane → 3 diff riêng biệt, sạch, trên 3 nhánh
      trong Git tab.
- [ ] `worktree.remove` từ chối worktree còn thay đổi chưa commit; commit rồi
      thử lại → thư mục bị xoá.
- [ ] Tạo workspace với toggle OFF, gọi `worktree.spawn` → lỗi "worktree
      isolation is not enabled".
- [ ] Đóng pane/workspace → worktree KHÔNG bị xoá.

## Web preview

- [ ] 2 pane, mỗi pane bảo agent mở một URL khác nhau qua `browser.open_preview`
      → click qua lại thấy trang đổi đúng theo pane.
- [ ] Agent ở pane KHÔNG focus gọi tool → view hiện tại không bị cướp.
- [ ] Pane chưa có preview → empty state; gõ URL vào address bar tạo preview
      cho đúng pane.
- [ ] Agent gọi tool lần 2 → điều hướng, back/forward hoạt động, không sinh
      thêm preview.

## War Room — cơ bản

- [ ] Kéo 2 pane agent vào tab War Room → chip thành viên hiện, intro được gõ
      vào từng pane.
- [ ] **Probe:** agent A gửi probe → transcript hiện tin, agent B (đang idle)
      nhận nudge và đọc inbox.
- [ ] **Execute:** agent A gửi execute → prompt chạy trong pane B, transcript
      đánh dấu màu cam.
- [ ] **Thu hồi:** kéo chip ra / bấm ✕ → tool call tiếp theo từ pane đó bị từ
      chối "not in the War Room".
- [ ] **PTY chết:** đóng pane thành viên → transcript ghi rời phòng,
      `list_peers` không còn thành viên ma.

## War Room — Moderator & typing guard

- [ ] Broadcast probe từ composer → cả hai pane được nudge; transcript hiện một
      nhóm `Moderator → everyone` với avatar vương miện.
- [ ] Probe trực tiếp tới một thành viên → chỉ pane đó được nudge.
- [ ] Chuyển sang Execute → hàng `Everyone` biến mất, input chuyển cam; gửi một
      prompt ngắn → được paste và chạy đúng một pane.
- [ ] Agent `war_room.send` tới `__moderator__` → tin vào Discussion, không pane
      nào bị gõ thêm.
- [ ] Agent gửi `mode: "execute"` tới `__moderator__` → bị từ chối.
- [ ] Gõ nửa dòng vào pane A (không Enter) rồi probe pane A từ composer →
      không gõ gì vào pane, nửa dòng còn nguyên, pill hiện ở góc pane A, tab
      Members hiện `⏸1`.
- [ ] Nhấn Enter ở pane A → nudge được gửi ngay sau đó.
- [ ] Lặp lại rồi bấm pill "Deliver now" → tin được gửi ngay.
- [ ] Lặp lại rồi click sang pane B → pill của pane A vẫn giữ (dòng gõ dở giữ
      hàng đợi bất kể focus).
- [ ] Đóng pane A khi đang giữ hàng đợi → không có text lạc, không badge mồ côi.

## War Room — nhiều phòng

- [ ] Mở app → sẵn 1 tab "War Room"; kéo 1 pane vào thân panel → join phòng đó,
      intro gõ vào pane có đúng tên phòng.
- [ ] Bấm `+` tạo phòng "Website B"; kéo pane thứ 2 thẳng vào tab B → join B,
      không đụng phòng đầu.
- [ ] Gọi `war_room.list_peers` từ mỗi pane → chỉ thấy peer cùng phòng, field
      `room` đúng tên phòng.
- [ ] Broadcast ở phòng A → transcript phòng B không nhận gì.
- [ ] Kéo chip thành viên từ A sang tab B → A ghi log Leave, B ghi log Join
      (pending), intro được gõ lại, tool call kế tiếp mới reconnect.
- [ ] Double-click tab → sửa tên inline; composer và transcript đổi tên ngay.
- [ ] Bấm ✕ trên phòng có thành viên → xác nhận 2 bước → thành viên bị
      disconnect, tab biến mất, phòng active fallback sang phòng còn lại.
- [ ] Chỉ còn 1 phòng → tab không có nút ✕.
- [ ] Đang xem phòng A, queue một tin gửi vào pane đang gõ dở ở phòng B → tab B
      hiện `⏸N`.
