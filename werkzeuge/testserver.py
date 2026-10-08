#!/usr/bin/env python3
"""Lokaler Testserver. Wie `python3 -m http.server`, plus /_warten?ms=N (antwortet verzögert).
Testseiten binden /_warten als iframe ein, damit das load-Ereignis (und damit ein Screenshot)
erst nach asynchronen Tests kommt."""
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/_warten':
            time.sleep(int(parse_qs(url.query).get('ms', ['3000'])[0]) / 1000)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'ok')
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = Path(__file__).resolve().parent.parent
    ThreadingHTTPServer(('', port), partial(Handler, directory=str(root))).serve_forever()
