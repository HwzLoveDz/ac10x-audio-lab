from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/favicon.ico':self.send_response(204);self.end_headers();return
        if self.path.split('?')[0] not in ('/','/quality-isolated.html'):self.send_error(404);return
        data=(root/'quality-isolated.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
print('QA quality HTTP 127.0.0.1:47877 — only isolated UI',flush=True)
ThreadingHTTPServer(('127.0.0.1',47877),Handler).serve_forever()
