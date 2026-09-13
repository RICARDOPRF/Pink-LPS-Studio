#!/usr/bin/env python3
"""Pink Local Voice Companion.
Original LPS implementation inspired by common local-assistant architecture patterns.
Binds only to loopback, exposes no shell/terminal capability, and lazy-loads optional engines.
"""
from __future__ import annotations
import argparse, base64, json, os, secrets, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urlrequest

HOST = "127.0.0.1"
PORT = int(os.getenv("PINK_LOCAL_VOICE_PORT", "8765"))
TOKEN = os.getenv("PINK_LOCAL_VOICE_TOKEN") or secrets.token_urlsafe(24)
ALLOWED_ORIGINS = {
    "https://ricardoprf.github.io",
    "http://127.0.0.1",
    "http://localhost",
}

class Engines:
    def __init__(self):
        self.whisper = None
        self.kokoro = None
        self.kokoro_voice = os.getenv("PINK_KOKORO_VOICE", "pf_dora")
        self.whisper_model = os.getenv("PINK_WHISPER_MODEL", "base")
        self.ollama_url = os.getenv("PINK_OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.getenv("PINK_OLLAMA_MODEL", "qwen2.5:7b")
        self.lock = threading.RLock()

    def dependency_status(self):
        result = {}
        for module in ("faster_whisper", "kokoro", "sounddevice", "numpy", "openwakeword"):
            try:
                __import__(module); result[module] = True
            except Exception:
                result[module] = False
        return result

    def get_whisper(self):
        with self.lock:
            if self.whisper is None:
                from faster_whisper import WhisperModel
                try:
                    import torch
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                except Exception:
                    device = "cpu"
                compute = "float16" if device == "cuda" else "int8"
                self.whisper = WhisperModel(self.whisper_model, device=device, compute_type=compute)
            return self.whisper

    def transcribe_pcm16(self, b64, sample_rate=16000, language="pt"):
        import numpy as np
        raw = base64.b64decode(b64, validate=True)
        if len(raw) % 2: raise ValueError("pcm16_length_invalid")
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        if int(sample_rate) != 16000: raise ValueError("sample_rate_must_be_16000")
        model = self.get_whisper()
        segments, _ = model.transcribe(audio, language=language or "pt", beam_size=1, best_of=1,
                                       condition_on_previous_text=False, vad_filter=True,
                                       vad_parameters={"min_silence_duration_ms": 300})
        return " ".join(s.text for s in segments).strip()

    def speak(self, text):
        import numpy as np, sounddevice as sd
        from kokoro import KPipeline
        with self.lock:
            if self.kokoro is None:
                self.kokoro = KPipeline(lang_code="p")
            chunks = []
            for _, _, audio in self.kokoro(text, voice=self.kokoro_voice, speed=1.0):
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().float().numpy()
                chunks.append(np.asarray(audio, dtype=np.float32))
            if not chunks: return False
            out = np.concatenate(chunks)
            sd.play(out, 24000); sd.wait(); return True

    def ollama_health(self):
        try:
            with urlrequest.urlopen(self.ollama_url + "/api/tags", timeout=1.5) as r:
                return r.status == 200
        except Exception:
            return False

    def chat(self, messages):
        payload = json.dumps({"model": self.ollama_model, "messages": messages, "stream": False,
                              "options": {"num_predict": 220}}).encode()
        req = urlrequest.Request(self.ollama_url + "/api/chat", data=payload,
                                 headers={"Content-Type":"application/json"}, method="POST")
        with urlrequest.urlopen(req, timeout=120) as r:
            body = json.loads(r.read().decode())
        return str(body.get("message", {}).get("content", "")).strip()

ENGINES = Engines()
def json_bytes(value): return json.dumps(value, ensure_ascii=False).encode("utf-8")

class Handler(BaseHTTPRequestHandler):
    server_version = "PinkLocalVoice/1.0"
    def log_message(self, fmt, *args): pass
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if any(origin.startswith(x) for x in ALLOWED_ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Pink-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def _send(self, status, value):
        data = json_bytes(value); self.send_response(status); self._cors()
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def _authorized(self): return secrets.compare_digest(self.headers.get("X-Pink-Token", ""), TOKEN)
    def _body(self):
        n = int(self.headers.get("Content-Length", "0"))
        if n > 8_000_000: raise ValueError("payload_too_large")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok":True,"service":"pink-local-voice","version":"1.0.0","loopback":True,
                             "engines":ENGINES.dependency_status(),"ollama":ENGINES.ollama_health(),
                             "variableVoiceCost":"0-per-minute"}); return
        self._send(404,{"ok":False,"error":"not_found"})
    def do_POST(self):
        if not self._authorized(): self._send(401,{"ok":False,"error":"unauthorized"}); return
        try: body = self._body()
        except Exception as e: self._send(400,{"ok":False,"error":str(e)}); return
        try:
            if self.path == "/v1/stt/transcribe":
                text = ENGINES.transcribe_pcm16(body.get("pcm16_base64", ""), body.get("sample_rate",16000), body.get("language","pt"))
                self._send(200,{"ok":True,"text":text,"engine":"faster-whisper"}); return
            if self.path == "/v1/tts/speak":
                text = str(body.get("text", "")).strip()[:4000]
                if not text: raise ValueError("text_required")
                ok = ENGINES.speak(text); self._send(200,{"ok":ok,"engine":"kokoro","cost":"0-per-minute"}); return
            if self.path == "/v1/llm/chat":
                msgs = body.get("messages") or []
                if not isinstance(msgs,list) or len(msgs)>30: raise ValueError("messages_invalid")
                reply = ENGINES.chat(msgs); self._send(200,{"ok":True,"reply":reply,"engine":"ollama"}); return
            self._send(404,{"ok":False,"error":"not_found"})
        except Exception as e:
            self._send(503,{"ok":False,"error":str(e)[:500]})

def self_test():
    deps = ENGINES.dependency_status()
    assert HOST in ("127.0.0.1","localhost")
    assert len(TOKEN) >= 20
    print(json.dumps({"ok":True,"loopback":HOST,"dependency_probe":deps,"ollama_configured":ENGINES.ollama_url}, ensure_ascii=False))

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--self-test",action="store_true"); ap.add_argument("--port",type=int,default=PORT); args=ap.parse_args()
    if args.self_test: self_test(); return
    print(f"Pink Local Voice Companion listening on http://{HOST}:{args.port}")
    print(f"PINK_LOCAL_VOICE_TOKEN={TOKEN}")
    ThreadingHTTPServer((HOST,args.port),Handler).serve_forever()
if __name__ == "__main__": main()
