import gzip
import json
from datetime import datetime, timedelta, timezone

from radar import archive, score


def test_week_is_saturday_to_friday_tehran():
    # جمعه ۲۳:۰۰ تهران = جمعه ۱۹:۳۰ UTC → هنوز هفته‌ی قبل
    assert score.week_of(datetime(2026, 10, 23, 19, 30, tzinfo=timezone.utc)) == "2026-10-17"
    # شنبه ۰۰:۳۰ تهران = جمعه ۲۱:۰۰ UTC → هفته‌ی تازه
    assert score.week_of(datetime(2026, 10, 23, 21, 0, tzinfo=timezone.utc)) == "2026-10-24"


def test_scorecard_sums_not_means(tmp_path, monkeypatch):
    city = {"n": "تهران", "lat": 35.69, "lon": 51.39, "p": "IRN-3216", "pfa": "تهران", "m": True}
    monkeypatch.setattr(score.cfg, "cities", lambda: [city])
    run = datetime(2026, 10, 17, 0, 0, tzinfo=timezone.utc)
    L = archive.LEADS
    snap = {"run": run.isoformat(), "leads": L, "cities": {"تهران": {
        "ifs": {"T": [12.0] * len(L), "g": [30] * len(L), "p3": [2.0] * len(L)},
        "gfs": {"T": [10.0] * len(L), "g": [30] * len(L), "p3": [0.0] * len(L)}}}}
    f = archive.path_for(tmp_path, snap["run"])
    f.parent.mkdir(parents=True)
    f.write_bytes(gzip.compress(json.dumps(snap).encode()))

    def truth(cities, wid, now):      # حقیقت ثابت: ۱۰ درجه، بارش ۱ میلی‌متر در ساعت
        s, e = score.week_range_utc("2026-10-10")
        hrs = [(s + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(24 * 21)]
        return {"تهران": {"t": hrs, "T": [10.0] * len(hrs), "P": [1.0] * len(hrs), "G": [20] * len(hrs)}}, wid < "2026-10-17"

    sc = score.build(tmp_path, now=datetime(2026, 11, 1, tzinfo=timezone.utc), truth_fn=truth)
    w = [x["id"] for x in sc["weeks"]]
    assert "2026-10-17" in w
    wi = w.index("2026-10-17")
    ifs, gfs = sc["db"]["ifs"], sc["db"]["gfs"]
    assert ifs["t2m"]["all"][wi]["6"] == [2.0, 1]          # |12-10|
    assert gfs["t2m"]["teh"][wi]["6"] == [0.0, 1]
    assert ifs["prcp"]["all"][wi]["6"] == [1, 0, 0, 1]     # پیش‌بینی ۲ و واقعی ۳ میلی‌متر → hit
    assert gfs["prcp"]["all"][wi]["6"] == [0, 1, 0, 1]     # miss
    assert ifs["gust"]["p:IRN-3216"][wi]["24"] == [10.0, 1]
