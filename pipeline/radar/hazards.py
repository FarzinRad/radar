"""منطق علمی رادار: آستانه‌های محلی، سطح خطر ساعتی، اجماع مدل‌ها و ETA.

سطح‌ها: ۰ عادی، ۱ زرد، ۲ نارنجی، ۳ قرمز. این تنها جایی است که سطح‌ها حساب می‌شوند؛
فرانت همین رشته‌های سطح را از latest.json می‌خواند.
"""
from . import config as cfg

HAZARDS = ["rain", "snow", "wind", "ltg", "dust"]
LVLN = ["عادی", "زرد", "نارنجی", "قرمز"]
HZN = {"rain": "باران سنگین", "snow": "برف", "wind": "باد شدید", "ltg": "رعدوبرق و تگرگ", "dust": "گردوغبار"}
EMOJI = ["🟢", "🟡", "🟠", "🔴"]
SNOW_WATER = 0.7     # هر سانتی‌متر برف تازه حدود ۰٫۷ میلی‌متر آب


def comp(v, th):
    if v is None:
        return 0
    return 3 if v >= th[2] else 2 if v >= th[1] else 1 if v >= th[0] else 0


def thresholds(city, climate=None):
    """آستانه‌های همان شهر. باران از اقلیم ERA5 خود شهر، وگرنه تخمین از نرمال استان."""
    norm = cfg.PROV_NORM.get(city.get("pfa", ""), 25)
    c = (climate or {}).get(city["n"])
    if c and c.get("r24"):
        r24, src = [round(max(3.0, c["r24"][0]), 1), round(max(5.0, c["r24"][1]), 1), round(max(8.0, c["r24"][2]), 1)], "era5"
    else:
        p99 = 0.4 * norm + 8
        r24, src = [round(max(3, .35 * p99), 1), round(.6 * p99, 1), round(p99, 1)], "est"
    el = city.get("el") or 0
    return {"r24": r24, "s24": cfg.SNOW_THR_HIGH if el > 1500 else cfg.SNOW_THR_LOW,
            "g": cfg.GUST_THR, "d": cfg.DUST_THR, "norm": norm, "src": src}


def _num(x, d=0.0):
    return d if x is None else x


def clean_model(raw, fallback=None):
    """یک مدل را تمیز می‌کند: نبودِ تندباد (AIFS) از سرعت باد، نبودِ CAPE از مدل خواهر."""
    n = len(raw["temperature_2m"])
    fb = fallback or {}
    out = {"T": [], "rh": [], "w": [], "g": [], "pr": [], "sn": [], "cape": []}
    for h in range(n):
        w = _num(raw["wind_speed_10m"][h])
        g = raw["wind_gusts_10m"][h]
        g = g if g is not None else w * 1.5
        cape = raw["cape"][h]
        if cape is None and fb:
            cape = fb["cape"][h]
        out["T"].append(round(_num(raw["temperature_2m"][h]), 1))
        out["rh"].append(round(_num(raw["relative_humidity_2m"][h], 50)))
        out["w"].append(round(w))
        out["g"].append(round(g))
        out["pr"].append(round(_num(raw["precipitation"][h]), 2))
        out["sn"].append(round(_num(raw["snowfall"][h]), 2))
        out["cape"].append(round(_num(cape)))
    return out


def has_data(raw):
    return any(v is not None for v in raw["precipitation"]) and any(v is not None for v in raw["temperature_2m"])


def mix(models):
    """اجماع: میانگین ساعتی مدل‌های در دسترس."""
    ms = list(models.values())
    n = len(ms[0]["T"])
    out = {}
    for k in ms[0]:
        nd = 2 if k in ("pr", "sn") else 1 if k == "T" else 0
        out[k] = [round(sum(m[k][h] for m in ms) / len(ms), nd) if nd else round(sum(m[k][h] for m in ms) / len(ms))
                  for h in range(n)]
    return out


def levels(s, dust, th):
    """سطح هر خطر در هر ساعت. باران و برف روی پنجره‌ی ۶ ساعته‌ی جلورو، با ۰٫۶ آستانه‌ی ۲۴ ساعته."""
    n = len(s["T"])
    rain = [max(0.0, s["pr"][h] - s["sn"][h] * SNOW_WATER) for h in range(n)]
    r6t = [x * .6 for x in th["r24"]]
    s6t = [x * .6 for x in th["s24"]]
    L = {k: [] for k in HAZARDS}
    for h in range(n):
        L["rain"].append(comp(sum(rain[h:h + 6]), r6t))
        L["snow"].append(comp(sum(s["sn"][h:h + 6]), s6t))
        L["wind"].append(comp(s["g"][h], th["g"]))
        cape, pr = s["cape"][h], s["pr"][h]
        L["ltg"].append(2 if cape >= 800 and pr >= .5 else 1 if cape >= 400 and pr >= .3 else 0)
        L["dust"].append(comp(dust[h] if dust else None, th["d"]))
    L["all"] = [max(L[k][h] for k in HAZARDS) for h in range(n)]
    return L


def enc(arr):
    return "".join(str(int(x)) for x in arr)


def dec(s):
    return [int(ch) for ch in s]


def eta(members, i0, horizon=72, lvl=2):
    """ETA احتمالاتی: سهم اعضایی که تا هر ساعت به سطح نارنجی می‌رسند.

    members: فهرست آرایه‌های سطح کلی (یکی برای هر مدل). خروجی ساعت‌ها نسبت به اکنون است.
    """
    if not members:
        return {"none": True, "p": 0}
    nowc = sum(1 for L in members if L[i0] >= lvl)
    if nowc / len(members) >= .5:
        return {"now": True, "p": nowc / len(members)}
    hits = []
    for L in members:
        for h in range(i0, min(len(L), i0 + horizon + 1)):
            if L[h] >= lvl:
                hits.append(h - i0)
                break
    p = len(hits) / len(members)
    if p < .2:
        return {"none": True, "p": p}
    hits.sort()

    def q(f):
        return hits[min(len(hits) - 1, int(f * (len(hits) - 1)))]
    return {"p": round(p, 2), "a": q(.15), "b": q(.85), "med": q(.5)}


def summary(city, s, L, dust, i0, horizon=24):
    """خلاصه‌ی خطر یک شهر برای هشدار: سطح اوج، خطر غالب، مقدار فیزیکی، بازه‌ی زمانی."""
    end = i0 + horizon
    peak = max(L["all"][i0:end])
    dom, dl = None, 0
    for k in HAZARDS:
        m = max(L[k][i0:end])
        if m > dl:
            dl, dom = m, k
    rain = [max(0.0, s["pr"][h] - s["sn"][h] * SNOW_WATER) for h in range(len(s["pr"]))]
    span = max(48, horizon)          # مقدار فیزیکی از همان بازه‌ای که سطح از آن آمده
    r24 = max(sum(rain[h:h + 24]) for h in range(i0, i0 + span))
    s24 = max(sum(s["sn"][h:h + 24]) for h in range(i0, i0 + span))
    gmax = max(s["g"][i0:i0 + span + 6])
    dmax = max((x or 0) for x in dust[i0:i0 + span + 6]) if dust else 0
    val = {"rain": (round(r24), "میلی‌متر در ۲۴ ساعت"), "snow": (round(s24), "سانتی‌متر برف در ۲۴ ساعت"),
           "wind": (round(gmax), "km/h تندباد"), "ltg": (None, ""), "dust": (round(dmax), "μg/m³ PM10")}
    win = None
    idx = [h for h in range(i0, i0 + 72) if L["all"][h] >= 2]
    if idx:
        win = [idx[0] - i0, idx[-1] - i0 + 1]
    return {"peak": peak, "dom": dom, "value": val[dom][0] if dom else None, "unit": val[dom][1] if dom else "",
            "win": win, "r24": round(r24, 1), "s24": round(s24, 1), "gmax": gmax, "dmax": dmax}


# ---------- اقدام‌ها (هم‌خوان با فرانت) ----------
ACT = {
    "rain": {1: "چتر و کفش مناسب؛ آرام‌تر رانندگی کن.", 2: "از زیرگذر، مسیل و کنار رود دور بمان.",
             3: "بیرون نرو مگر ضروری؛ از آب روان رد نشو."},
    "snow": {1: "برای سفر جاده‌ای زنجیر چرخ همراه داشته باش.", 2: "از گردنه‌ها صرف‌نظر کن؛ باک پر، لباس گرم.",
             3: "سفر جاده‌ای نه؛ اگر گیر افتادی در خودرو بمان."},
    "wind": {1: "اشیای سبک بالکن و پشت‌بام را جمع کن.", 2: "زیر درخت، تابلو و داربست نایست.",
             3: "بیرون نرو؛ از پنجره‌ها فاصله بگیر."},
    "ltg": {1: "به آسمان نگاه کن؛ با اولین رعد به ساختمان برو.", 2: "قاعده‌ی ۳۰-۳۰: با رعد به ساختمان برو و تا ۳۰ دقیقه بیرون نیا.",
            3: "قاعده‌ی ۳۰-۳۰؛ روی قله یا زیر درخت تنها نایست."},
    "dust": {1: "گروه‌های حساس فعالیت بیرون را کم کنند.", 2: "پنجره‌ها بسته؛ بیرون ماسک N95.",
             3: "بیرون نرو؛ دید کم و رانندگی خطرناک است."},
}
