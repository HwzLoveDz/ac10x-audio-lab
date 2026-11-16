"""Loopback-only static UI host. No uploads, device API, directory listing or execution."""
from __future__ import annotations

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

SERVICE = "AC10x-Audio-Lab-local-static"


def create_server(root: Path, port: int) -> ThreadingHTTPServer:
    root = root.resolve(strict=True)
    version = json.loads((root / "package.json").read_text(encoding="utf-8-sig"))["version"]
    entry = "AC10x-Audio-Lab-v" + version + ".html"
    if not (root / entry).is_file():
        raise ValueError("Build the versioned standalone HTML before starting HTTP")
    # Only root-level UI resources are exposed. qa/, configuration data and docs are not routes.
    allowed = {
        path.name: path
        for path in root.iterdir()
        if path.is_file() and path.suffix.lower() in {".html", ".js", ".css"}
    }

    class Handler(BaseHTTPRequestHandler):
        server_version = "AC10xStatic/1"
        sys_version = ""

        def log_message(self, *_args):
            pass

        def reply(self, status: int, data: bytes, content_type: str, *, head: bool = False):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            if status == 405:
                self.send_header("Allow", "GET, HEAD")
            self.end_headers()
            if not head:
                self.wfile.write(data)

        def host_allowed(self) -> bool:
            host = self.headers.get("Host", "").lower()
            expected = {"127.0.0.1:" + str(self.server.server_port), "localhost:" + str(self.server.server_port)}
            if self.server.server_port == 80:
                expected.update({"127.0.0.1", "localhost"})
            return host in expected

        def route(self, *, head: bool = False):
            if not self.host_allowed():
                self.reply(403, b"Loopback Host required\n", "text/plain; charset=utf-8", head=head)
                return
            try:
                path = unquote(urlsplit(self.path).path, encoding="utf-8", errors="strict")
            except (ValueError, UnicodeError):
                self.reply(400, b"Invalid path\n", "text/plain; charset=utf-8", head=head)
                return
            if path == "/health":
                health = {
                    "service": SERVICE,
                    "schemaVersion": 1,
                    "version": version,
                    "root": str(root),
                    "entry": entry,
                    "sha256": hashlib.sha256((root / entry).read_bytes()).hexdigest(),
                    "bind": "127.0.0.1",
                    "port": self.server.server_port,
                    "pid": os.getpid(),
                    "deviceBackend": False,
                }
                self.reply(200, json.dumps(health, ensure_ascii=True).encode("utf-8"), "application/json; charset=utf-8", head=head)
                return
            if path == "/favicon.ico":
                self.reply(204, b"", "image/x-icon", head=head)
                return
            name = entry if path == "/" else path[1:]
            file = allowed.get(name) if path.startswith("/") and "/" not in name and "\\" not in name else None
            if file is None:
                self.reply(404, b"Not found\n", "text/plain; charset=utf-8", head=head)
                return
            media_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            if file.suffix.lower() in {".html", ".js", ".css"}:
                media_type += "; charset=utf-8"
            self.reply(200, file.read_bytes(), media_type, head=head)

        def do_GET(self):
            self.route()

        def do_HEAD(self):
            self.route(head=True)

        def do_POST(self):
            self.reply(405, b"Only GET and HEAD are supported\n", "text/plain; charset=utf-8")

        do_PUT = do_POST
        do_PATCH = do_POST
        do_DELETE = do_POST
        do_OPTIONS = do_POST

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--port", type=int, default=47881)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("port must be 0..65535")
    server = create_server(args.root, args.port)
    print(json.dumps({"ready": True, "service": SERVICE, "bind": "127.0.0.1", "port": server.server_port, "pid": os.getpid()}), flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
