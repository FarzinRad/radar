import json
from datetime import datetime, timezone

from radar import alerts, hazards as hz, notify

N, I0 = 109, 24


def city(n, all_levels, m=True):
    L = {k: "0" * N for k in hz.HAZARDS}
    L["dust"] = L["all"] = hz.enc(all_levels)
    return {"n": n, "m": m, "s": {"mix": {"L": L}}}


def red_from(h):
    return [3 if I0 + h <= x < I0 + h + 4 else 0 for x in range(N)]


def test_red_cities_now_or_within_72h_sorted_by_first():
    d = {"now": I0, "cities": [city("زابل", red_from(30)), city("اهواز", red_from(0)), city("رشت", [2] * N),
                               city("یزد", red_from(80))]}
    r = alerts.red_cities(d)
    assert [x["city"] for x in r] == ["اهواز", "زابل"]          # رشت نارنجی است، یزد بعد از ۷۲ ساعت
    assert r[1]["first"] == 30 and r[1]["dom"] == "dust"
    a = alerts.album(d, datetime(2026, 11, 6, 9, tzinfo=timezone.utc))
    assert a["kind"] == "album" and "همین حالا" in a["text"] and "زابل: گردوغبار" in a["text"]


def test_album_is_one_telegram_message_and_reuses_file_ids(tmp_path, monkeypatch):
    for k in range(3):
        (tmp_path / f"c{k}.mp4").write_bytes(b"x")
    monkeypatch.setattr(notify, "MEDIA", tmp_path)
    notify._FILE_IDS.clear()
    calls = []

    class R:
        ok = True

        def __init__(self, n):
            self.n = n

        def json(self):
            return {"ok": True, "result": [{"video": {"file_id": f"id{k}"}} for k in range(self.n)]}

    def post(url, data=None, files=None, timeout=None):
        media = json.loads(data["media"])
        calls.append((url.rsplit("/", 1)[1], media, sorted(files or {})))
        return R(len(media))
    monkeypatch.setattr(notify.requests, "post", post)
    a = {"kind": "album", "text": "🔴 شهرها", "album_media": [{"city": f"c{k}", "png": f"c{k}.png", "mp4": f"c{k}.mp4"} for k in range(3)]}
    assert notify.send_album("telegram", "u", "chat1", a)
    assert notify.send_album("telegram", "u", "chat2", a)
    (m1, media1, files1), (m2, media2, files2) = calls
    assert m1 == "sendMediaGroup" and len(media1) == 3 and media1[0]["caption"] == "🔴 شهرها"
    assert files1 == ["f0", "f1", "f2"] and files2 == []               # چت دوم بدون آپلود دوباره
    assert media2[1]["media"] == "id1"
