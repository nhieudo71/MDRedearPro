# 📖 MD Reader Pro

Trình đọc Markdown đẹp với giao diện như Claude — đầy đủ tính năng productivity.

## ✨ Tính năng

| Nhóm | Tính năng |
|------|-----------|
| **Đọc** | Render Markdown đẹp · Mục lục tự động · Tìm kiếm · Focus mode · 3 chủ đề (Sáng/Tối/Sepia) |
| **Productivity** | Tabs nhiều file · File gần đây (lịch sử 12 file) · Edit Mode (split view với preview) |
| **Markdown nâng cao** | Mermaid diagrams · KaTeX công thức toán · Code highlight · Collapsible code blocks |
| **Cá nhân hóa** | 6 fonts · Cỡ chữ · Khoảng cách dòng · Độ rộng cột |
| **Dịch thuật** | Dịch đoạn chọn hoặc tài liệu hiện tại bằng Google Translate miễn phí |
| **Đọc to** | TTS qua API Google Gemini · 30 giọng · Tốc độ điều chỉnh |
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
| `Ctrl + Shift + T` | Dịch bằng Google Translate |
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

**Google Dịch:** Bôi đen một đoạn rồi bấm nút 🌐 trên thanh công cụ hoặc nhấn `Ctrl + Shift + T`. Nếu không bôi đen, app sẽ gửi nội dung tài liệu hiện tại sang Google Translate trong tab mới. Có thể đổi ngôn ngữ đích trong ⚙️ Cài đặt → **🌐 Google Dịch**.

> ℹ️ Tính năng này không dùng API key và không tốn chi phí. Vì Google Translate nhận nội dung qua URL, tài liệu quá dài sẽ chỉ gửi phần đầu để tránh vượt giới hạn URL của trình duyệt.

**TTS (Gemini):** Vào ⚙️ Cài đặt → mục **🔊 Giọng đọc Gemini** → nhập **API key** (lấy tại [aistudio.google.com/apikey](https://aistudio.google.com/apikey)), chọn **Model** + **Giọng đọc**. Sau đó click 🔊 trên thanh công cụ → bấm Play.

> ℹ️ **Cách hoạt động:** App gọi thẳng API `gemini-2.5-flash-preview-tts` qua internet (endpoint Google có CORS nên **không cần server/proxy**). Gemini trả về audio **PCM thô (base64)**, app tự bọc header WAV rồi phát. Ngôn ngữ được **tự nhận diện** (gồm tiếng Việt).
>
> ⚠️ API key lưu trong `localStorage` của trình duyệt; **đừng deploy công khai** bản có nhúng key.

**Lưu trữ:** Cài đặt và lịch sử file lưu trong `localStorage` của trình duyệt — không gửi lên server.

## 🛠 Công nghệ

- Vanilla JavaScript (không framework)
- [marked](https://marked.js.org/) — Markdown parser
- [highlight.js](https://highlightjs.org/) — Code syntax highlighting
- [Mermaid](https://mermaid.js.org/) — Diagram rendering
- [KaTeX](https://katex.org/) — Math typesetting
- [JSZip](https://stuk.github.io/jszip/) — DOCX export
- [Google Gemini TTS](https://ai.google.dev/gemini-api/docs/speech-generation) (REST `generateContent`) — TTS

---

Tạo bởi MD Reader Pro · Made with ❤️ for Vietnamese readers
