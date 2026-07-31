# Ảnh cho README

README hiện dùng **placeholder** từ [placehold.co](https://placehold.co). Để
thay bằng ảnh thật: chụp theo bảng dưới, đặt file vào chính thư mục này với
đúng tên, rồi sửa `src` của thẻ `<img>` tương ứng trong `README.md` (mỗi thẻ có
sẵn một dòng comment `<!-- ẢNH: ... -->` ghi rõ file nào thay vào đâu).

Ví dụ:

```diff
-<img src="https://placehold.co/1600x900/1e1e1e/6b7280/png?text=Hero+screenshot" ... >
+<img src="docs/images/hero.png" alt="Toàn cảnh Swarmterm" width="100%">
```

> Đường dẫn trong README là **tương đối từ gốc repo** (`docs/images/hero.png`),
> không phải `./hero.png`.

## Danh sách ảnh cần chụp

| File | Kích thước gợi ý | Nội dung cần có trong khung |
|---|---|---|
| `logo.png` | 256×256 (nền trong suốt) | Icon app. Có thể lấy từ `src-tauri/icons/128x128@2x.png`. |
| `hero.png` | 1600×900 | Toàn cảnh: navbar trái + 3–4 pane agent đang chạy + panel phải mở. Ảnh "bán" cả app, nên chọn lúc các agent đang có output đẹp. |
| `composer.png` | 1200×750 | Màn hình Welcome: thư mục đã chọn, recent folders, stepper agent, layout preview, toggle worktree đang bật. |
| `split-panes.png` | 1200×750 | Cây split với broadcast đang bật (banner + nhóm pane được chọn sáng viền). |
| `war-room.png` | 1200×750 | Panel War Room: dải tab nhiều phòng, transcript có cả tin probe và execute, chip thành viên, composer Moderator. |
| `git-worktrees.png` | 1200×750 | Tab Git: worktree selector hiện nhánh `swarm/*` kèm agent, danh sách file đổi, diff inline. |
| `web-preview.png` | 1200×750 | Tab Preview: một pane agent bên trái, trang dev server bên phải. |
| `settings.png` | 1200×750 | Settings → Terminal (font/ligature/preview) hoặc Appearance. |

## Mẹo chụp

- Chụp ở **dark mode** (app hiện chỉ có style *VS Code Dark Modern*) để bộ ảnh
  đồng nhất.
- Cửa sổ 1600×900 hoặc 1280×920 (kích thước mặc định) là đủ; ảnh Retina 2× thì
  README vẫn hiển thị đúng vì đã đặt `width="100%"`.
- Che/đổi tên đường dẫn chứa thông tin cá nhân trong titlebar, navbar và prompt
  của shell trước khi commit.
- Nén trước khi commit (`pngquant`, `oxipng` hoặc TinyPNG) — giữ mỗi file dưới
  ~500 KB để `git clone` khỏi phình.
- Nếu muốn ảnh động: đặt `.gif`/`.webp` cùng thư mục và thay `src` tương tự —
  GitHub render được cả hai.
