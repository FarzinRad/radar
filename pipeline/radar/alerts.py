"""تشخیص هشدار: فقط وقتی وضعیت عوض شود پیام می‌رود.

قواعد (PRD): تشدید سطح، رفع خطر، جابه‌جایی ETA بیش از ۲ ساعت؛ هر شهر حداکثر یک بار در ۳ ساعت
مگر سطح بالا برود؛ ساعات سکوت ۰۰ تا ۰۷ تهران فقط قرمز.
"""
from datetime import datetime, timedelta
from urllib.parse import quote

from . import config as cfg, hazards as hz, subs
from .timefmt import at, eta_text, fa, teh

STATE = cfg.STATE_DIR / "alert_state.json"
HIST = cfg.STATE_DIR / "alert_history.json"


def _min_level():
    return int(cfg.env("ALERT_MIN_LEVEL", "2"))


def site_url():
    return cfg.env("PUBLIC_BASE_URL", "").rstrip("/")


def message(a, now):
    """متن پیام به سبک PRD؛ کوتاه، با نوع خطر، مقدار، بازه و اقدام."""
    lv, dom = a["level"], a["dom"]
    link = f"{site_url()}/?city={quote(a.get('near') or a['city'])}" if site_url() else ""
    if a["kind"] == "clear":
        lines = [f"✅ {a['city']} · رفع خطر", f"سطح از {hz.LVLN[a['prev']]} به {hz.LVLN[lv]} رسید. سامانه رد شده یا پیش‌بینی لغو شده."]
    else:
        place = a['city'] + (f" (نزدیک {a['near']})" if a.get("near") else "")
        head = f"{hz.EMOJI[lv]} {place} · {hz.HZN.get(dom, 'هوای خطرناک')} ({hz.LVLN[lv]})"
        if a.get("test"):
            head = "🧪 آزمایشی · " + head
        val = f"{fa(a['value'])} {a['unit']}" if a.get("value") is not None else ""
        win = f"از {at(now, a['win'][0])} تا {at(now, a['win'][1])}" if a.get("win") else ""
        lines = [head]
        if val or win:
            lines.append(" · ".join(x for x in (val, win) if x))
        if dom:
            lines.append("چه کنم: " + hz.ACT[dom].get(max(1, lv), hz.ACT[dom][2]))
        lines.append(f"زمان رسیدن: {eta_text(a['eta'], now)}")
        lines.append(f"اجماع: {fa(a['agree'])} از {fa(a['members'])} مدل · Open-Meteo")
    lines.append("راهنمای عمومی است؛ هشدار رسمی را از سازمان هواشناسی بگیر.")
    if link:
        lines.append(link)
    return "\n".join(lines)


def short_message(a, now):
    """نسخه‌ی کوتاه برای X (۲۸۰ نویسه)."""
    if a["kind"] == "clear":
        t = f"✅ {a['city']}: رفع خطر هواشناسی."
    else:
        t = f"{hz.EMOJI[a['level']]} {a['city']} · {hz.HZN.get(a['dom'], '')} · سطح {hz.LVLN[a['level']]}"
        if a.get("win"):
            t += f"\nاز {at(now, a['win'][0])} تا {at(now, a['win'][1])}"
        if a.get("dom"):
            t += "\n" + hz.ACT[a["dom"]].get(max(1, a["level"]), "")
    t += "\nپیش‌بینی مدل، نه هشدار رسمی."
    if site_url():
        t += f"\n{site_url()}/?city={quote(a['city'])}"
    return t[:280]


def _city_view(c, i0, horizon=24):
    mixs = c["s"]["mix"]
    L = {k: hz.dec(v) for k, v in mixs["L"].items()}
    sm = hz.summary(c, mixs, L, c["dust"], i0, horizon)
    members = [hz.dec(c["s"][k]["L"]["all"]) for k in c["s"] if k != "mix"]
    e = hz.eta(members, i0)
    agree = sum(1 for m in members if max(m[i0:i0 + horizon]) >= max(2, sm["peak"]))
    return sm, e, agree, len(members)


def detect(data, now, test_city="", private=()):
    state = cfg.load_json(STATE, {})
    w = cfg.watch()
    watch = set(w["cities"])
    try:        # شهرهایی که مشترکان ربات دنبال می‌کنند هم پایش می‌شوند
        watch |= {q["city"] for s in subs.load().values() for q in s.get("places", []) if not q.get("custom")}
    except Exception:
        pass
    i0 = data["now"]
    hour_teh = teh(now).hour
    quiet = 0 <= hour_teh < 7
    minl = _min_level()
    found = []
    for c in list(data["cities"]) + list(private):
        if not c.get("x") and c["n"] not in watch and c["n"] != test_city:
            continue
        skey = ("x:" + c["n"]) if c.get("x") else c["n"]
        sm, e, agree, mem = _city_view(c, i0, 72 if c["n"] == test_city else int(cfg.env("ALERT_HORIZON_H", "24")))
        lv = sm["peak"]
        st = state.get(skey, {"lvl": 0, "sent": None, "eta": None})
        prev = st["lvl"]
        last = datetime.fromisoformat(st["sent"]) if st.get("sent") else None
        recent = last and now - last < timedelta(hours=3)
        kind = None
        if c["n"] == test_city:
            kind = "test"
        elif lv > prev and lv >= minl:
            kind = "up"
        elif prev >= minl and lv < minl:
            kind = "clear"
        elif lv >= minl and lv == prev and e.get("a") is not None and st.get("eta") is not None \
                and abs(e["a"] - st["eta"]) > 2 and not recent:
            kind = "shift"
        if kind in ("shift", "clear") and recent:
            kind = None
        if kind and quiet and lv < 3 and kind != "test":
            kind = None          # ساعات سکوت: فقط قرمز
        st_new = {"lvl": lv, "sent": st.get("sent"), "eta": e.get("a")}
        if kind:
            a = {"city": c["n"], "prov": c["pfa"], "kind": "up" if kind == "test" else kind, "test": kind == "test",
                 "level": max(lv, 2) if kind == "test" and lv < 2 else lv, "prev": prev,
                 "dom": sm["dom"] or ("rain" if kind == "test" else None), "value": sm["value"], "unit": sm["unit"],
                 "win": sm["win"], "eta": e, "agree": agree, "members": mem,
                 "media": kind in ("up", "test"), "time": now.isoformat(),
                 **({"private": True, "near": c.get("near")} if c.get("x") else {})}
            a["text"] = message(a, now)
            a["short"] = short_message(a, now)
            found.append(a)
            if kind != "test":
                st_new["sent"] = now.isoformat()
        if kind != "test":
            state[skey] = st_new
    found.sort(key=lambda a: (-a["level"], a["city"]))
    d = daily(data, now, state)
    if d:
        found.append(d)
    cap = int(cfg.env("ALERT_MAX_MEDIA", "4"))       # سقف ویدیو در هر اجرا تا دقیقه‌های Actions تمام نشود
    for a in [x for x in found if not x.get("private")][cap:]:
        a["media"] = False
    for a in [x for x in found if x.get("private")][cap:]:
        a["media"] = False
    cfg.save_json(STATE, state)
    return found


def daily(data, now, state):
    """گزارش صبحگاهی (۰۶ تا ۰۹ تهران، یک بار در روز): کارت وضعیت کشور + فهرست شهرهای در خطر."""
    day = teh(now).date().isoformat()
    if cfg.env("DAILY_REPORT", "1") != "1" or not 6 <= teh(now).hour < 9 or state.get("__daily") == day:
        return None
    state["__daily"] = day
    i0 = data["now"]
    rows = []
    for c in data["cities"]:
        mixs = c["s"]["mix"]
        L = {k: hz.dec(v) for k, v in mixs["L"].items()}
        sm = hz.summary(c, mixs, L, c["dust"], i0)
        if sm["peak"] >= 2:
            rows.append((sm["peak"], c["n"], sm["dom"]))
    rows.sort(key=lambda r: (-r[0], r[1]))
    lines = [f"☀️ گزارش صبحگاهی رادار · {fa(teh(now).strftime('%H:%M'))}"]
    lines += [f"{hz.EMOJI[l]} {n}: {hz.HZN.get(k, '')}" for l, n, k in rows[:12]] or ["در ۲۴ ساعت آینده هیچ شهری نارنجی یا قرمز نیست."]
    if len(rows) > 12:
        lines.append(f"و {fa(len(rows) - 12)} شهر دیگر.")
    lines.append("پیش‌بینی مدل، نه هشدار رسمی.")
    if site_url():
        lines.append(site_url())
    return {"city": "", "view": "iran", "kind": "daily", "test": False, "level": rows[0][0] if rows else 0, "dom": None,
            "media": True, "time": now.isoformat(), "text": "\n".join(lines), "short": "\n".join(lines)[:280]}


def history(found):
    h = cfg.load_json(HIST, [])
    h = ([{k: a[k] for k in ("city", "kind", "level", "dom", "time", "test")} for a in found if a["kind"] != "daily"] + h)[:40]
    cfg.save_json(HIST, h)
    return h


def status_text(c, i0, now):
    """جواب «الان چه خبره؟» ربات برای یک شهر یا محل."""
    sm, e, agree, mem = _city_view(c, i0, 72)
    name = c["n"] + (f" (نزدیک {c['near']})" if c.get("near") else "")
    s = c["s"]["mix"]
    nowl = f"الان: {fa(round(s['T'][i0]))}° · رطوبت {fa(round(s['rh'][i0]))}٪ · باد {fa(round(s['w'][i0]))} تا {fa(round(s['g'][i0]))} km/h"
    if sm["peak"] < 1:
        lines = [f"🟢 {name}", "تا ۷۲ ساعت آینده هشداری نیست.", nowl]
    else:
        lv, dom = sm["peak"], sm["dom"]
        lines = [f"{hz.EMOJI[lv]} {name} · {hz.HZN.get(dom, '')} ({hz.LVLN[lv]})"]
        val = f"{fa(sm['value'])} {sm['unit']}" if sm.get("value") is not None else ""
        win = f"از {at(now, sm['win'][0])} تا {at(now, sm['win'][1])}" if sm.get("win") else ""
        if val or win:
            lines.append(" · ".join(x for x in (val, win) if x))
        if dom:
            lines.append("چه کنم: " + hz.ACT[dom].get(max(1, lv), hz.ACT[dom][2]))
        if lv >= 2:
            lines.append(f"زمان رسیدن: {eta_text(e, now)} · اجماع {fa(agree)} از {fa(mem)} مدل")
        lines.append(nowl)
    if site_url() and not c.get("x"):
        lines.append(f"{site_url()}/card.html?city={quote(c['n'])}")
    return "\n".join(lines)
