"""ساعت و روز به وقت تهران، با رقم فارسی."""
from datetime import timedelta

from .config import TEHRAN_OFFSET_MIN

FA = "۰۱۲۳۴۵۶۷۸۹"
DAYS = {-1: "دیروز", 0: "امروز", 1: "فردا", 2: "پس‌فردا", 3: "سه روز بعد", 4: "چهار روز بعد"}


def fa(v):
    return "".join(FA[int(c)] if c.isdigit() else c for c in str(v))


def teh(dt):
    return dt + timedelta(minutes=TEHRAN_OFFSET_MIN)


JMONTH = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def g2j(gy, gm, gd):
    """میلادی به شمسی (الگوریتم jalaali)."""
    gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + gdm[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


def stamp(now_utc):
    """«۳۰ آبان، ساعت ۱۶:۳۰» به وقت تهران."""
    t = teh(now_utc)
    _, m, d = g2j(t.year, t.month, t.day)
    return f"{fa(d)} {JMONTH[m - 1]}، ساعت {fa(t.strftime('%H:%M'))}"


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
