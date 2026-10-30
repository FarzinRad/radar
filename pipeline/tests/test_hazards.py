from datetime import datetime, timedelta, timezone

import pytest

from radar import alerts, config as cfg, hazards as hz

N = 109
I0 = 24


def series(pr=0.0, sn=0.0, g=20, cape=0, at=None):
    """سری ساعتی ثابت؛ at=(از, تا) مقدارها را فقط در آن بازه می‌گذارد."""
    def v(x, d):
        return [x if at is None or at[0] <= h < at[1] else d for h in range(N)]
    return {"T": [15.0] * N, "rh": [50] * N, "w": [10] * N, "g": v(g, 20), "pr": v(pr, 0.0), "sn": v(sn, 0.0),
            "cape": v(cape, 0)}


TH = {"r24": [10, 20, 30], "s24": [3, 8, 15], "g": [55, 75, 95], "d": [155, 255, 355]}


def test_comp_edges():
    assert hz.comp(9.99, [10, 20, 30]) == 0
    assert hz.comp(10, [10, 20, 30]) == 1
    assert hz.comp(30, [10, 20, 30]) == 3
    assert hz.comp(None, [10, 20, 30]) == 0


def test_rain_uses_six_hour_window_against_sixty_percent_threshold():
    # ۳ میلی‌متر در ساعت به مدت ۶ ساعت = ۱۸ میلی‌متر ≥ ۰٫۶×۳۰ → قرمز
    L = hz.levels(series(pr=3.0, at=(30, 36)), None, TH)
    assert L["rain"][30] == 3
    assert L["rain"][27] == 1          # پنجره‌ی جلورو [h, h+6): ۹ میلی‌متر از رویداد را می‌بیند → زرد
    assert L["rain"][24] == 0
    assert L["rain"][36] == 0
    assert L["all"][30] == 3


def test_snow_is_not_counted_as_rain():
    L = hz.levels(series(pr=2.1, sn=3.0, at=(30, 36)), None, TH)    # همه‌ی بارش برف است
    assert L["rain"][30] == 0
    assert L["snow"][30] == 3


def test_wind_and_lightning_and_dust():
    s = series(g=80, cape=900, pr=.6, at=(40, 42))
    L = hz.levels(s, [300 if 40 <= h < 42 else 0 for h in range(N)], TH)
    assert L["wind"][40] == 2 and L["ltg"][40] == 2 and L["dust"][40] == 2
    assert L["wind"][43] == 0


def test_thresholds_prefer_city_climate():
    c = {"n": "یزد", "pfa": "یزد", "el": 1216}
    est = hz.thresholds(c, {})
    assert est["src"] == "est" and est["r24"][2] == pytest.approx(10.4)
    era = hz.thresholds(c, {"یزد": {"r24": [6, 9, 14]}})
    assert era["src"] == "era5" and era["r24"] == [6, 9, 14]
    assert hz.thresholds({**c, "el": 1600}, {})["s24"] == cfg.SNOW_THR_HIGH


def test_eta_band_and_none():
    def m(first):
        return [0] * N if first is None else [2 if h >= I0 + first else 0 for h in range(N)]
    e = hz.eta([m(4), m(6), m(8), m(10)], I0)
    assert e["p"] == 1.0 and e["a"] == 4 and e["b"] == 8
    assert hz.eta([m(None)] * 5 + [m(5)], I0)["none"] is True        # کمتر از ۲۰٪ اعضا
    assert hz.eta([m(0), m(0), m(None)], I0)["now"] is True


def city(n, mix_all, models_all=None):
    mixs = series()
    L = {k: "0" * N for k in hz.HAZARDS}
    L["rain"] = L["all"] = hz.enc(mix_all)
    s = {"mix": {**mixs, "L": L}}
    for i, a in enumerate(models_all or [mix_all] * 4):
        s[f"m{i}"] = {**mixs, "L": {**L, "all": hz.enc(a)}}
    return {"n": n, "pfa": "تهران", "p": "X", "dust": [0] * N, "s": s}


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(alerts, "STATE", tmp_path / "s.json")
    monkeypatch.setattr(alerts, "HIST", tmp_path / "h.json")
    monkeypatch.setattr(cfg, "watch", lambda: {"cities": ["تهران"]})
    monkeypatch.setenv("DAILY_REPORT", "0")
    return tmp_path


def lv_at(level, start=2):
    return [level if I0 + start <= h < I0 + start + 6 else 0 for h in range(N)]


def test_escalation_then_dedupe_then_clear(tmp_state):
    noon = datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc)      # ۱۲:۳۰ تهران
    d = {"now": I0, "cities": [city("تهران", lv_at(2))]}
    a = alerts.detect(d, noon)
    assert [x["kind"] for x in a] == ["up"] and a[0]["level"] == 2 and a[0]["media"]
    assert "چه کنم" in a[0]["text"]
    assert alerts.detect(d, noon) == []                            # بدون تغییر، پیام تکراری نمی‌رود
    up = {"now": I0, "cities": [city("تهران", lv_at(3))]}
    assert [x["level"] for x in alerts.detect(up, noon)] == [3]    # بالا رفتن سطح، حتی زیر ۳ ساعت
    later = noon.replace(hour=13)
    clear = {"now": I0, "cities": [city("تهران", [0] * N)]}
    assert [x["kind"] for x in alerts.detect(clear, later)] == ["clear"]


def test_quiet_hours_only_red(tmp_state):
    night = datetime(2026, 10, 21, 22, 0, tzinfo=timezone.utc)    # ۰۱:۳۰ تهران
    assert alerts.detect({"now": I0, "cities": [city("تهران", lv_at(2))]}, night) == []
    assert [x["level"] for x in alerts.detect({"now": I0, "cities": [city("تهران", lv_at(3))]}, night)] == [3]


def test_unwatched_city_is_ignored_unless_test(tmp_state):
    noon = datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc)
    d = {"now": I0, "cities": [city("رشت", lv_at(3))]}
    assert alerts.detect(d, noon) == []
    t = alerts.detect(d, noon, test_city="رشت")
    assert t[0]["test"] and t[0]["text"].startswith("🧪")


def test_periodic_report_every_few_hours_and_quiet_at_night(tmp_state, monkeypatch):
    monkeypatch.setenv("DAILY_REPORT", "1")
    monkeypatch.setenv("REPORT_EVERY_H", "4")
    d = {"now": I0, "cities": [city("تهران", [0] * N)]}

    def at_teh(h, m=0):     # ساعت تهران → UTC
        return datetime(2026, 10, 22, 0, 0, tzinfo=timezone.utc) + timedelta(hours=h, minutes=m - 210)

    def rep(t):
        return [a for a in alerts.detect(d, t) if a["kind"] == "report"]
    assert rep(at_teh(3)) == []                           # شب: نه
    r = rep(at_teh(7))
    assert r and "صبحگاهی" in r[0]["text"] and r[0]["view"] == "iran"
    assert rep(at_teh(9)) == []                           # ۲ ساعت بعد: زود است
    r = rep(at_teh(9, 50))                                # اجرای بعدی، حدود ۳ ساعت بعد
    assert r and "گزارش وضعیت" in r[0]["text"]


def test_messages_have_social_handles_not_site_link(tmp_state, monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.github.io/radar")
    noon = datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc)
    d = {"now": I0, "cities": [city("تهران", lv_at(3))]}
    a = alerts.detect(d, noon)[0]
    assert "github.io" not in a["text"] and "github.io" not in a["short"]
    assert "تلگرام" not in a["text"]                      # هیچ سوشالی تنظیم نشده → چیزی نمی‌آید
    monkeypatch.setenv("SOCIAL_TELEGRAM", "mychannel")
    assert alerts.social_line() == "تلگرام @mychannel"
