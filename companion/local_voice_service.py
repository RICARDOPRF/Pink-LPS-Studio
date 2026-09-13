#!/usr/bin/env python3
"""Pink Local Voice Companion.
Local-first speech service for Pink LPS Studio.
- Loopback only
- Token-authenticated actions
- No shell/terminal capability
- Whisper STT, Kokoro TTS, Edge TTS fallback, Ollama LLM
- Optional openWakeWord engine when a compatible model is configured
"""
from __future__ import annotations
import argparse, asyncio, base64, io, json, os, secrets, threading, time
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


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin == "https://ricardoprf.github.io":
        return True
    return origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


class WakeWordEngine:
    def __init__(self):
        self.running = False
        self.last_detected_at = None
        self.last_score = 0.0
        self.last_error = None
        self.threshold = float(os.getenv("PINK_WAKE_THRESHOLD", "0.6"))
        self.model_path = os.getenv("PINK_WAKE_MODEL", "").strip()
        self._thread = None
        self._stop = threading.Event()

    def status(self):
        return {
            "running": self.running,
            "configured": bool(self.model_path),
            "model": os.path.basename(self.model_path) if self.model_path else None,
            "threshold": self.threshold,
            "lastDetectedAt": self.last_detected_at,
            "lastScore": self.last_score,
            "lastError": self.last_error,
        }

    def start(self):
        if self.running:
            return self.status()
        if not self.model_path:
            raise RuntimeError("wake_model_not_configured")
        if not os.path.isfile(self.model_path):
            raise RuntimeError("wake_model_not_found")
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="pink-wake-word")
        self._thread.start()
        return self.status()

    def stop(self):
        self._stop.set()
        self.running = False
        return self.status()

    def _run(self):
        try:
            import numpy as np
            import sounddevice as sd
            from openwakeword.model import Model
            model = Model(wakeword_models=[self.model_path])
            self.running = True
            self.last_error = None
            block = 1280
            with sd.RawInputStream(samplerate=16000, blocksize=block, channels=1, dtype="int16") as stream:
                while not self._stop.is_set():
                    data, _ = stream.read(block)
                    pcm = np.frombuffer(data, dtype=np.int16)
                    scores = model.predict(pcm) or {}
                    if scores:
                        score = max(float(v) for v in scores.values())
                        self.last_score = score
                        if score >= self.threshold:
                            self.last_detected_at = time.time()
                            time.sleep(0.6)
        except Exception as exc:
            self.last_error = str(exc)[:500]
        finally:
            self.running = False


class Engines:
    def __init__(self):
        self.whisper = None
        self.kokoro = None
        self.kokoro_voice = os.getenv("PINK_KOKORO_VOICE", "pf_dora")
        self.edge_voice = os.getenv("PINK_EDGE_VOICE", "pt-BR-FranciscaNeural")
        self.whisper_model = os.getenv("PINK_WHISPER_MODEL", "base")
        self.ollama_url = os.getenv("PINK_OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.getenv("PINK_OLLAMA_MODEL", "qwen2.5:7b")
        self.tts_preference = os.getenv("PINK_TTS_PROVIDER", "kokoro").strip().lower()
        self.lock = threading.RLock()
        self.wake = WakeWordEngine()

    def dependency_status(self):
        result = {}
        for module in ("faster_whisper", "kokoro", "sounddevice", "numpy", "openwakeword", "edge_tts", "miniaudio"):
            try:
                __import__(module); result[module] = True
            except Exception:
                result[module] = False
        return result

    def devices(self):
        import sounddevice as sd
        items = []
        for i, d in enumerate(sd.query_devices()):
            items.append({
                "id": i,
                "name": d.get("name"),
                "inputs": int(d.get("max_input_channels", 0)),
                "outputs": int(d.get("max_output_channels", 0)),
                "defaultSampleRate": float(d.get("default_samplerate", 0) or 0),
            })
        return items

    def stop_audio(self):
        try:
            import sounddevice as sd
            sd.stop()
        except Exception:
            pass
        return True

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
        if len(raw) % 2:
            raise ValueError("pcm16_length_invalid")
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        if int(sample_rate) != 16000:
            raise ValueError("sample_rate_must_be_16000")
        model = self.get_whisper()
        segments, _ = model.transcribe(
            audio,
            language=language or "pt",
            beam_size=1,
            best_of=1,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
        )
        return " ".join(s.text for s in segments).strip()

    def _speak_kokoro(self, text):
        import numpy as np
        import sounddevice as sd
        from kokoro import KPipeline
        with self.lock:
            if self.kokoro is None:
                self.kokoro = KPipeline(lang_code="p")
            for _, _, audio in self.kokoro(text, voice=self.kokoro_voice, speed=1.0):
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().float().numpy()
                chunk = np.asarray(audio, dtype=np.float32)
                if chunk.size:
                    sd.play(chunk, 24000)
                    sd.wait()
        return True

    def _speak_edge(self, text):
        import edge_tts, miniaudio
        async def synth():
            comm = edge_tts.Communicate(text, self.edge_voice)
            buf = bytearray()
            async for chunk in comm.stream():
                if chunk.get("type") == "audio":
                    buf.extend(chunk.get("data") or b"")
            return bytes(buf)
        loop = asyncio.new_event_loop()
        try:
            audio = loop.run_until_complete(synth())
        finally:
            loop.close()
        if not audio:
            raise RuntimeError("edge_tts_empty_audio")
        decoded = miniaudio.decode(audio, output_format=miniaudio.SampleFormat.FLOAT32, nchannels=1)
        import numpy as np, sounddevice as sd
        samples = np.asarray(decoded.samples, dtype=np.float32)
        sd.play(samples, decoded.sample_rate); sd.wait()
        return True

    def speak(self, text, provider="auto"):
        selected = (provider or "auto").strip().lower()
        order = [selected] if selected in {"kokoro", "edge"} else ([self.tts_preference, "edge"] if self.tts_preference != "edge" else ["edge", "kokoro"])
        errors = []
        for candidate in order:
            try:
                self.stop_audio()
                if candidate == "kokoro":
                    return {"ok": self._speak_kokoro(text), "engine": "kokoro", "cost": "0-per-minute"}
                if candidate == "edge":
                    return {"ok": self._speak_edge(text), "engine": "edge-tts", "cost": "no-api-key"}
            except Exception as exc:
                errors.append(f"{candidate}:{exc}")
        raise RuntimeError("tts_failed:" + " | ".join(errors))

    def ollama_health(self):
        try:
            with urlrequest.urlopen(self.ollama_url + "/api/tags", timeout=1.5) as r:
                return r.status == 200
        except Exception:
            return False

    def chat(self, messages):
        payload = json.dumps({
            "model": self.ollama_model,
            "messages": messages,
            "stream": False,
            "options": {"num_predict": 220},
        }).encode()
        req = urlrequest.Request(
            self.ollama_url + "/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=120) as r:
            body = json.loads(r.read().decode())
        return str(body.get("message", {}).get("content", "")).strip()


ENGINES = Engines()
def json_bytes(value): return json.dumps(value, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "PinkLocalVoice/1.1"
    def log_message(self, fmt, *args): pass
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Pink-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def _send(self, status, value):
        data = json_bytes(value); self.send_response(status); self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def _authorized(self): return secrets.compare_digest(self.headers.get("X-Pink-Token", ""), TOKEN)
    def _body(self):
        n = int(self.headers.get("Content-Length", "0"))
        if n > 8_000_000: raise ValueError("payload_too_large")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        if self.path == "/health":
            self._send(200, {
                "ok": True,
                "service": "pink-local-voice",
                "version": "1.1.0",
                "loopback": True,
                "engines": ENGINES.dependency_status(),
                "ollama": ENGINES.ollama_health(),
                "wake": ENGINES.wake.status(),
                "variableVoiceCost": "0-per-minute-local",
            }); return
        self._send(404, {"ok": False, "error": "not_found"})
    def do_POST(self):
        if not self._authorized(): self._send(401, {"ok": False, "error": "unauthorized"}); return
        try: body = self._body()
        except Exception as e: self._send(400, {"ok": False, "error": str(e)}); return
        try:
            if self.path == "/v1/stt/transcribe":
                text = ENGINES.transcribe_pcm16(body.get("pcm16_base64", ""), body.get("sample_rate", 16000), body.get("language", "pt"))
                self._send(200, {"ok": True, "text": text, "engine": "faster-whisper"}); return
            if self.path == "/v1/tts/speak":
                text = str(body.get("text", "")).strip()[:4000]
                if not text: raise ValueError("text_required")
                self._send(200, ENGINES.speak(text, body.get("provider", "auto"))); return
            if self.path == "/v1/audio/stop":
                self._send(200, {"ok": ENGINES.stop_audio(), "stopped": True}); return
            if self.path == "/v1/devices":
                self._send(200, {"ok": True, "devices": ENGINES.devices()}); return
            if self.path == "/v1/wake/start":
                self._send(200, {"ok": True, "wake": ENGINES.wake.start()}); return
            if self.path == "/v1/wake/stop":
                self._send(200, {"ok": True, "wake": ENGINES.wake.stop()}); return
            if self.path == "/v1/wake/status":
                self._send(200, {"ok": True, "wake": ENGINES.wake.status()}); return
            if self.path == "/v1/llm/chat":
                msgs = body.get("messages") or []
                if not isinstance(msgs, list) or len(msgs) > 30: raise ValueError("messages_invalid")
                reply = ENGINES.chat(msgs)
                self._send(200, {"ok": True, "reply": reply, "engine": "ollama"}); return
            self._send(404, {"ok": False, "error": "not_found"})
        except Exception as e:
            self._send(503, {"ok": False, "error": str(e)[:500]})


def self_test():
    deps = ENGINES.dependency_status()
    assert HOST == "127.0.0.1"
    assert len(TOKEN) >= 20
    assert not _origin_allowed("https://evil.example")
    assert _origin_allowed("https://ricardoprf.github.io")
    print(json.dumps({
        "ok": True,
        "loopback": HOST,
        "dependency_probe": deps,
        "ollama_configured": ENGINES.ollama_url,
        "wake_configured": bool(ENGINES.wake.model_path),
    }, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()
    if args.self_test:
        self_test(); return
    print(f"Pink Local Voice Companion listening on http://{HOST}:{args.port}")
    print(f"PINK_LOCAL_VOICE_TOKEN={TOKEN}")
    ThreadingHTTPServer((HOST, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
