"""فرستادن هشدارها به تلگرام، بله، ntfy، X و اینستاگرام.

هر کانال فقط وقتی فعال است که Secretهایش تنظیم شده باشد؛ خطای یک کانال بقیه را نمی‌خواباند.

    python -m radar.notify                 # همه‌ی هشدارهای out/alerts.json
    python -m radar.notify --whoami        # شناسه‌ی چت‌هایی که اخیراً به ربات پیام داده‌اند (برای TELEGRAM_CHAT_IDS)
"""
import argparse
import sys
import time

import requests

from . import config as cfg, subs
from .render import MEDIA, PRIVATE, PRIVATE_MEDIA


def _ids(name):
    return [x.strip() for x in cfg.env(name).replace("\n", ",").split(",") if x.strip()]


def _public(name):
    base = cfg.env("PUBLIC_BASE_URL").rstrip("/")
    return f"{base}/media/{name}" if base and name else ""


# ---------- تلگرام و بله (API هم‌شکل) ----------
BOTS = {"telegram": ("tg", "https://api.telegram.org", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_IDS"),
        "bale": ("bale", "https://tapi.bale.ai", "BALE_BOT_TOKEN", "BALE_CHAT_IDS")}
_FILE_IDS = {}      # (ربات، فایل) → file_id؛ هر ویدیو فقط یک بار آپلود می‌شود
_SUBS = None


def _subs():
    global _SUBS
    if _SUBS is None:
        try:
            _SUBS = subs.load()
        except Exception as e:
            print(f"[notify] subscribers unreadable: {type(e).__name__}", file=sys.stderr)
            _SUBS = {}
    return _SUBS


def _media(a, name):
    return (PRIVATE_MEDIA if a.get("private") else MEDIA) / name


def recipients(prefix, groups_env, a):
    """گروه‌های ثابت (Secret) + مشترکانی که همین شهر یا محل را دنبال می‌کنند."""
    S = _subs()
    if a.get("kind") == "report":
        mine = [k for k, v in S.items() if v.get("daily", True)]
    else:
        mine = subs.recipients(S, a["city"])
    out = [] if a.get("private") else _ids(groups_env)
    out += [k.split(":", 1)[1] for k in mine if k.startswith(prefix + ":")]
    return list(dict.fromkeys(out))


def _post(url, method, data, field=None, fname=None, key=None, a=None):
    if field and key in _FILE_IDS:
        return requests.post(f"{url}/{method}", data={**data, field: _FILE_IDS[key]}, timeout=60)
    if field:
        with open(_media(a, fname), "rb") as f:
            r = requests.post(f"{url}/{method}", data=data, files={field: f}, timeout=120)
        try:
            res = r.json().get("result") or {}
            obj = res.get(field) or res.get("video") or res.get("document") or (res.get("photo") or [{}])[-1]
            if obj.get("file_id"):
                _FILE_IDS[key] = obj["file_id"]
        except ValueError:
            pass
        return r
    return requests.post(f"{url}/{method}", data=data, timeout=60)


def bot_send(name, a):
    prefix, api, tok_env, groups_env = BOTS[name]
    tok = cfg.env(tok_env)
    if not tok:
        return
    chats = recipients(prefix, groups_env, a)
    url = f"{api}/bot{tok}"
    cap = a["text"][:1024]
    ok = 0
    for chat in chats:
        sent = False
        for method, field, fname in (("sendAnimation", "animation", a.get("mp4")), ("sendVideo", "video", a.get("mp4")),
                                     ("sendPhoto", "photo", a.get("png"))):
            if not fname or sent:
                continue
            r = _post(url, method, {"chat_id": chat, "caption": cap}, field, fname, (name, method, fname), a)
            sent = r.ok and r.json().get("ok")
        if not sent:
            r = requests.post(f"{url}/sendMessage", data={"chat_id": chat, "text": a["text"],
                                                          "disable_web_page_preview": "true"}, timeout=60)
            sent = r.ok
            if not sent:     # شناسه‌ی چت در لاگ عمومی Actions چاپ نمی‌شود
                print(f"[notify] {name}: a send failed ({r.status_code})", file=sys.stderr)
        ok += bool(sent)
        time.sleep(.06)     # زیر سقف ۳۰ پیام در ثانیه‌ی تلگرام
    print(f"[notify] {name}: {ok}/{len(chats)} chats")


def telegram(a):
    bot_send("telegram", a)


def bale(a):
    bot_send("bale", a)


# ---------- ntfy ----------
def ntfy(a):
    topic = cfg.env("NTFY_TOPIC")
    if not topic:
        return
    server = cfg.env("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    lines = a["text"].split("\n")
    h = {"Title": lines[0].encode("utf-8"), "Priority": "5" if a.get("level", 0) >= 3 else "4",
         "Tags": "warning"}
    if _public(a.get("png")):
        h["Attach"] = _public(a.get("png"))
    r = requests.post(f"{server}/{topic}", data="\n".join(lines[1:]).encode("utf-8"), headers=h, timeout=30)
    print(f"[notify] ntfy: {r.status_code}")


# ---------- X (توییتر) ----------
def x_post(a):
    keys = [cfg.env(k) for k in ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")]
    if not all(keys):
        return
    from requests_oauthlib import OAuth1
    auth = OAuth1(*keys)
    body = {"text": a.get("short") or a["text"][:280]}
    if a.get("png"):
        with open(MEDIA / a["png"], "rb") as f:
            r = requests.post("https://api.x.com/2/media/upload", auth=auth, files={"media": f},
                              data={"media_category": "tweet_image"}, timeout=120)
        if r.ok:
            mid = (r.json().get("data") or {}).get("id") or r.json().get("media_id_string")
            if mid:
                body["media"] = {"media_ids": [str(mid)]}
        else:
            print(f"[notify] X media upload → {r.status_code} {r.text[:200]}", file=sys.stderr)
    r = requests.post("https://api.x.com/2/tweets", auth=auth, json=body, timeout=60)
    print(f"[notify] X: {r.status_code} {'' if r.ok else r.text[:200]}")


# ---------- اینستاگرام (Graph API؛ حساب Professional) ----------
def _wait_public(url, tries=24):
    for _ in range(tries):
        try:
            if requests.head(url, timeout=15).status_code == 200:
                return True
        except requests.RequestException:
            pass
        time.sleep(10)
    return False


def instagram(a):
    ig, tok = cfg.env("IG_USER_ID"), cfg.env("IG_ACCESS_TOKEN")
    if not (ig and tok and cfg.env("PUBLIC_BASE_URL")):
        return
    g = f"https://graph.facebook.com/{cfg.env('IG_GRAPH_VERSION', 'v23.0')}"
    modes = [m.strip() for m in cfg.env("IG_MODE", "story").split(",") if m.strip()]
    vid, img = _public(a.get("mp4")), _public(a.get("png"))
    if not (vid or img) or not _wait_public(vid or img):
        print("[notify] instagram: media not public yet; skipped", file=sys.stderr)
        return
    for mode in modes:
        p = {"access_token": tok}
        if mode == "story":
            p.update({"media_type": "STORIES", **({"video_url": vid} if vid else {"image_url": img})})
        elif mode == "reel" and vid:
            p.update({"media_type": "REELS", "video_url": vid, "caption": a["text"][:2200]})
        else:
            p.update({"image_url": img, "caption": a["text"][:2200]})
        r = requests.post(f"{g}/{ig}/media", data=p, timeout=60)
        if not r.ok:
            print(f"[notify] instagram {mode} container → {r.status_code} {r.text[:300]}", file=sys.stderr)
            continue
        cid = r.json()["id"]
        for _ in range(30):         # ویدیو باید اول پردازش شود
            s = requests.get(f"{g}/{cid}", params={"fields": "status_code", "access_token": tok}, timeout=30).json()
            if s.get("status_code") in ("FINISHED", None) or s.get("status_code") == "ERROR":
                break
            time.sleep(8)
        r = requests.post(f"{g}/{ig}/media_publish", data={"creation_id": cid, "access_token": tok}, timeout=60)
        print(f"[notify] instagram {mode}: {r.status_code} {'' if r.ok else r.text[:300]}")


CHANNELS = [telegram, bale, ntfy, x_post, instagram]


def whoami():  # noqa: C901
    tok = cfg.env("TELEGRAM_BOT_TOKEN")
    if not tok:
        print("TELEGRAM_BOT_TOKEN را در محیط بگذار.")
        return 1
    r = requests.get(f"https://api.telegram.org/bot{tok}/getUpdates", timeout=30).json()
    seen = {}
    for u in r.get("result", []):
        m = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or {}
        ch = m.get("chat") or {}
        if ch:
            seen[ch["id"]] = ch.get("title") or ch.get("username") or ch.get("first_name")
    for k, v in seen.items():
        print(f"{k}\t{v}")
    if not seen:
        print("پیامی نیست: ربات را به گروه اضافه کن، در گروه یک پیام بفرست و دوباره اجرا کن.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--whoami", action="store_true")
    ap.add_argument("--only", default="", help="فقط این کانال‌ها، مثل telegram,x")
    ap.add_argument("--private", action="store_true", help="هشدارهای محل‌های اختصاصی (out/private)")
    args = ap.parse_args(argv)
    if args.whoami:
        return whoami()
    items = cfg.load_json((PRIVATE if args.private else cfg.ROOT / "out") / "alerts.json", [])
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    if args.private:        # محل‌های اختصاصی فقط به خود مشترک، از راه ربات
        only = (only or {"telegram", "bale"}) & {"telegram", "bale"}
    for a in items:
        for ch in CHANNELS:
            name = ch.__name__.replace("x_post", "x")
            if only and name not in only:
                continue
            if a.get("kind") == "report" and name not in cfg.env("REPORT_CHANNELS", "telegram,bale,ntfy,x,instagram"):
                continue
            try:
                ch(a)
            except Exception as e:      # یک کانال خراب نباید بقیه را بخواباند
                print(f"[notify] {name} failed: {e}", file=sys.stderr)
    print(f"[notify] {len(items)} {'private ' if args.private else ''}alerts processed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
