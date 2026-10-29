"""OCR bằng PaddleOCR cho PDF scan và ảnh. Chạy trong venv riêng (ocr-venv).

Usage:
  python ocr_paddle.py --pdf file.pdf [--pages 1,2,3] [--max-pages 50]
  python ocr_paddle.py --image file.png

In ra stdout một dòng JSON: {"ok": true, "pages": [{"page": 1, "text": "..."}]}
hoặc {"ok": false, "error": "..."}. Log của thư viện đi sang stderr.
"""
import argparse
import json
import os
import sys

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

proto = sys.stdout
sys.stdout = sys.stderr


def out(obj):
    data = json.dumps(obj, ensure_ascii=True)
    proto.write(data + "\n")
    proto.flush()


def page_text(ocr, img):
    parts = []
    for res in ocr.predict(img):
        texts = res["rec_texts"] if "rec_texts" in res else []
        parts.extend(t for t in texts if t and t.strip())
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf")
    ap.add_argument("--image")
    ap.add_argument("--pages", default="")
    ap.add_argument("--max-pages", type=int, default=50)
    ap.add_argument("--lang", default=os.environ.get("MDR_OCR_LANG") or "vi")
    ap.add_argument("--version", default=os.environ.get("MDR_OCR_VERSION") or "",
                    help="PP-OCRv3 | PP-OCRv5 | PP-OCRv6 (để trống = PaddleOCR tự chọn)")
    args = ap.parse_args()
    if not args.pdf and not args.image:
        out({"ok": False, "error": "ERR_ARGS: need --pdf or --image"})
        return 2
    try:
        from paddleocr import PaddleOCR
        extra = {"ocr_version": args.version} if args.version else {}
        ocr = PaddleOCR(
            lang=args.lang,
            **extra,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,  # oneDNN của Paddle 3.x lỗi trên CPU Windows (ConvertPirAttribute2RuntimeAttribute)
        )
        pages = []
        if args.image:
            pages.append({"page": 1, "text": page_text(ocr, args.image)})
        else:
            import numpy as np
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(args.pdf)
            total = len(pdf)
            wanted = [int(x) for x in args.pages.split(",") if x.strip().isdigit()]
            if not wanted:
                wanted = list(range(1, min(total, args.max_pages) + 1))
            for n in wanted:
                if n < 1 or n > total:
                    continue
                bmp = pdf[n - 1].render(scale=2.0)  # ~144 dpi
                arr = np.ascontiguousarray(np.array(bmp.to_pil().convert("RGB"))[:, :, ::-1])
                pages.append({"page": n, "text": page_text(ocr, arr)})
        out({"ok": True, "pages": pages})
        return 0
    except Exception as e:
        out({"ok": False, "error": f"{type(e).__name__}: {e}"})
        return 1


if __name__ == "__main__":
    sys.exit(main())
