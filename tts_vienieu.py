"""Wrapper Python để gọi VieNeu-TTS (vieneu) từ Electron main process.

Usage:
  python tts_vienieu.py --list
  python tts_vienieu.py --speak --text "Xin chào" --voice Tuyen --output out.wav
"""
import argparse
import sys
import os

# Windows mặc định stdout là cp1252 → lỗi khi in tiếng Việt/emoji. Ép UTF-8.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from vieneu import Vieneu
except Exception as e:
    print(f"ERR_IMPORT:{e}", file=sys.stderr)
    sys.exit(1)


def make_engine():
    """Tạo engine VieNeu. Thiết bị lấy từ biến MDR_VIENEU_DEVICE: auto (mặc định) | cuda | cpu.

    auto dùng GPU khi venv có PyTorch CUDA, nếu không thì chạy ONNX trên CPU.
    Nếu nạp trên GPU lỗi (thiếu VRAM, thiếu torch...) thì tự lùi về CPU.
    """
    device = (os.environ.get("MDR_VIENEU_DEVICE") or "auto").strip().lower()
    try:
        v = Vieneu(device=device)
    except Exception as e:
        if device == "cpu":
            raise
        print(f"WARN_GPU_FALLBACK:{device}: {e}", file=sys.stderr)
        v = Vieneu(device="cpu")
    print(f"VIENEU_BACKEND:{getattr(v, 'backend', '?')} device={getattr(getattr(v, 'engine', None), 'device', getattr(v, 'device', '?'))}", file=sys.stderr)
    return v


def list_voices():
    v = make_engine()
    try:
        voices = v.list_preset_voices()
        # voices: list of (description, id)
        for desc, vid in voices:
            print(f"{vid}\t{desc}")
    finally:
        v.close()


def speak(text, voice, output):
    v = make_engine()
    try:
        voice_data = v.get_preset_voice(voice) if voice else None
        audio = v.infer(text=text, voice=voice_data)
        v.save(audio, output)
    finally:
        v.close()


def serve():
    """Chạy lâu: nạp model một lần, mỗi dòng stdin là một lệnh JSON, mỗi dòng stdout là một phản hồi JSON.

    Lệnh: {"id": 1, "cmd": "list"} hoặc
          {"id": 2, "cmd": "speak", "text": "...", "voice": "...", "output": "out.wav"}
    Phản hồi: {"id": 1, "ok": true, ...} hoặc {"id": 1, "ok": false, "error": "..."}
    """
    import json

    # Thư viện có thể in log ra stdout → giữ stdout thật cho giao thức, print thường đi sang stderr
    proto = sys.stdout
    sys.stdout = sys.stderr
    try:
        sys.stdin.reconfigure(encoding="utf-8")
    except Exception:
        pass

    def reply(obj):
        proto.write(json.dumps(obj) + "\n")
        proto.flush()

    v = make_engine()
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except ValueError as e:
                reply({"id": None, "ok": False, "error": f"ERR_JSON:{e}"})
                continue
            rid = req.get("id")
            try:
                cmd = req.get("cmd")
                if cmd == "list":
                    voices = [{"id": vid, "description": desc} for desc, vid in v.list_preset_voices()]
                    reply({"id": rid, "ok": True, "voices": voices})
                elif cmd == "speak":
                    text = req.get("text") or ""
                    output = req.get("output") or ""
                    if not text or not output:
                        raise ValueError("ERR_ARGS: text and output are required")
                    voice = req.get("voice")
                    voice_data = v.get_preset_voice(voice) if voice else None
                    audio = v.infer(text=text, voice=voice_data)
                    v.save(audio, output)
                    reply({"id": rid, "ok": True})
                else:
                    raise ValueError(f"ERR_CMD:{cmd}")
            except Exception as e:
                reply({"id": rid, "ok": False, "error": str(e)})
    finally:
        v.close()


def main():
    parser = argparse.ArgumentParser(description="VieNeu-TTS wrapper for Electron")
    parser.add_argument("--serve", action="store_true", help="Long-running JSON-lines server")
    parser.add_argument("--list", action="store_true", help="List preset voices")
    parser.add_argument("--speak", action="store_true", help="Synthesize speech to file")
    parser.add_argument("--text", default="", help="Text to synthesize")
    parser.add_argument("--voice", default=None, help="Preset voice id")
    parser.add_argument("--output", default="", help="Output wav file path")
    args = parser.parse_args()

    if args.serve:
        serve()
        return

    if args.list:
        list_voices()
        return

    if args.speak:
        if not args.text or not args.output:
            print("ERR_ARGS: --text and --output are required for --speak", file=sys.stderr)
            sys.exit(2)
        speak(args.text, args.voice, args.output)
        return

    parser.print_help(sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()