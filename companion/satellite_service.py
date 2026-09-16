#!/usr/bin/env python3
"""Pink Satellite Windows runtime.

Security properties:
- loopback-only listener (127.0.0.1)
- strict Origin/Host validation
- one-time local pairing code -> ephemeral session token
- host-owned capability/risk manifest
- medium/high/sensitive actions require a local one-time approval code
- no generic shell/terminal execution endpoint
- file access is confined to explicit allowed roots and secret-like files are denied

The browser never receives API/provider secrets. This process is only a local device
adapter for Pink Next.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import platform
import secrets
import subprocess
import tempfile
import threading
import time
import uuid
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = int(os.getenv("PINK_SATELLITE_PORT", "8777"))
VERSION = "1.0.0"
SESSION_TTL_SECONDS = 12 * 60 * 60
APPROVAL_TTL_SECONDS = 5 * 60
MAX_REQUEST_BYTES = 1_000_000
MAX_TEXT_BYTES = 1_000_000
MAX_SCREEN_BYTES = 8_000_000

ALLOWED_WEB_ORIGINS = {
    "https://ricardoprf.github.io",
    "http://localhost",
    "http://127.0.0.1",
}
SENSITIVE_NAMES = {
    ".env", ".env.local", ".env.production", ".npmrc", ".pypirc",
    "id_rsa", "id_ed25519", "credentials", "credentials.json",
    "service-account.json", "service_account.json",
}
SENSITIVE_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".kdbx"}
TEXT_SUFFIXES = {
    ".txt", ".md", ".json", ".csv", ".log", ".py", ".js", ".mjs",
    ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".yml", ".yaml",
    ".xml", ".ini", ".toml", ".sql", ".ps1", ".bat", ".cmd", ".sh",
}


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return True  # native/local clients do not send Origin
    if origin == "https://ricardoprf.github.io":
        return True
    return origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


def _host_allowed(host: str) -> bool:
    value = (host or "").lower().strip()
    return value.startswith("127.0.0.1:") or value.startswith("localhost:") or value in {"127.0.0.1", "localhost"}


def _risk_rank(risk: str) -> int:
    return {"READ_ONLY": 0, "SENSITIVE_READ": 1, "REVERSIBLE_WRITE": 2, "EXTERNAL_WRITE": 3, "DESTRUCTIVE": 4}.get(risk, 4)


def _requires_approval(risk: str) -> bool:
    return _risk_rank(risk) >= 1


def _now() -> int:
    return int(time.time())


def _json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _config_dir() -> Path:
    root = os.getenv("PINK_SATELLITE_CONFIG_DIR", "").strip()
    return Path(root).expanduser().resolve() if root else (Path.home() / ".pink-satellite").resolve()


def _load_or_create_device_id() -> str:
    directory = _config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "device-id"
    try:
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value[:100]
    except Exception:
        pass
    value = "pink-sat-" + uuid.uuid4().hex[:16]
    try:
        path.write_text(value, encoding="utf-8")
    except Exception:
        pass
    return value


def _allowed_roots() -> list[Path]:
    configured = os.getenv("PINK_SATELLITE_ROOTS", "").strip()
    items = [x for x in configured.split(os.pathsep) if x.strip()] if configured else []
    if not items:
        candidate = Path.home() / "Documents" / "LPS"
        if candidate.exists():
            items = [str(candidate)]
    roots: list[Path] = []
    for item in items:
        try:
            path = Path(item).expanduser().resolve()
            if path.exists() and path.is_dir():
                roots.append(path)
        except Exception:
            continue
    return roots


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _secret_like(path: Path) -> bool:
    name = path.name.lower()
    if name in SENSITIVE_NAMES or path.suffix.lower() in SENSITIVE_SUFFIXES:
        return True
    return any(part.lower() in {".ssh", ".gnupg", ".aws"} for part in path.parts)


@dataclass(frozen=True)
class Capability:
    id: str
    risk: str
    state: str
    title: str
    description: str

    def public(self):
        return {"id": self.id, "risk": self.risk, "state": self.state, "title": self.title, "description": self.description}


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, dict] = {}
        self._lock = threading.RLock()

    def issue(self, origin: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[token] = {"origin": origin or "native", "expires": _now() + SESSION_TTL_SECONDS}
        return token

    def validate(self, token: str, origin: str) -> bool:
        if not token:
            return False
        with self._lock:
            record = self._sessions.get(token)
            if not record or int(record["expires"]) < _now():
                self._sessions.pop(token, None)
                return False
            expected = record.get("origin") or "native"
            actual = origin or "native"
            return secrets.compare_digest(str(expected), str(actual))


class ApprovalStore:
    def __init__(self):
        self._requests: dict[str, dict] = {}
        self._tokens: dict[str, dict] = {}
        self._lock = threading.RLock()

    def request(self, session_token: str, capability: str, risk: str) -> dict:
        approval_id = "apr-" + uuid.uuid4().hex[:14]
        code = f"{secrets.randbelow(1_000_000):06d}"
        expires = _now() + APPROVAL_TTL_SECONDS
        with self._lock:
            self._requests[approval_id] = {
                "session": session_token, "capability": capability, "risk": risk,
                "code": code, "expires": expires, "attempts": 0,
            }
        print(f"[PINK SATELLITE] Aprovação local para {capability}: código {code} (expira em 5 min)", flush=True)
        return {"approvalId": approval_id, "capability": capability, "risk": risk, "expiresAt": expires, "codeDisplayedLocally": True}

    def confirm(self, session_token: str, approval_id: str, code: str) -> dict:
        with self._lock:
            record = self._requests.get(approval_id)
            if not record or record["expires"] < _now() or record["session"] != session_token:
                return {"ok": False, "reason": "invalid_or_expired"}
            record["attempts"] += 1
            if record["attempts"] > 5:
                self._requests.pop(approval_id, None)
                return {"ok": False, "reason": "too_many_attempts"}
            if not secrets.compare_digest(str(record["code"]), str(code or "")):
                return {"ok": False, "reason": "code_mismatch"}
            token = secrets.token_urlsafe(28)
            self._tokens[token] = {
                "session": session_token, "capability": record["capability"],
                "expires": min(record["expires"], _now() + APPROVAL_TTL_SECONDS), "used": False,
            }
            self._requests.pop(approval_id, None)
            return {"ok": True, "approvalToken": token, "capability": record["capability"]}

    def consume(self, session_token: str, capability: str, token: str) -> bool:
        if not token:
            return False
        with self._lock:
            record = self._tokens.get(token)
            if not record or record["used"] or record["expires"] < _now():
                return False
            if record["session"] != session_token or record["capability"] != capability:
                return False
            record["used"] = True
            return True


class SatelliteRuntime:
    def __init__(self):
        self.device_id = _load_or_create_device_id()
        self.device_name = os.getenv("PINK_SATELLITE_NAME", "Pink Satellite Windows").strip()[:120] or "Pink Satellite Windows"
        self.pair_code = f"{secrets.randbelow(1_000_000):06d}"
        self.sessions = SessionStore()
        self.approvals = ApprovalStore()
        self.roots = _allowed_roots()
        self._pair_attempts: dict[str, list[int]] = {}
        self._pair_lock = threading.RLock()

    def capabilities(self) -> list[Capability]:
        is_windows = platform.system().lower() == "windows"
        try:
            import cv2  # type: ignore
            camera_available = bool(os.getenv("PINK_SATELLITE_CAMERA", "0") == "1" and cv2)
        except Exception:
            camera_available = False
        return [
            Capability("system.snapshot", "READ_ONLY", "available", "Sistema", "Informações não sensíveis do dispositivo."),
            Capability("files.list", "READ_ONLY", "available" if self.roots else "degraded", "Arquivos", "Lista arquivos somente em roots explicitamente permitidos."),
            Capability("files.read_text", "READ_ONLY", "available" if self.roots else "degraded", "Leitura de texto", "Lê texto permitido; arquivos de segredo são bloqueados."),
            Capability("screen.capture", "SENSITIVE_READ", "available" if is_windows else "unavailable", "Tela", "Captura uma imagem da tela após aprovação local."),
            Capability("camera.capture", "SENSITIVE_READ", "available" if camera_available else "degraded", "Câmera", "Captura uma imagem somente quando câmera local é explicitamente habilitada."),
            Capability("browser.open_url", "REVERSIBLE_WRITE", "available", "Abrir URL", "Abre uma URL http/https no navegador padrão após aprovação local."),
            Capability("terminal.exec", "DESTRUCTIVE", "unavailable", "Terminal", "Execução genérica de shell é deliberadamente indisponível nesta versão."),
        ]

    def capability(self, capability_id: str) -> Capability | None:
        return next((c for c in self.capabilities() if c.id == capability_id), None)

    def public_info(self) -> dict:
        return {
            "ok": True, "service": "pink-satellite", "version": VERSION,
            "deviceId": self.device_id, "name": self.device_name,
            "platform": platform.system().lower(), "pairingRequired": True,
            "capabilities": [c.public() for c in self.capabilities()],
        }

    def paired_info(self) -> dict:
        return {**self.public_info(), "roots": [str(x) for x in self.roots], "pairingRequired": False}

    def pair(self, code: str, origin: str) -> dict:
        key = origin or "native"
        now = _now()
        with self._pair_lock:
            recent = [x for x in self._pair_attempts.get(key, []) if now - x < 60]
            if len(recent) >= 5:
                return {"ok": False, "error": "pair_rate_limited"}
            recent.append(now); self._pair_attempts[key] = recent
        if not secrets.compare_digest(str(self.pair_code), str(code or "")):
            return {"ok": False, "error": "pair_code_invalid"}
        session = self.sessions.issue(origin)
        return {"ok": True, "sessionToken": session, "sessionExpiresIn": SESSION_TTL_SECONDS, "device": self.paired_info()}

    def resolve_path(self, requested: str) -> Path:
        if not requested:
            raise ValueError("path_required")
        path = Path(requested).expanduser().resolve()
        if not any(_is_under(path, root) for root in self.roots):
            raise PermissionError("path_outside_allowed_roots")
        if _secret_like(path):
            raise PermissionError("secret_like_file_blocked")
        return path

    def system_snapshot(self) -> dict:
        return {
            "platform": platform.system(), "release": platform.release(), "version": platform.version(),
            "machine": platform.machine(), "python": platform.python_version(),
            "processor": platform.processor()[:160], "deviceId": self.device_id,
        }

    def files_list(self, args: dict) -> dict:
        requested = str(args.get("path") or (str(self.roots[0]) if self.roots else ""))
        path = self.resolve_path(requested)
        if not path.is_dir():
            raise ValueError("path_not_directory")
        limit = max(1, min(int(args.get("limit") or 100), 250))
        items = []
        for child in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if len(items) >= limit:
                break
            if _secret_like(child) or child.name.startswith("."):
                continue
            try:
                stat = child.stat()
                items.append({"name": child.name, "path": str(child), "type": "directory" if child.is_dir() else "file", "size": stat.st_size if child.is_file() else None, "modifiedAt": int(stat.st_mtime)})
            except Exception:
                continue
        return {"path": str(path), "items": items, "truncated": len(items) >= limit}

    def files_read_text(self, args: dict) -> dict:
        path = self.resolve_path(str(args.get("path") or ""))
        if not path.is_file():
            raise ValueError("path_not_file")
        if path.suffix.lower() not in TEXT_SUFFIXES:
            raise PermissionError("file_type_not_allowed")
        size = path.stat().st_size
        if size > MAX_TEXT_BYTES:
            raise ValueError("file_too_large")
        text = path.read_text(encoding="utf-8", errors="replace")
        return {"path": str(path), "text": text, "size": size}

    def screen_capture(self) -> dict:
        if platform.system().lower() != "windows":
            raise RuntimeError("screen_capture_windows_only")
        fd, tmp = tempfile.mkstemp(prefix="pink-screen-", suffix=".png")
        os.close(fd)
        temp_path = Path(tmp)
        escaped = str(temp_path).replace("'", "''")
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; "
            "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
            "$img=New-Object System.Drawing.Bitmap($b.Width,$b.Height); "
            "$g=[System.Drawing.Graphics]::FromImage($img); "
            "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); "
            f"$img.Save('{escaped}',[System.Drawing.Imaging.ImageFormat]::Png); "
            "$g.Dispose(); $img.Dispose();"
        )
        try:
            completed = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], capture_output=True, timeout=20, check=False)
            if completed.returncode != 0 or not temp_path.exists():
                raise RuntimeError("screen_capture_failed")
            raw = temp_path.read_bytes()
            if len(raw) > MAX_SCREEN_BYTES:
                raise RuntimeError("screen_capture_too_large")
            return {"mime": "image/png", "base64": base64.b64encode(raw).decode("ascii"), "bytes": len(raw)}
        finally:
            try: temp_path.unlink(missing_ok=True)
            except Exception: pass

    def camera_capture(self) -> dict:
        if os.getenv("PINK_SATELLITE_CAMERA", "0") != "1":
            raise PermissionError("camera_not_enabled")
        try:
            import cv2  # type: ignore
        except Exception as exc:
            raise RuntimeError("opencv_not_installed") from exc
        camera = cv2.VideoCapture(0)
        try:
            ok, frame = camera.read()
            if not ok:
                raise RuntimeError("camera_capture_failed")
            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if not ok:
                raise RuntimeError("camera_encode_failed")
            raw = encoded.tobytes()
            return {"mime": "image/jpeg", "base64": base64.b64encode(raw).decode("ascii"), "bytes": len(raw)}
        finally:
            camera.release()

    def browser_open_url(self, args: dict) -> dict:
        target = str(args.get("url") or "").strip()
        parsed = urlparse(target)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url_not_allowed")
        opened = bool(webbrowser.open(target, new=2, autoraise=True))
        return {"opened": opened, "url": target}

    def invoke(self, capability_id: str, args: dict) -> dict:
        cap = self.capability(capability_id)
        if not cap:
            raise KeyError("capability_not_found")
        if cap.state != "available":
            raise RuntimeError(f"capability_{cap.state}")
        handlers = {
            "system.snapshot": lambda: self.system_snapshot(),
            "files.list": lambda: self.files_list(args),
            "files.read_text": lambda: self.files_read_text(args),
            "screen.capture": self.screen_capture,
            "camera.capture": self.camera_capture,
            "browser.open_url": lambda: self.browser_open_url(args),
        }
        if capability_id not in handlers:
            raise PermissionError("capability_not_executable")
        return handlers[capability_id]()


RUNTIME = SatelliteRuntime()


class Handler(BaseHTTPRequestHandler):
    server_version = "PinkSatellite/1.0"

    def log_message(self, fmt, *args):
        pass

    def _origin(self) -> str:
        return self.headers.get("Origin", "").strip()

    def _valid_request_source(self) -> bool:
        return _host_allowed(self.headers.get("Host", "")) and _origin_allowed(self._origin())

    def _cors(self):
        origin = self._origin()
        if origin and _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Pink-Approval")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")

    def _send(self, status: int, value):
        data = _json_bytes(value)
        self.send_response(status); self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("payload_too_large")
        raw = self.rfile.read(length)
        value = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(value, dict):
            raise ValueError("json_object_required")
        return value

    def _bearer(self) -> str:
        auth = self.headers.get("Authorization", "")
        return auth[7:].strip() if auth.lower().startswith("bearer ") else ""

    def _session(self) -> str | None:
        token = self._bearer()
        return token if RUNTIME.sessions.validate(token, self._origin()) else None

    def do_OPTIONS(self):
        if not self._valid_request_source():
            self._send(403, {"ok": False, "error": "source_not_allowed"}); return
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        if not self._valid_request_source():
            self._send(403, {"ok": False, "error": "source_not_allowed"}); return
        if self.path == "/v1/info":
            self._send(200, RUNTIME.public_info()); return
        if self.path == "/v1/session":
            session = self._session()
            if not session:
                self._send(401, {"ok": False, "error": "unauthorized"}); return
            self._send(200, {"ok": True, "device": RUNTIME.paired_info()}); return
        self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if not self._valid_request_source():
            self._send(403, {"ok": False, "error": "source_not_allowed"}); return
        try:
            body = self._body()
        except Exception as exc:
            self._send(400, {"ok": False, "error": str(exc)[:160]}); return

        if self.path == "/v1/pair":
            result = RUNTIME.pair(str(body.get("code") or ""), self._origin())
            self._send(200 if result.get("ok") else 401, result); return

        session = self._session()
        if not session:
            self._send(401, {"ok": False, "error": "unauthorized"}); return

        try:
            if self.path == "/v1/approval/request":
                capability_id = str(body.get("capability") or "")
                cap = RUNTIME.capability(capability_id)
                if not cap or not _requires_approval(cap.risk):
                    raise ValueError("approval_not_required_or_unknown")
                self._send(200, {"ok": True, **RUNTIME.approvals.request(session, capability_id, cap.risk)}); return

            if self.path == "/v1/approval/confirm":
                result = RUNTIME.approvals.confirm(session, str(body.get("approvalId") or ""), str(body.get("code") or ""))
                self._send(200 if result.get("ok") else 403, result); return

            if self.path == "/v1/invoke":
                capability_id = str(body.get("capability") or "")
                args = body.get("args") if isinstance(body.get("args"), dict) else {}
                cap = RUNTIME.capability(capability_id)
                if not cap:
                    self._send(404, {"ok": False, "error": "capability_not_found"}); return
                if _requires_approval(cap.risk):
                    approval = self.headers.get("X-Pink-Approval", "")
                    if not RUNTIME.approvals.consume(session, capability_id, approval):
                        self._send(428, {"ok": False, "error": "local_approval_required", "capability": capability_id, "risk": cap.risk}); return
                started = time.perf_counter()
                result = RUNTIME.invoke(capability_id, args)
                self._send(200, {"ok": True, "capability": capability_id, "risk": cap.risk, "latencyMs": round((time.perf_counter() - started) * 1000, 1), "result": result}); return

            self._send(404, {"ok": False, "error": "not_found"})
        except PermissionError as exc:
            self._send(403, {"ok": False, "error": str(exc)[:160]})
        except (ValueError, KeyError) as exc:
            self._send(400, {"ok": False, "error": str(exc)[:160]})
        except Exception as exc:
            self._send(503, {"ok": False, "error": str(exc)[:200]})


def self_test():
    assert HOST == "127.0.0.1"
    assert _host_allowed("127.0.0.1:8777")
    assert not _host_allowed("evil.example:8777")
    assert _origin_allowed("https://ricardoprf.github.io")
    assert not _origin_allowed("https://evil.example")
    assert _requires_approval("SENSITIVE_READ")
    assert not _requires_approval("READ_ONLY")
    assert RUNTIME.capability("terminal.exec").state == "unavailable"
    session = RUNTIME.sessions.issue("native")
    assert RUNTIME.sessions.validate(session, "")
    request = RUNTIME.approvals.request(session, "screen.capture", "SENSITIVE_READ")
    internal = RUNTIME.approvals._requests[request["approvalId"]]  # self-test only
    confirmed = RUNTIME.approvals.confirm(session, request["approvalId"], internal["code"])
    assert confirmed["ok"]
    assert RUNTIME.approvals.consume(session, "screen.capture", confirmed["approvalToken"])
    assert not RUNTIME.approvals.consume(session, "screen.capture", confirmed["approvalToken"])
    print(json.dumps({"ok": True, "service": "pink-satellite", "version": VERSION, "platform": platform.system(), "capabilities": [c.public() for c in RUNTIME.capabilities()]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Pink Satellite Windows")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    if args.self_test:
        self_test(); return
    print("=" * 64)
    print("PINK SATELLITE WINDOWS")
    print(f"Listening: http://{HOST}:{args.port}")
    print(f"Device: {RUNTIME.device_name} ({RUNTIME.device_id})")
    print(f"Pairing code: {RUNTIME.pair_code}")
    if RUNTIME.roots:
        print("Allowed roots:")
        for root in RUNTIME.roots: print(f"  - {root}")
    else:
        print("Allowed roots: none (set PINK_SATELLITE_ROOTS or create Documents\\LPS)")
    print("Generic shell: DISABLED")
    print("=" * 64, flush=True)
    ThreadingHTTPServer((HOST, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
