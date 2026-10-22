"""ردیابی سامانه‌ها روی میدان بارش شبکه‌ای: لکه‌ها را برچسب می‌زند و بین گام‌های ۳ ساعته به هم وصل می‌کند.

خروجی هم‌شکل دمو است: هر سامانه kf = [[t, lon, lat, شدت ۰..۱, شعاع به درجه], ...]
"""
import math

from . import config as cfg

STEP = 3            # ساعت
MIN_MM = 1.5        # بارش ۳ ساعته‌ی لازم برای عضویت در لکه
LINK_DEG = 4.0      # بیشترین جابه‌جایی مرکز بین دو گام


def _pip(lon, lat, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _blobs(field, nx, ny):
    seen, out = set(), []
    for j in range(ny):
        for i in range(nx):
            if (i, j) in seen or field[j * nx + i] < MIN_MM:
                continue
            stack, cells = [(i, j)], []
            seen.add((i, j))
            while stack:
                a, b = stack.pop()
                cells.append((a, b))
                for da in (-1, 0, 1):
                    for db in (-1, 0, 1):
                        c, d = a + da, b + db
                        if 0 <= c < nx and 0 <= d < ny and (c, d) not in seen and field[d * nx + c] >= MIN_MM:
                            seen.add((c, d))
                            stack.append((c, d))
            if len(cells) < 2:
                continue
            w = sum(field[b * nx + a] for a, b in cells)
            lon = sum((cfg.GRID_LON0 + a * cfg.GRID_D) * field[b * nx + a] for a, b in cells) / w
            lat = sum((cfg.GRID_LAT0 + b * cfg.GRID_D) * field[b * nx + a] for a, b in cells) / w
            mx = max(field[b * nx + a] for a, b in cells)
            out.append({"lon": lon, "lat": lat, "int": min(1.0, mx / 18.0),
                        "rad": max(.8, min(3.0, math.sqrt(len(cells)) * cfg.GRID_D * .45)), "n": len(cells)})
    return out


def _origin(lon, lat, geo):
    if _pip(lon, lat, geo["iran"]):
        p = min(geo["provs"], key=lambda q: (q["c"][0] - lon) ** 2 + (q["c"][1] - lat) ** 2)
        return f"داخل ایران، {p['fa']}"
    c = min(geo["countries"], key=lambda q: (q["lonlat"][0] - lon) ** 2 + (q["lonlat"][1] - lat) ** 2)
    sea = "دریای عرب" if lat < 24 and lon > 57 else "خلیج فارس" if lat < 28.5 and 48 < lon < 57 else None
    return sea or c["fa"]


def track(grid_pr3, grid_sn3, grid_cape, times, geo):
    """grid_pr3[k] = بارش ۳ ساعته‌ی همه‌ی نقاط در گام k؛ times[k] = ساعت نسبت به اکنون."""
    nx, ny = cfg.GRID_NX, cfg.GRID_NY
    tracks, live = [], []
    for k, t in enumerate(times):
        bl = _blobs(grid_pr3[k], nx, ny)
        nxt, used = [], set()
        for tr in live:
            last = tr["pts"][-1]
            best, bd = None, LINK_DEG
            for bi, b in enumerate(bl):
                if bi in used:
                    continue
                d = math.hypot((b["lon"] - last["lon"]) * math.cos(math.radians(b["lat"])), b["lat"] - last["lat"])
                if d < bd:
                    best, bd = bi, d
            if best is not None:
                used.add(best)
                tr["pts"].append({**bl[best], "t": t, "k": k})
                nxt.append(tr)
        for bi, b in enumerate(bl):
            if bi not in used:
                tr = {"pts": [{**b, "t": t, "k": k}]}
                tracks.append(tr)
                nxt.append(tr)
        live = nxt

    def near_iran(p):
        return _pip(p["lon"], p["lat"], geo["iran"]) or any(
            math.hypot(p["lon"] - x, p["lat"] - y) < 3.0 for x, y in geo["iran"][::6])

    keep = [tr for tr in tracks if len(tr["pts"]) >= 3 and any(near_iran(p) for p in tr["pts"])]
    keep.sort(key=lambda tr: -max(p["int"] for p in tr["pts"]) * math.sqrt(len(tr["pts"])))
    keep = sorted(keep[:6], key=lambda tr: tr["pts"][0]["t"])
    out = []
    for i, tr in enumerate(keep):
        p0 = tr["pts"][0]
        snow = sum(sum(grid_sn3[p["k"]]) for p in tr["pts"])
        rain = sum(sum(grid_pr3[p["k"]]) for p in tr["pts"])
        conv = max(max(grid_cape[p["k"]]) for p in tr["pts"])
        kind = "برف و کولاک" if snow * .7 > rain * .4 else "بارش شدید و رعدوبرق" if conv > 900 else "سامانه‌ی بارشی"
        out.append({"id": f"SYS-{i + 1:02d}", "origin": _origin(p0["lon"], p0["lat"], geo), "kind": kind,
                    "kf": [[p["t"], round(p["lon"], 2), round(p["lat"], 2), round(p["int"], 2), round(p["rad"], 2)]
                           for p in tr["pts"]]})
    return out
