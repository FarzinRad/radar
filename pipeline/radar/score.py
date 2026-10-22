"""کارنامه‌ی هفتگی مدل‌ها: پیش‌بینی‌های آرشیوشده در برابر ERA5.

هفته‌ها شنبه تا جمعه به وقت تهران‌اند. برای هر هفته جمع خطاها و تعداد نمونه‌ها ذخیره می‌شود، نه میانگین،
تا هر بازه‌ی چندهفته‌ای درست جمع شود. هفته‌ای که ERA5 هنوز کاملش نکرده «موقت» است
و حقیقت زمینی‌اش از تحلیل‌های اخیر Open-Meteo می‌آید؛ اجرای بعدی نهایی‌اش می‌کند.

    python -m radar.score --dir ../archive        # archive/scorecard.json
"""
import argparse
import gzip
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config as cfg, fetch

LEADS = [6, 12, 24, 48, 72]
VARS = ["t2m", "prcp", "gust"]
EVENT_MM = 1.0              # رخداد بارش: دست‌کم ۱ میلی‌متر در ۳ ساعت
MAX_WEEKS = 26
TEH = timedelta(minutes=cfg.TEHRAN_OFFSET_MIN)


def week_of(v_utc):
    t = v_utc + TEH
    sat = t.date() - timedelta(days=(t.weekday() - 5) % 7)
    return sat.isoformat()


def week_range_utc(wid):
    s = datetime.fromisoformat(wid).replace(tzinfo=timezone.utc) - TEH
    return s, s + timedelta(days=7)


def regions(c):
    r = ["all", "p:" + str(c["p"])]
    if c["lon"] < 49 and c["lat"] > 34:
        r.append("nw")
    if c["lon"] < 51 and c["lat"] < 33:
        r.append("sw")
    if c["pfa"] in ("تهران", "البرز"):
        r.append("teh")
    return r


def _empty(v):
    return {"hits": 0, "miss": 0, "fa": 0, "n": 0} if v == "prcp" else {"sum": 0.0, "n": 0}


def fetch_truth(cities, wid, now):
    """ساعتی: دما، بارش و تندباد هر شهر در هفته‌ی wid. اول ERA5، جاهای خالی از تحلیل اخیر."""
    s, e = week_range_utc(wid)
    p = {"hourly": "temperature_2m,precipitation,wind_gusts_10m", "timezone": "GMT",
         "start_date": (s - timedelta(hours=3)).date().isoformat(), "end_date": (e - timedelta(hours=1)).date().isoformat()}
    lats, lons = [c["lat"] for c in cities], [c["lon"] for c in cities]
    era = fetch._multi(fetch.ARCHIVE, lats, lons, p)
    final = True
    out = {}
    recent = None
    for c, d in zip(cities, era):
        h = d["hourly"]
        T, P, G = h["temperature_2m"], h["precipitation"], h["wind_gusts_10m"]
        if any(x is None for x in T + P + G):
            final = False
            if recent is None:      # ERA5 هنوز نرسیده: از تحلیل‌های اخیر (موقت)
                recent = fetch._multi(fetch.FORECAST, lats, lons, {**p, "models": "best_match"})
            r = recent[cities.index(c)]["hourly"]
            idx = {t: i for i, t in enumerate(r["time"])}

            def fill(a, k):
                return [x if x is not None else r[k][idx[t]] if t in idx else None for x, t in zip(a, h["time"])]
            T, P, G = fill(T, "temperature_2m"), fill(P, "precipitation"), fill(G, "wind_gusts_10m")
        out[c["n"]] = {"t": h["time"], "T": T, "P": P, "G": G}
    return out, final


def load_snapshots(root):
    for f in sorted(Path(root, "forecasts").rglob("*.json.gz")):
        try:
            yield json.loads(gzip.decompress(f.read_bytes()).decode("utf-8"))
        except (OSError, ValueError):
            continue


def build(root, now=None, truth_fn=fetch_truth):
    now = now or datetime.now(timezone.utc)
    root = Path(root)
    cities = {c["n"]: c for c in cfg.cities()}
    models = [m[0] for m in cfg.MODELS]
    snaps = list(load_snapshots(root))
    weeks = set()
    for sn in snaps:
        run = datetime.fromisoformat(sn["run"])
        for L in LEADS:
            v = run + timedelta(hours=L)
            wid = week_of(v)
            if week_range_utc(wid)[1] <= now:       # فقط هفته‌های تمام‌شده
                weeks.add(wid)
    weeks = sorted(weeks)[-MAX_WEEKS:]
    if not weeks:
        return None
    regs = sorted({r for c in cities.values() for r in regions(c)})
    db = {m: {v: {g: [{str(L): _empty(v) for L in LEADS} for _ in weeks] for g in regs} for v in VARS} for m in models}
    meta = []
    truth = {}
    tdir = root / "truth"
    for wi, wid in enumerate(weeks):
        cache = tdir / f"{wid}.json.gz"
        if cache.exists():
            truth[wid], final = json.loads(gzip.decompress(cache.read_bytes()).decode("utf-8")), True
        else:
            truth[wid], final = truth_fn(list(cities.values()), wid, now)
            if final:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(gzip.compress(json.dumps(truth[wid], separators=(",", ":"), ensure_ascii=False).encode()))
        meta.append({"id": wid, "final": final, "n": 0})
    widx = {w: i for i, w in enumerate(weeks)}
    for sn in snaps:
        run = datetime.fromisoformat(sn["run"])
        for L in LEADS:
            v = run + timedelta(hours=L)
            wid = week_of(v)
            if wid not in widx:
                continue
            wi, key = widx[wid], v.strftime("%Y-%m-%dT%H:00")
            k = sn["leads"].index(L)
            for name, per in sn["cities"].items():
                c, tr = cities.get(name), truth[wid].get(name)
                if not c or not tr or key not in tr["t"]:
                    continue
                j = tr["t"].index(key)
                tT, tG = tr["T"][j], tr["G"][j]
                tP = sum(x for x in tr["P"][max(0, j - 2):j + 1] if x is not None) if j >= 2 else None
                for m, f in per.items():
                    if m not in db:
                        continue
                    for g in regions(c):
                        cell = db[m]
                        if tT is not None:
                            x = cell["t2m"][g][wi][str(L)]
                            x["sum"] += abs(f["T"][k] - tT)
                            x["n"] += 1
                        if tG is not None:
                            x = cell["gust"][g][wi][str(L)]
                            x["sum"] += abs(f["g"][k] - tG)
                            x["n"] += 1
                        if tP is not None:
                            x = cell["prcp"][g][wi][str(L)]
                            fy, ty = f["p3"][k] >= EVENT_MM, tP >= EVENT_MM
                            x["hits"] += fy and ty
                            x["miss"] += (not fy) and ty
                            x["fa"] += fy and not ty
                            x["n"] += 1
                meta[wi]["n"] += 1
    for m in db.values():           # هر خانه آرایه: [جمع خطا، n] یا [hits، miss، fa، n] تا فایل سبک بماند
        for v in m.values():
            for g in v.values():
                for w in g:
                    for L, x in w.items():
                        w[L] = [x["hits"], x["miss"], x["fa"], x["n"]] if "hits" in x else [round(x["sum"], 1), x["n"]]
    return {"generated": now.isoformat(timespec="seconds"), "leads": LEADS, "vars": VARS, "models": models,
            "weeks": meta, "truth": "ERA5 (Open-Meteo)", "event_mm": EVENT_MM, "db": db}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    a = ap.parse_args(argv)
    sc = build(a.dir)
    if not sc:
        print("[score] no complete week archived yet")
        return 0
    out = Path(a.dir) / "scorecard.json"
    out.write_text(json.dumps(sc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"[score] {len(sc['weeks'])} weeks → {out} ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
