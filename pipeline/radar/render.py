"""ساخت عکس PNG و ویدیوی MP4 کارت هشدار، با مرورگر بی‌سر (Playwright) و ffmpeg.

کارت همان card.html داشبورد است؛ هر فریم با __frame(T) به‌صورت قطعی کشیده می‌شود،
پس ویدیو دقیقاً همان چیزی است که دوستانت در داشبورد می‌بینند.

    python -m radar.render                 # برای همه‌ی هشدارهای out/alerts.json که media دارند
"""
import base64
import json
import functools
import http.server
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import quote

from . import config as cfg

MEDIA = cfg.WEB / "media"
PRIVATE = cfg.ROOT / "out" / "private"
PRIVATE_MEDIA = PRIVATE / "media"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def _serve(root):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _b64(data_url):
    return base64.b64decode(data_url.split(",", 1)[1])


def render(items, seconds=8, fps=24, fmt="post", private=False):
    from playwright.sync_api import sync_playwright

    if shutil.which("ffmpeg") is None:
        print("[render] ffmpeg not found; only PNG", file=sys.stderr)
    media = PRIVATE_MEDIA if private else MEDIA
    media.mkdir(parents=True, exist_ok=True)
    for old in media.glob("*"):            # فقط رسانه‌ی همین اجرا می‌ماند
        old.unlink()
    places = {c["n"]: c for c in cfg.load_json(PRIVATE / "places.json", {}).get("cities", [])} if private else {}
    srv = _serve(cfg.WEB)
    port = srv.server_address[1]
    base = cfg.env("PUBLIC_BASE_URL").rstrip("/")
    w, h = (1080, 1920) if fmt == "story" else (1080, 1350)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for i, a in enumerate(items):
                if not a.get("media"):
                    continue
                page = browser.new_page(viewport={"width": w, "height": h})
                if private:     # داده‌ی محل اختصاصی مستقیم به صفحه تزریق می‌شود و جایی منتشر نمی‌شود
                    page.add_init_script(f"window.__EXTRA_CITY={json.dumps(places.get(a['city']), ensure_ascii=False)}")
                q = ("view=iran" if a.get("view") == "iran" else f"city={quote(a['city'])}") + f"&fmt={fmt}&headless=1"
                if a.get("test"):
                    q += "&test=1"
                if base:
                    q += f"&base={quote(base)}"
                page.goto(f"http://127.0.0.1:{port}/card.html?{q}")
                page.wait_for_function("window.__ready===true || !!window.__error", timeout=90000)
                err = page.evaluate("window.__error||''")
                if err:
                    print(f"[render] alert {i}: {err}", file=sys.stderr)
                    page.close()
                    continue
                slug = f"alert-{a['time'][:13].replace('-', '').replace('T', '')}-{i}"
                png = media / f"{slug}.png"
                png.write_bytes(_b64(page.evaluate("__png()")))
                a["png"] = png.name
                if shutil.which("ffmpeg"):
                    with tempfile.TemporaryDirectory() as td:
                        for k in range(int(seconds * fps)):
                            Path(td, f"f{k:04d}.jpg").write_bytes(_b64(page.evaluate(f"__frame({k / fps})")))
                        mp4 = media / f"{slug}.mp4"
                        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", f"{td}/f%04d.jpg",
                                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "24",
                                        "-movflags", "+faststart", str(mp4)], check=True)
                        a["mp4"] = mp4.name
                page.close()
                print(f"[render] alert {i} → {a.get('png')} {a.get('mp4', '')}")
            browser.close()
    finally:
        srv.shutdown()
    return items


def main():
    private = "--private" in sys.argv
    path = (PRIVATE if private else cfg.ROOT / "out") / "alerts.json"
    items = cfg.load_json(path, [])
    if not any(a.get("media") for a in items):
        print("[render] nothing to render")
        return 0
    render(items, fmt=cfg.env("CARD_FORMAT", "post"), private=private)
    cfg.save_json(path, items)
    return 0


if __name__ == "__main__":
    sys.exit(main())
