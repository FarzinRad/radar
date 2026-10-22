"""مشترکان ربات: هر چت چند شهر یا روستا را دنبال می‌کند.

فایل رمزنگاری‌شده در state/subscribers.enc است (کلید: Secret به نام BOT_STATE_KEY)،
چون مخزن عمومی است و شناسه‌ی چت و محل زندگی دوستانت نباید دیده شود.
"""
import base64
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request

from . import config as cfg

PATH = cfg.STATE_DIR / "subscribers.enc"
MAX_PLACES = 8
GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"


def _fernet():
    key = cfg.env("BOT_STATE_KEY")
    if not key:
        return None
    from cryptography.fernet import Fernet
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))


def enabled():
    return _fernet() is not None


def load():
    f = _fernet()
    if not f or not PATH.exists():
        return {}
    return json.loads(f.decrypt(PATH.read_bytes()).decode("utf-8"))


def save(subs):
    f = _fernet()
    if not f:
        raise RuntimeError("BOT_STATE_KEY تنظیم نشده؛ مشترکان ذخیره نمی‌شوند")
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_bytes(f.encrypt(json.dumps(subs, ensure_ascii=False, sort_keys=True).encode("utf-8")))


def norm(s):
    s = s.replace("ي", "ی").replace("ك", "ک").replace("ة", "ه").replace("‌", "").replace("‌", "")
    return re.sub(r"\s+", "", s).strip().lower()


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def nearest_city(lat, lon, cities=None):
    cities = cities or cfg.cities()
    c = min(cities, key=lambda c: _km((lat, lon), (c["lat"], c["lon"])))
    return c, _km((lat, lon), (c["lat"], c["lon"]))


def resolve(text, cities=None, geocode=True):
    """نام شهر یا روستا → محل. شهرهای پایش مستقیم؛ بقیه با جستجوی GeoNames (Open-Meteo)."""
    cities = cities or cfg.cities()
    q = norm(text)
    if not q:
        return None
    for c in cities:
        if norm(c["n"]) == q:
            return {"n": c["n"], "lat": c["lat"], "lon": c["lon"], "pfa": c["pfa"], "city": c["n"], "custom": False}
    if not geocode:
        return None
    url = f"{GEOCODE}?{urllib.parse.urlencode({'name': text.strip(), 'count': 10, 'language': 'fa', 'countryCode': 'IR'})}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "radar-personal/1.0"}), timeout=20) as r:
            res = json.loads(r.read().decode("utf-8")).get("results") or []
    except Exception:
        return None
    if not res:
        return None
    r = max(res, key=lambda x: (norm(x["name"]) == q, x.get("population") or 0))
    near, km = nearest_city(r["latitude"], r["longitude"], cities)
    return {"n": r["name"], "lat": round(r["latitude"], 3), "lon": round(r["longitude"], 3),
            "pfa": (r.get("admin1") or "").replace("‎", ""), "city": near["n"], "km": round(km),
            "el": r.get("elevation"), "custom": True}


def places(subs=None):
    """همه‌ی محل‌های اختصاصی (غیر از شهرهای پایش) که کسی دنبالشان می‌کند، بدون تکرار."""
    out = {}
    for s in (subs if subs is not None else load()).values():
        for p in s.get("places", []):
            if p.get("custom"):
                out[f"{p['lat']:.2f},{p['lon']:.2f}"] = p
    return list(out.values())


def recipients(subs, place_name):
    return [k for k, s in subs.items() if any(p["n"] == place_name for p in s.get("places", []))]
