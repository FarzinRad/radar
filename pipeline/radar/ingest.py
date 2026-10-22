"""اجرای اصلی: دریافت → سطح خطر → سامانه‌ها → web/data/latest.json → هشدارها.

    python -m radar.ingest            # از ریشه‌ی pipeline
    python -m radar.ingest --test-city تهران   # یک هشدار آزمایشی برای همین شهر می‌سازد
"""
import argparse
import math
import sys
from datetime import datetime, timezone

from . import alerts, config as cfg, fetch, hazards as hz, subs, systems


def idw(points, lon, lat, p=2.0):
    num = den = 0.0
    for x, y, v in points:
        d = math.hypot((x - lon) * math.cos(math.radians(lat)), y - lat)
        if d < .05:
            return v
        if d > 6:
            continue
        w = 1 / d ** p
        num += w * v
        den += w
    return num / den if den else 0.0


def build(now):
    cities = cfg.cities()
    try:        # محل‌های اختصاصی مشترکان ربات؛ هیچ‌وقت در latest.json عمومی نمی‌روند
        extra = [{"n": q["n"], "lat": q["lat"], "lon": q["lon"], "p": None, "pfa": q.get("pfa") or "", "m": False,
                  "el": q.get("el"), "x": True, "near": q["city"]} for q in subs.places()]
    except Exception as e:
        print(f"[ingest] subscribers unreadable: {type(e).__name__}", file=sys.stderr)
        extra = []
    cities = cities + extra
    geo = cfg.load_json(cfg.PIPE / "geo_lonlat.json")
    climate = cfg.load_json(cfg.PIPE / "climate.json", {})
    P, F = cfg.PAST_H, cfg.FUT_H
    n = P + F + 1
    print(f"[ingest] now={now.isoformat()} cities={len(cities) - len(extra)} private={len(extra)}", flush=True)

    raw = fetch.fetch_cities(cities, cfg.MODELS, now, P, F)
    dpts = [(c["lat"], c["lon"]) for c in cities] + [(e["lonlat"][1], e["lonlat"][0]) for e in geo["ext"]]
    try:
        dust_all = fetch.fetch_dust(dpts, now, P, F)
    except RuntimeError as e:      # گردوغبار اختیاری است؛ نبودش نباید کل اجرا را بخواباند
        print(f"[ingest] dust failed: {e}", file=sys.stderr)
        dust_all = [[None] * n for _ in dpts]

    model_ok = {m[0]: 0 for m in cfg.MODELS}
    out_cities = []
    for c, r, dust in zip(cities, raw, dust_all):
        c = {**c, "el": c.get("el") if c.get("el") is not None else round(r["elev"] or 0)}
        th = hz.thresholds(c, climate)
        ifs = r["s"]["ifs"] if hz.has_data(r["s"]["ifs"]) else None
        clean = {}
        for rid, *_ in cfg.MODELS:
            if hz.has_data(r["s"][rid]):
                clean[rid] = hz.clean_model(r["s"][rid], hz.clean_model(ifs) if ifs and rid == "aifs" else None)
                model_ok[rid] += 1
        if not clean:
            continue
        dust = [round(x) if x is not None else None for x in dust]
        series = {"mix": hz.mix(clean), **clean}
        s_out = {}
        for k, s in series.items():
            L = hz.levels(s, dust, th)
            s_out[k] = {**s, "L": {h: hz.enc(v) for h, v in L.items()}}
        out_cities.append({"n": c["n"], "lat": c["lat"], "lon": c["lon"], "p": c["p"], "pfa": c["pfa"],
                           "m": c["m"], "el": c["el"], "thr": th, "dust": dust, "s": s_out,
                           **({"x": True, "near": c["near"]} if c.get("x") else {})})

    # میدان شبکه‌ای و سامانه‌ها
    grid = None
    sysl = []
    try:
        cols = fetch.fetch_grid(cfg, now, P, F)
        steps = list(range(0, P + 72 + 1, systems.STEP))
        g = {"t": [k - P for k in steps], "pr": [], "sn": [], "ws": [], "wd": [], "cape": [], "du": []}
        dsrc = [(lo, la, d) for (la, lo), d in zip(dpts, dust_all)]
        for k in steps:
            g["pr"].append([round(sum((x or 0) for x in col["precipitation"][k:k + 3]), 1) for col in cols])
            g["sn"].append([round(sum((x or 0) for x in col["snowfall"][k:k + 3]), 1) for col in cols])
            g["ws"].append([round(col["wind_speed_10m"][k] or 0) for col in cols])
            g["wd"].append([round(col["wind_direction_10m"][k] or 0) for col in cols])
            g["cape"].append([round(max((x or 0) for x in col["cape"][k:k + 3]) / 10) * 10 for col in cols])
            pts = [(lo, la, d[k]) for lo, la, d in dsrc if d[k] is not None]
            g["du"].append([round(idw(pts, cfg.GRID_LON0 + i * cfg.GRID_D, cfg.GRID_LAT0 + j * cfg.GRID_D))
                            for j in range(cfg.GRID_NY) for i in range(cfg.GRID_NX)])
        grid = {"lat0": cfg.GRID_LAT0, "lon0": cfg.GRID_LON0, "d": cfg.GRID_D, "nx": cfg.GRID_NX, "ny": cfg.GRID_NY,
                "model": "IFS", **g}
        sysl = systems.track(g["pr"], g["sn"], g["cape"], g["t"], geo)
    except Exception as e:      # نقشه بدون میدان هم کار می‌کند
        print(f"[ingest] grid failed: {e}", file=sys.stderr)

    private = [c for c in out_cities if c.get("x")]
    out_cities = [c for c in out_cities if not c.get("x")]
    models = [{"id": rid, "name": nm, "full": full, "ok": model_ok[rid] > 0} for rid, _, nm, full in cfg.MODELS]
    return {"v": 1, "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "t0": now.isoformat(timespec="seconds"), "now": P, "hours": n, "source": "Open-Meteo",
            "models": models, "cities": out_cities, "grid": grid, "systems": sysl}, private


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--test-city", default="", help="یک هشدار آزمایشی برای این شهر بساز (بدون توجه به سطح)")
    ap.add_argument("--no-alerts", action="store_true")
    a = ap.parse_args(argv)
    now = fetch.hour_floor_utc()
    data, private = build(now)
    if not data["cities"]:
        print("[ingest] no city data; keeping previous latest.json", file=sys.stderr)
        return 1
    found = [] if a.no_alerts else alerts.detect(data, now, test_city=cfg.env("TEST_CITY", a.test_city), private=private)
    pub = [x for x in found if not x.get("private")]
    priv = [x for x in found if x.get("private")]
    data["alerts"] = alerts.history(pub)
    cfg.save_json(cfg.DATA_OUT / "latest.json", data, compact=True)
    cfg.save_json(cfg.ROOT / "out" / "alerts.json", pub)
    # هشدار محل‌های اختصاصی جدا می‌ماند: نه در سایت، نه در artifact، نه در لاگ
    cfg.save_json(cfg.ROOT / "out" / "private" / "alerts.json", priv)
    cfg.save_json(cfg.ROOT / "out" / "private" / "places.json", {"now": data["now"], "t0": data["t0"], "cities": private}, compact=True)
    print(f"[ingest] wrote {len(data['cities'])} cities, {len(data['systems'])} systems, {len(pub)} alerts (+{len(priv)} private)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
