#!/usr/bin/env python3
"""Yerel önizleme sunucusu — `out/` klasörünü `/GenesisAnime` önekiyle servis eder.

Neden gerekli: statik dışa aktarım `BASE_PATH=/GenesisAnime` ile derleniyor, yani
üretilen HTML varlıkları `/GenesisAnime/...` diye istiyor. `python -m http.server`
önek eşleyemediği için yerelde sayfalar 404 veriyor (daha önce dizin bağlantısı
(junction) ile çözülüyordu; bu betik aynı işi yönetici izni istemeden yapar).

Kullanım:  python tools/onizle-sunucu.py [port]     (varsayılan 8031)
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
ONEK = '/GenesisAnime'


class OnekliHandler(SimpleHTTPRequestHandler):
    """`/GenesisAnime/x` → `out/x`; öneksiz istekler öneke yönlendirilir."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=KOK, **kwargs)

    def translate_path(self, path):
        if path.startswith(ONEK):
            path = path[len(ONEK):] or '/'
        return super().translate_path(path)

    def do_GET(self):
        if not self.path.startswith(ONEK) and self.path != '/':
            self.send_response(302)
            self.send_header('Location', ONEK + self.path)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        # Önizleme sırasında tarayıcı önbelleği yanıltmasın (yeniden derleme sonrası taze içerik).
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8031
    adres = ('127.0.0.1', port)
    print(f'önizleme: http://{adres[0]}:{port}{ONEK}/  (kök: {os.path.abspath(KOK)})', flush=True)
    ThreadingHTTPServer(adres, OnekliHandler).serve_forever()
