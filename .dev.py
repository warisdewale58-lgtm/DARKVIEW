#!/usr/bin/env python3
"""Local dev server that mimics the Vercel rewrites for the Dark View site."""
import http.server, socketserver, os, sys, posixpath, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

SPA_PREFIXES = ('/shop', '/product/', '/cart', '/checkout', '/confirm',
                '/orders', '/track-order', '/about', '/help')

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p in ('/admin', '/admin/'):
            return self._file(os.path.join(ROOT, 'admin', 'index.html'), 'text/html')
        if p == '/':
            return self._file(os.path.join(ROOT, 'index.html'), 'text/html')
        if any(p == x or p.startswith(x) for x in SPA_PREFIXES):
            return self._file(os.path.join(ROOT, 'index.html'), 'text/html')
        if p.endswith('.html'):
            p = p[:-5] if p.endswith('/index.html') else p
        return super().do_GET()

    def _file(self, path, ctype):
        try:
            with open(path, 'rb') as f:
                body = f.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', ctype + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), H) as httpd:
    print('serving', ROOT, 'on', PORT, flush=True)
    httpd.serve_forever()
