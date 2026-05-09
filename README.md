# 📖 MD Reader Pro

Trình đọc Markdown đẹp với giao diện như Claude — đầy đủ tính năng productivity.

## ✨ Tính năng

| Nhóm | Tính năng |
|------|-----------|
| **Đọc** | Render Markdown đẹp · Mục lục tự động · Tìm kiếm · Focus mode · 3 chủ đề (Sáng/Tối/Sepia) |
| **Productivity** | Tabs nhiều file · File gần đây (lịch sử 12 file) · Edit Mode (split view với preview) |
| **Markdown nâng cao** | Mermaid diagrams · KaTeX công thức toán · Code highlight · Collapsible code blocks |
| **Cá nhân hóa** | 6 fonts · Cỡ chữ · Khoảng cách dòng · Độ rộng cột |
| **Đọc to** | TTS tiếng Việt · Chọn giọng · Tốc độ điều chỉnh |
| **Xuất file** | TXT · DOCX · PDF |
| **PWA** | Cài như app · Hoạt động offline · Icon riêng |

## 🚀 Cách sử dụng

### Cách 1: Mở nhanh (không cần cài đặt)
Chỉ cần mở file `index.html` trong trình duyệt — mọi tính năng đều hoạt động **trừ** PWA install và offline.

### Cách 2: Chạy local server (đầy đủ tính năng PWA)

**Python:**
```bash
cd md-reader-pro
python3 -m http.server 8000
# Mở: http://localhost:8000
```

**Node.js:**
```bash
npx serve md-reader-pro
```

**PHP:**
```bash
cd md-reader-pro
php -S localhost:8000
```

Sau đó truy cập `http://localhost:8000` — trình duyệt sẽ hiển thị nút **"Cài đặt app"** để cài lên desktop/mobile.

### Cách 3: Deploy lên hosting miễn phí
- **GitHub Pages**: push folder lên repo, bật Pages
- **Netlify**: kéo thả folder vào netlify.app
- **Vercel**: `vercel deploy` trong folder
- **Cloudflare Pages**: connect repo

Sau khi deploy với HTTPS, PWA sẽ tự động kích hoạt — người dùng có thể cài app từ trình duyệt.

## ⌨️ Phím tắt

| Phím | Tác dụng |
|------|----------|
| `Ctrl + O` | Mở file |
| `Ctrl + N` | Tab mới |
| `Ctrl + W` | Đóng tab |
| `Ctrl + E` | Vào/Thoát Edit Mode |
| `Ctrl + S` | Lưu file đang sửa |
| `Ctrl + F` | Tìm kiếm trong tài liệu |
| `Ctrl + Tab` | Chuyển tab tiếp theo |
| `Esc` | Đóng panel hiện tại |

## 📁 Cấu trúc file

```
md-reader-pro/
├── index.html      # Ứng dụng chính
├── manifest.json   # Cấu hình PWA
├── sw.js           # Service worker (offline)
├── icon.svg        # Icon vector
├── icon-192.png    # Icon 192×192 (Android)
├── icon-512.png    # Icon 512×512 (splash screen)
└── README.md       # File này
```

## 🎯 Mẹo dùng nâng cao

**Mermaid:** Viết sơ đồ trong code block với ngôn ngữ `mermaid`:
````
```mermaid
graph LR
    A --> B
```
````

**KaTeX:** Dùng `$...$` cho inline và `$$...$$` cho display:
```
Inline: $E = mc^2$
Display: $$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
```

**TTS tiếng Việt:** Click 🔊 → chọn giọng có lang `vi-VN` → bấm Play. Trên Windows cần cài thêm voice tiếng Việt trong Settings → Time & Language → Speech.

**Lưu trữ:** Cài đặt và lịch sử file lưu trong `localStorage` của trình duyệt — không gửi lên server.

## 🛠 Công nghệ

- Vanilla JavaScript (không framework)
- [marked](https://marked.js.org/) — Markdown parser
- [highlight.js](https://highlightjs.org/) — Code syntax highlighting
- [Mermaid](https://mermaid.js.org/) — Diagram rendering
- [KaTeX](https://katex.org/) — Math typesetting
- [JSZip](https://stuk.github.io/jszip/) — DOCX export
- Web Speech API — TTS

---

Tạo bởi MD Reader Pro · Made with ❤️ for Vietnamese readers
