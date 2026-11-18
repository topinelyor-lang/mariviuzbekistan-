# Tiny local-only endpoint: the poster render page POSTs image bytes here,
# we save them as <out>/<name>.webp. Bound to 127.0.0.1, names sanitized.
import os, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:8766')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_POST(self):
        name = re.sub(r'[^a-z0-9-]', '', self.path.rsplit('/', 1)[-1].lower())[:40]
        n = int(self.headers.get('Content-Length', 0))
        if not name or n <= 0 or n > 5_000_000:
            self.send_response(400); self.cors(); self.end_headers(); return
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name + '.webp'), 'wb') as f:
            f.write(data)
        self.send_response(200); self.cors(); self.end_headers()
        self.wfile.write(f'saved {name}.webp {len(data)} bytes'.encode())

    def log_message(self, *a):
        pass


HTTPServer(('127.0.0.1', 8767), H).serve_forever()
