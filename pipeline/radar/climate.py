"""ساخت آستانه‌های باران هر شهر از اقلیم ERA5 (صدک‌های ۹۰، ۹۵ و ۹۹ بارش روزانه‌ی روزهای بارانی).

درخواست چندساله در Open-Meteo چند «فراخوانی» حساب می‌شود، پس این اسکریپت ادامه‌پذیر است:
هر اجرا فقط تا سقف بودجه شهر می‌سازد و دفعه‌ی بعد از همان‌جا ادامه می‌دهد.

    python -m radar.climate --budget 1500       # در GitHub Actions، روزی یک بار
    python -m radar.climate --budget 9000       # یک بار روی لپ‌تاپ خودت تا زودتر کامل شود
"""
import argparse
import sys
from datetime import date

from . import config as cfg, fetch

OUT = cfg.PIPE / "climate.json"
WET_MM = 1.0


def pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * q
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=int(cfg.env("CLIMATE_BUDGET", "1500")))
    ap.add_argument("--years", type=int, default=int(cfg.env("CLIMATE_YEARS", "10")))
    a = ap.parse_args(argv)
    clim = cfg.load_json(OUT, {})
    watch = set(cfg.watch()["cities"])
    todo = sorted((c for c in cfg.cities() if c["n"] not in clim), key=lambda c: (c["n"] not in watch, not c["m"]))
    cost = max(1, round(a.years * 365 / 14))       # تخمین وزن هر شهر در سهمیه‌ی روزانه
    n = max(1, a.budget // cost)
    end = date(date.today().year - 1, 12, 31)
    start = date(end.year - a.years + 1, 1, 1)
    done = 0
    for c in todo[:n]:
        try:
            xs = fetch.fetch_daily_precip(c["lat"], c["lon"], start.isoformat(), end.isoformat())
        except RuntimeError as e:
            print(f"[climate] stop at {c['n']}: {e}", file=sys.stderr)
            break
        wet = [x for x in xs if x >= WET_MM]
        if len(wet) < 20:
            clim[c["n"]] = {"r24": None, "wet": len(wet), "years": f"{start.year}-{end.year}"}
        else:
            clim[c["n"]] = {"r24": [round(pct(wet, q), 1) for q in (.90, .95, .99)], "wet": len(wet),
                            "years": f"{start.year}-{end.year}"}
        cfg.save_json(OUT, clim)
        done += 1
        print(f"[climate] {c['n']}: {clim[c['n']]['r24']} ({len(wet)} wet days)")
    left = len(todo) - done
    print(f"[climate] built {done}, {left} cities left")
    return 0


if __name__ == "__main__":
    sys.exit(main())
