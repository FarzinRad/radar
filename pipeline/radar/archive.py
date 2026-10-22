"""ثبت پیش‌بینی‌ها برای کارنامه: از هر اجرای مدل‌ها یک خلاصه‌ی فشرده در شاخه‌ی data.

فقط اجراهای ۰۰ و ۱۲ UTC (مدل‌ها تازه‌اند)، گام‌های ۳ ساعته تا ۷۲ ساعت، دما، تندباد و بارش ۳ ساعته.
حجم: حدود ۵۰ کیلوبایت فشرده برای هر اجرا، یعنی کمتر از ۴۰ مگابایت در سال.

    python -m radar.archive --dir ../archive
"""
import argparse
import gzip
import json
import sys
from datetime import datetime
from pathlib import Path

from . import config as cfg

LEADS = list(range(0, 73, 3))


def snapshot(data):
    i0 = data["now"]
    cities = {}
    for c in data["cities"]:
        d = {}
        for mid, s in c["s"].items():
            if mid == "mix":
                continue
            d[mid] = {"T": [s["T"][i0 + L] for L in LEADS],
                      "g": [s["g"][i0 + L] for L in LEADS],
                      # بارش ساعتی Open-Meteo مجموع ساعت قبل است؛ پس ۳ ساعته‌ی منتهی به L
                      "p3": [round(sum(s["pr"][i0 + L - 2:i0 + L + 1]), 1) for L in LEADS]}
        cities[c["n"]] = d
    return {"run": data["t0"], "leads": LEADS, "cities": cities}


def path_for(root, run):
    t = datetime.fromisoformat(run)
    return Path(root) / "forecasts" / t.strftime("%Y/%m") / f"{t.strftime('%Y-%m-%dT%H')}.json.gz"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--force", action="store_true", help="بدون توجه به ساعت اجرا")
    a = ap.parse_args(argv)
    data = cfg.load_json(cfg.DATA_OUT / "latest.json")
    if not data:
        print("[archive] no latest.json")
        return 1
    hours = {int(h) for h in cfg.env("ARCHIVE_HOURS", "0,12").split(",")}
    run = datetime.fromisoformat(data["t0"])
    if run.hour not in hours and not a.force:
        print(f"[archive] {run.hour:02d}Z not archived")
        return 0
    p = path_for(a.dir, data["t0"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(gzip.compress(json.dumps(snapshot(data), separators=(",", ":"), ensure_ascii=False).encode("utf-8")))
    print(f"[archive] {p.relative_to(a.dir)} {p.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
