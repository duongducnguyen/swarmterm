# Skill: mở web preview trong Swarmterm

Khi bạn (agent) vừa khởi động một dev server trong terminal của Swarmterm và
muốn người dùng xem ngay, hãy mở preview ở cột Browser bằng helper:

- Windows: `pwsh scripts/swarmterm-preview.ps1 http://localhost:5173`
- macOS/Linux: `bash scripts/swarmterm-preview.sh http://localhost:5173`

Cơ chế: helper đọc `SWARMTERM_SESSION` (Swarmterm tiêm vào env mỗi terminal —
là UUID ngẫu nhiên đóng vai secret) rồi mở deep link
`swarmterm://preview?session=&url=`. Swarmterm chỉ chấp nhận khi session đang
sống rồi mở một tab preview gắn với chính terminal này.

Chỉ mở `http`/`https`. URL khác scheme sẽ bị bỏ qua.
