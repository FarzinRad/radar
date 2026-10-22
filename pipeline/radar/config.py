"""تنظیمات مشترک پایپلاین رادار."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # ریشه‌ی مخزن
PIPE = ROOT / "pipeline"
WEB = ROOT / "web"
DATA_OUT = WEB / "data"
STATE_DIR = ROOT / "state"

# (شناسه در رادار، نام مدل در Open-Meteo، نام کوتاه، نام کامل)
MODELS = [
    ("ifs", "ecmwf_ifs025", "IFS", "ECMWF IFS"),
    ("aifs", "ecmwf_aifs025_single", "AIFS", "ECMWF AIFS"),
    ("gfs", "gfs_seamless", "GFS", "NOAA GFS"),
    ("icon", "icon_seamless", "ICON", "DWD ICON"),
]
GRID_MODEL = "ecmwf_ifs025"      # میدان شبکه‌ای نقشه فقط از یک مدل می‌آید تا سهمیه‌ی API کم مصرف شود

PAST_H = 24                       # ساعت‌های گذشته روی خط زمان
FUT_H = 84                        # ساعت‌های آینده (۷۲ + ۱۲ برای پنجره‌های جلورو)
TEHRAN_OFFSET_MIN = 210           # UTC+03:30، بدون ساعت تابستانی از ۱۴۰۱

# شبکه‌ی نقشه: ۱۶ تا ۴۶ شمالی، ۲۸ تا ۷۴ شرقی
GRID_LAT0, GRID_LON0, GRID_D = 16.0, 28.0, 2.0
GRID_NY, GRID_NX = 16, 24

# آستانه‌های ثابت
GUST_THR = [55, 75, 95]                  # km/h
DUST_THR = [155, 255, 355]               # PM10 μg/m³
SNOW_THR_LOW, SNOW_THR_HIGH = [3, 8, 15], [5, 12, 20]   # cm در ۲۴ ساعت؛ بالای ۱۵۰۰ متر

# نرمال تقریبی بارش ماهانه‌ی فصل سرد به تفکیک استان (میلی‌متر)؛ فقط تا وقتی که اقلیم ERA5 شهر ساخته نشده
PROV_NORM = {'گیلان': 160, 'مازندران': 110, 'گلستان': 60, 'اردبیل': 40, 'آذربایجان شرقی': 35, 'آذربایجان غربی': 45,
             'کردستان': 60, 'کرمانشاه': 55, 'ایلام': 50, 'لرستان': 50, 'خوزستان': 30, 'کهگیلویه و بویراحمد': 70,
             'چهارمحال و بختیاری': 50, 'فارس': 25, 'بوشهر': 25, 'هرمزگان': 10, 'سیستان و بلوچستان': 6, 'کرمان': 10,
             'یزد': 6, 'اصفهان': 12, 'تهران': 25, 'البرز': 30, 'قزوین': 30, 'زنجان': 35, 'قم': 12, 'مرکزی': 25,
             'همدان': 35, 'سمنان': 12, 'خراسان رضوی': 15, 'خراسان شمالی': 25, 'خراسان جنوبی': 8}


def env(name, default=""):
    v = os.environ.get(name, "")
    return v.strip() if v.strip() else default


def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path, obj, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if compact else None,
                     indent=None if compact else 1)
    path.write_text(txt, encoding="utf-8")


def cities():
    return load_json(PIPE / "cities.json", [])


def watch():
    """شهرهایی که برایشان هشدار فرستاده می‌شود (pipeline/watch.json)."""
    w = load_json(PIPE / "watch.json", {})
    names = w.get("cities") or [c["n"] for c in cities() if c.get("m")]
    return {**w, "cities": names}
