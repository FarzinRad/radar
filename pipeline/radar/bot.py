"""ربات تلگرام و بله: دوستان خودشان شهر یا روستایشان را انتخاب می‌کنند.

بدون سرور: هر چند دقیقه یک بار در GitHub Actions پیام‌های تازه را با getUpdates می‌خواند و جواب می‌دهد.

    python -m radar.bot            # یک دور خواندن و جواب دادن

فرمان‌ها: /start [کد دعوت]، نوشتن اسم شهر یا روستا، /now، /list، /stop، /daily، /help
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

import requests

from . import alerts, config as cfg, subs
from .notify import BOTS

OFFSET = cfg.STATE_DIR / "bot_offset.json"
COMMANDS = [("start", "شروع و راهنما"), ("now", "وضعیت الان شهرهای من"), ("list", "شهرهایی که دنبال می‌کنم"),
            ("stop", "حذف یک شهر یا همه"), ("daily", "روشن/خاموش کردن گزارش صبحگاهی"), ("help", "راهنما")]
HELP = ("اسم شهر یا روستایت را بنویس (مثلاً «رشت» یا «اسالم») تا هر وقت هوا آن‌جا خطرناک شد، "
        "کارت هشدار با «چه کنم» برایت بیاید.\n\n"
        "/now وضعیت الان · /list شهرهای من · /stop رشت حذف یک شهر · /stop حذف همه · /daily گزارش صبحگاهی\n\n"
        "جواب ربات ممکن است تا چند دقیقه طول بکشد. پیش‌بینی مدل است، نه هشدار رسمی.")


def _data():
    """آخرین داده: فایل محلی (در اجرای اصلی) یا همان‌که روی سایت است."""
    d = cfg.load_json(cfg.DATA_OUT / "latest.json")
    base = cfg.env("PUBLIC_BASE_URL").rstrip("/")
    if not d and base:
        try:
            with urllib.request.urlopen(f"{base}/data/latest.json", timeout=60) as r:
                d = json.loads(r.read().decode("utf-8"))
        except Exception:
            d = None
    return d


def _keyboard():
    names = [c["n"] for c in cfg.cities() if c.get("m")]
    rows = [names[i:i + 3] for i in range(0, len(names), 3)]
    return json.dumps({"keyboard": [[{"text": n} for n in r] for r in rows], "resize_keyboard": True,
                       "one_time_keyboard": True}, ensure_ascii=False)


class Bot:
    def __init__(self, name):
        self.prefix, api, tok_env, _ = BOTS[name]
        self.name = name
        self.url = f"{api}/bot{cfg.env(tok_env)}"
        self.on = bool(cfg.env(tok_env))

    def call(self, method, **data):
        try:
            r = requests.post(f"{self.url}/{method}", data=data, timeout=60)
            return r.json() if r.ok else {}
        except (requests.RequestException, ValueError):
            return {}

    def say(self, chat, text, kb=False):
        self.call("sendMessage", chat_id=chat, text=text[:4000], disable_web_page_preview="true",
                  **({"reply_markup": _keyboard()} if kb else {}))


def handle(bot, S, msg, ctx):
    """یک پیام را جواب می‌دهد. S دیکشنری مشترکان است و همین‌جا تغییر می‌کند."""
    chat = msg.get("chat") or {}
    text = (msg.get("text") or "").strip()
    if not chat or not text:
        return
    key = f"{bot.prefix}:{chat['id']}"
    cmd, _, arg = text.partition(" ")
    cmd = cmd.split("@")[0].lower() if cmd.startswith("/") else ""
    arg = arg.strip() if cmd else text
    invite = cfg.env("BOT_INVITE_CODE")
    me = S.get(key)

    if cmd == "/start":
        if invite and not me and arg != invite:
            bot.say(chat["id"], "این ربات خصوصی است. لینک دعوت را از کسی که تو را دعوت کرده بگیر.")
            return
        S.setdefault(key, {"places": [], "daily": True, "since": ctx["now"].isoformat()[:10]})
        bot.say(chat["id"], "سلام! من رادار هستم و وقتی هوای شهرت خطرناک شود خبرت می‌کنم.\n\n" + HELP, kb=True)
        return
    if not me:
        if invite:
            bot.say(chat["id"], "این ربات خصوصی است. لینک دعوت را از کسی که تو را دعوت کرده بگیر.")
            return
        me = S.setdefault(key, {"places": [], "daily": True, "since": ctx["now"].isoformat()[:10]})
    if cmd == "/help":
        bot.say(chat["id"], HELP, kb=True)
    elif cmd == "/list":
        ps = me["places"]
        bot.say(chat["id"], ("شهرهای تو:\n" + "\n".join(f"• {p['n']}" + (f" (نزدیک {p['city']})" if p.get("custom") else "")
                                                         for p in ps)) if ps else "هنوز شهری انتخاب نکرده‌ای. اسم شهرت را بنویس.",
                kb=not ps)
    elif cmd == "/stop":
        if arg:
            me["places"] = [p for p in me["places"] if subs.norm(p["n"]) != subs.norm(arg)]
            bot.say(chat["id"], f"«{arg}» حذف شد.")
        else:
            S.pop(key, None)
            bot.say(chat["id"], "همه‌ی اشتراک‌هایت حذف شد. هر وقت خواستی /start بزن.")
    elif cmd == "/daily":
        me["daily"] = not me.get("daily", True)
        bot.say(chat["id"], "گزارش صبحگاهی " + ("روشن شد." if me["daily"] else "خاموش شد."))
    elif cmd == "/now":
        names = [arg] if arg else [p["n"] for p in me["places"]]
        if not names:
            bot.say(chat["id"], "اول اسم شهرت را بنویس.", kb=True)
        for n in names[:4]:
            bot.say(chat["id"], status(n, me, ctx))
    elif cmd:
        bot.say(chat["id"], "این فرمان را نمی‌شناسم.\n\n" + HELP)
    else:
        add_place(bot, chat["id"], me, arg, ctx)


def add_place(bot, chat, me, text, ctx):
    p = subs.resolve(text, ctx["cities"])
    if not p:
        bot.say(chat, f"«{text}» را پیدا نکردم. اسم را کامل‌تر یا با املای دیگر بنویس.")
        return
    if any(q["n"] == p["n"] and q["lat"] == p["lat"] for q in me["places"]):
        bot.say(chat, f"«{p['n']}» را از قبل دنبال می‌کنی.\n\n" + status(p["n"], me, ctx))
        return
    if len(me["places"]) >= subs.MAX_PLACES:
        bot.say(chat, f"حداکثر {subs.MAX_PLACES} محل. اول یکی را با /stop حذف کن.")
        return
    me["places"].append(p)
    if p.get("custom"):
        note = (f"«{p['n']}» ({p['pfa']}) اضافه شد. از اجرای بعدی (حداکثر ۳ ساعت دیگر) پیش‌بینی همین نقطه را جدا می‌گیرم؛ "
                f"تا آن موقع نزدیک‌ترین شهر پایش، {p['city']} ({p['km']} کیلومتر)، را ببین.")
        bot.say(chat, note + "\n\n" + status(p["city"], me, ctx))
    else:
        bot.say(chat, f"«{p['n']}» اضافه شد. هر وقت سطح خطر نارنجی یا قرمز شد خبرت می‌کنم.\n\n" + status(p["n"], me, ctx))


def status(name, me, ctx):
    d = ctx["data"]
    if not d:
        return "داده در دسترس نیست؛ کمی بعد دوباره امتحان کن."
    c = next((x for x in d["cities"] if subs.norm(x["n"]) == subs.norm(name)), None)
    if not c:
        p = next((q for q in me["places"] if subs.norm(q["n"]) == subs.norm(name)), None)
        if p and p.get("custom"):
            c = next((x for x in ctx["private"] if x["n"] == p["n"]), None)
            if not c:
                c = next((x for x in d["cities"] if x["n"] == p["city"]), None)
    if not c:
        return f"«{name}» جزو شهرهای پایش نیست. اسمش را بفرست تا اضافه‌اش کنم."
    return alerts.status_text(c, d["now"], datetime.fromisoformat(d["t0"]))


def run(loop_s=0):
    bots = [b for b in (Bot("telegram"), Bot("bale")) if b.on]
    if not bots:
        print("[bot] no bot token")
        return 0
    if not subs.enabled():
        print("[bot] BOT_STATE_KEY missing: subscriptions cannot be saved", file=sys.stderr)
        return 1
    S = subs.load()
    off = cfg.load_json(OFFSET, {})
    ctx = {"cities": cfg.cities(), "data": _data(), "now": datetime.now(timezone.utc),
           "private": cfg.load_json(cfg.ROOT / "out" / "private" / "places.json", {}).get("cities", [])}
    before = json.dumps(S, sort_keys=True, ensure_ascii=False)
    n = 0
    end = time.time() + loop_s
    for b in bots:
        me = b.call("getMe")
        if not me.get("ok"):        # توکن غلط یا API در دسترس نیست؛ بدون چاپ خود توکن
            print(f"[bot] {b.name}: getMe failed — check the token secret", file=sys.stderr)
            continue
        print(f"[bot] {b.name}: connected as @{me['result'].get('username')}")
        hook = b.call("getWebhookInfo").get("result") or {}
        if hook.get("url"):         # با webhook فعال، getUpdates هیچ پیامی برنمی‌گرداند
            b.call("deleteWebhook")
            print(f"[bot] {b.name}: removed an old webhook")
        if not off.get(f"{b.name}_cmds"):
            ok = b.call("setMyCommands", commands=json.dumps([{"command": c, "description": d} for c, d in COMMANDS],
                                                             ensure_ascii=False)).get("ok")
            off[f"{b.name}_cmds"] = 1 if ok else 0
    while True:
        for b in bots:
            res = b.call("getUpdates", offset=off.get(b.name, 0), timeout=0, allowed_updates='["message"]')
            print(f"[bot] {b.name}: {len(res.get('result', []))} new messages" if res.get("ok") else f"[bot] {b.name}: getUpdates failed")
            for u in res.get("result", []):
                off[b.name] = u["update_id"] + 1
                try:
                    handle(b, S, u.get("message") or {}, ctx)
                    n += 1
                except Exception as e:     # یک پیام خراب نباید بقیه را بخواباند
                    print(f"[bot] message failed: {type(e).__name__}", file=sys.stderr)
        if time.time() >= end:
            break
        time.sleep(5)
    if json.dumps(S, sort_keys=True, ensure_ascii=False) != before:
        subs.save(S)
    cfg.save_json(OFFSET, off)
    print(f"[bot] {n} messages, {len(S)} subscribers")       # بدون نام و شناسه؛ لاگ Actions عمومی است
    return 0


if __name__ == "__main__":
    sys.exit(run(int(cfg.env("BOT_LOOP_SECONDS", "0"))))
