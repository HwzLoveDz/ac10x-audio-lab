"""Open the exact local release over HTTP; never launch device or firmware operations."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.request import ProxyHandler, build_opener
import uuid
import webbrowser

SERVICE = "AC10x-Audio-Lab-local-static"


def read_health(url: str):
    try:
        with build_opener(ProxyHandler({})).open(url + "health", timeout=1.2) as response:
            return json.load(response)
    except (OSError, ValueError):
        return None


def same_health(health, *, root: Path, version: str, entry: str, digest: str, port: int) -> bool:
    if not isinstance(health, dict):
        return False
    try:
        same_root = os.path.normcase(str(Path(health["root"]).resolve())) == os.path.normcase(str(root))
        return (
            health.get("service") == SERVICE and health.get("schemaVersion") == 1
            and health.get("version") == version and same_root and health.get("entry") == entry
            and health.get("sha256") == digest and health.get("bind") == "127.0.0.1"
            and health.get("port") == port and health.get("deviceBackend") is False
            and isinstance(health.get("pid"), int) and health["pid"] > 0
        )
    except (OSError, TypeError, ValueError, KeyError):
        return False


def occupied(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=47881)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        raise ValueError("Port must be 1..65535")
    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / "package.json").read_text(encoding="utf-8-sig"))["version"]
    entry = "AC10x-Audio-Lab-v" + version + ".html"
    digest = hashlib.sha256((root / entry).read_bytes()).hexdigest()
    url = "http://127.0.0.1:" + str(args.port) + "/"
    expected = {"root": root, "version": version, "entry": entry, "digest": digest, "port": args.port}
    health = read_health(url)
    owned = None
    logs = None
    if not same_health(health, **expected):
        if occupied(args.port):
            raise RuntimeError("Port " + str(args.port) + " belongs to a different or unverified process. It was not stopped. Check /health and the current release before retrying.")
        base = Path(getattr(sys, "_base_executable", sys.executable)).resolve()
        if base.name.lower() == "pythonw.exe":
            base = base.with_name("python.exe")
        if not base.is_file():
            raise RuntimeError("Existing base Python interpreter not found: " + str(base))
        log_dir = Path(os.environ.get("LOCALAPPDATA", str(root))) / "AC10x-Audio-Lab" / "http-logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
        logs = {"stdout": str(log_dir / (tag + ".out.log")), "stderr": str(log_dir / (tag + ".err.log"))}
        flags = 0
        if os.name == "nt":
            flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
        with open(logs["stdout"], "ab") as stdout, open(logs["stderr"], "ab") as stderr:
            owned = subprocess.Popen(
                [str(base), "-u", str(Path(__file__).with_name("serve-local.py")), "--root", str(root), "--port", str(args.port)],
                stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                cwd=str(root), close_fds=True, creationflags=flags,
            )
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            time.sleep(0.2)
            health = read_health(url)
            if same_health(health, **expected):
                break
        if not same_health(health, **expected):
            if owned.poll() is None:
                owned.terminate()
                try:
                    owned.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    owned.kill()
                    owned.wait(timeout=2)
            raise RuntimeError("The new static helper failed identity verification; only that attempted helper was stopped. Logs: " + str(log_dir))
    if not args.no_browser:
        if not webbrowser.open(url, new=2):
            raise RuntimeError("The HTTP service is ready, but the browser did not open. Open " + url)
    result = {
        "url": url, "version": version, "root": str(root), "entrySHA256": digest,
        "serverPID": health["pid"], "startedNewHelper": owned is not None,
        "browserOpened": not args.no_browser, "hardwareAccessed": False, "logs": logs,
    }
    if sys.stdout is not None:
        print(json.dumps(result, ensure_ascii=True), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        message = "AC10x Audio Lab HTTP launcher\n\n" + str(error)
        if sys.stderr is not None:
            print(message, file=sys.stderr, flush=True)
        if os.name == "nt" and (sys.stdout is None or Path(sys.executable).name.lower() == "pythonw.exe"):
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, "AC10x Audio Lab", 0x10 | 0x10000)
        raise SystemExit(1)
