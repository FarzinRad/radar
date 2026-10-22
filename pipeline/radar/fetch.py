"""دریافت داده از Open-Meteo (رایگان، بدون کلید، فقط غیرتجاری)."""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

FORECAST = "https://api.open-meteo.com/v1/forecast"
AIRQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

CITY_VARS = ["temperature_2m", "relative_humidity_2m", "precipitation", "snowfall",
             "wind_speed_10m", "wind_gusts_10m", "cape"]
GRID_VARS = ["precipitation", "snowfall", "wind_speed_10m", "wind_direction_10m", "cape"]


def get_json(url, params, tries=4):
    q = urllib.parse.urlencode(params, safe=",")
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": "radar-personal/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # شبکه یا 429؛ با فاصله‌ی بیشتر دوباره
            last = e
            time.sleep(3 * (i + 1) ** 2)
    raise RuntimeError(f"Open-Meteo failed: {url}: {last}")


def _multi(url, lats, lons, params, chunk=50):
    """درخواست چندنقطه‌ای در تکه‌های کوچک تا آدرس بلند نشود. همیشه فهرست برمی‌گرداند."""
    out = []
    for i in range(0, len(lats), chunk):
        la, lo = lats[i:i + chunk], lons[i:i + chunk]
        p = {**params, "latitude": ",".join(f"{x:.3f}" for x in la), "longitude": ",".join(f"{x:.3f}" for x in lo)}
        d = get_json(url, p)
        out.extend(d if isinstance(d, list) else [d])
    return out


def hour_floor_utc(now=None):
    now = now or datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def _slice(times, now, past, fut):
    """اندیس ساعت now-past تا now+fut روی آرایه‌ی زمان‌های Open-Meteo (GMT)."""
    key = now.strftime("%Y-%m-%dT%H:00")
    i = times.index(key)
    return i - past, i + fut + 1


def fetch_cities(cities, models, now, past, fut):
    """برمی‌گرداند: [{elev, s:{rid:{var:[...]}}}] به ترتیب شهرها."""
    om = ",".join(m[1] for m in models)
    res = _multi(FORECAST, [c["lat"] for c in cities], [c["lon"] for c in cities],
                 {"hourly": ",".join(CITY_VARS), "models": om, "past_days": 2, "forecast_days": 5,
                  "timezone": "GMT"})
    out = []
    for d in res:
        h = d["hourly"]
        a, b = _slice(h["time"], now, past, fut)
        s = {}
        for rid, oid, *_ in models:
            s[rid] = {v: (h.get(f"{v}_{oid}") or [None] * len(h["time"]))[a:b] for v in CITY_VARS}
        out.append({"elev": d.get("elevation"), "s": s})
    return out


def fetch_dust(points, now, past, fut):
    """PM10 از CAMS؛ برای هر نقطه یک آرایه."""
    res = _multi(AIRQ, [p[0] for p in points], [p[1] for p in points],
                 {"hourly": "pm10", "past_days": 2, "forecast_days": 5, "timezone": "GMT"})
    out = []
    for d in res:
        h = d["hourly"]
        try:
            a, b = _slice(h["time"], now, past, fut)
            out.append(h["pm10"][a:b])
        except ValueError:
            out.append([None] * (past + fut + 1))
    return out


def fetch_grid(cfg, now, past, fut):
    lats, lons = [], []
    for j in range(cfg.GRID_NY):
        for i in range(cfg.GRID_NX):
            lats.append(cfg.GRID_LAT0 + j * cfg.GRID_D)
            lons.append(cfg.GRID_LON0 + i * cfg.GRID_D)
    res = _multi(FORECAST, lats, lons, {"hourly": ",".join(GRID_VARS), "models": cfg.GRID_MODEL,
                                        "past_days": 2, "forecast_days": 5, "timezone": "GMT"}, chunk=100)
    cols = []
    for d in res:
        h = d["hourly"]
        a, b = _slice(h["time"], now, past, fut)
        cols.append({v: h[v][a:b] for v in GRID_VARS})
    return cols   # به ترتیب سطرها (عرض) و بعد ستون‌ها (طول)


def fetch_daily_precip(lat, lon, start, end):
    d = get_json(ARCHIVE, {"latitude": f"{lat:.3f}", "longitude": f"{lon:.3f}", "start_date": start,
                           "end_date": end, "daily": "precipitation_sum", "timezone": "GMT"})
    return [x for x in d["daily"]["precipitation_sum"] if x is not None]
