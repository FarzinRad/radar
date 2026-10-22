"""ساعت و روز به وقت تهران، با رقم فارسی."""
from datetime import timedelta

from .config import TEHRAN_OFFSET_MIN

FA = "۰۱۲۳۴۵۶۷۸۹"
DAYS = {-1: "دیروز", 0: "امروز", 1: "فردا", 2: "پس‌فردا", 3: "سه روز بعد", 4: "چهار روز بعد"}


def fa(v):
    return "".join(FA[int(c)] if c.isdigit() else c for c in str(v))


def teh(dt):
    return dt + timedelta(minutes=TEHRAN_OFFSET_MIN)


def at(now_utc, h):
    """«فردا ۱۳:۳۰» برای ساعت h نسبت به now_utc."""
    t = teh(now_utc + timedelta(hours=h))
    d = (t.date() - teh(now_utc).date()).days
    return f"{DAYS.get(d, '')} {fa(t.strftime('%H:%M'))}".strip()


def eta_text(e, now_utc):
    if not e or e.get("none"):
        return "احتمالاً نمی‌رسد"
    if e.get("now"):
        return "در حال وقوع"
    pr = fa(round(e["p"] * 100)) + "٪"
    if e["a"] == e["b"]:
        return f"{pr}، حدود {at(now_utc, e['a'])}"
    return f"{pr} بین {at(now_utc, e['a'])} تا {at(now_utc, e['b'])}"
