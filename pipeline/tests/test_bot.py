from datetime import datetime, timezone

import pytest

from radar import bot, subs

CITIES = [{"n": "رشت", "lat": 37.28, "lon": 49.58, "p": "G", "pfa": "گیلان", "m": True},
          {"n": "تهران", "lat": 35.69, "lon": 51.39, "p": "T", "pfa": "تهران", "m": True}]


class FakeBot:
    prefix, name = "tg", "telegram"

    def __init__(self):
        self.out = []

    def say(self, chat, text, kb=False):
        self.out.append(text)


def msg(text, chat=42):
    return {"chat": {"id": chat}, "text": text}


@pytest.fixture
def ctx(monkeypatch, tmp_path):
    monkeypatch.setattr(subs, "PATH", tmp_path / "s.enc")
    monkeypatch.setenv("BOT_STATE_KEY", "test-key")
    monkeypatch.setattr(bot, "status", lambda n, me, ctx: f"وضعیت {n}")
    return {"cities": CITIES, "data": None, "private": [], "now": datetime(2026, 10, 22, tzinfo=timezone.utc)}


def test_invite_code_blocks_strangers(ctx, monkeypatch):
    monkeypatch.setenv("BOT_INVITE_CODE", "abc")
    b, S = FakeBot(), {}
    bot.handle(b, S, msg("/start"), ctx)
    bot.handle(b, S, msg("رشت"), ctx)
    assert S == {} and "خصوصی" in b.out[-1]
    bot.handle(b, S, msg("/start abc"), ctx)
    bot.handle(b, S, msg("رشت"), ctx)
    assert [p["n"] for p in S["tg:42"]["places"]] == ["رشت"]


def test_arabic_letters_and_custom_place_and_stop(ctx, monkeypatch):
    monkeypatch.delenv("BOT_INVITE_CODE", raising=False)
    b, S = FakeBot(), {}
    bot.handle(b, S, msg("تهران"), ctx)                         # بدون /start هم کار می‌کند
    assert S["tg:42"]["places"][0]["n"] == "تهران" and not S["tg:42"]["places"][0]["custom"]
    assert subs.resolve("رشت", CITIES, geocode=False)["n"] == "رشت"
    assert subs.resolve("رشت ", CITIES, geocode=False) and subs.resolve("رشت".replace("ش", "ش"), CITIES, geocode=False)
    monkeypatch.setattr(subs, "resolve", lambda t, c, geocode=True: {"n": "اسالم", "lat": 37.73, "lon": 48.95, "pfa": "گیلان",
                                                                      "city": "رشت", "km": 70, "custom": True})
    bot.handle(b, S, msg("اسالم"), ctx)
    assert "نزدیک‌ترین شهر پایش" in b.out[-1]
    assert [p["n"] for p in subs.places(S)] == ["اسالم"]
    assert subs.recipients(S, "اسالم") == ["tg:42"]
    bot.handle(b, S, msg("/stop اسالم"), ctx)
    assert [p["n"] for p in S["tg:42"]["places"]] == ["تهران"]
    bot.handle(b, S, msg("/stop"), ctx)
    assert S == {}


def test_subscribers_file_is_encrypted(ctx):
    subs.save({"tg:42": {"places": [{"n": "رشت"}]}})
    raw = subs.PATH.read_bytes()
    assert b"42" not in raw and "رشت".encode() not in raw
    assert subs.load()["tg:42"]["places"][0]["n"] == "رشت"


def test_normalizes_arabic_yeh_and_kaf():
    assert subs.norm("كرمانشاه") == subs.norm("کرمانشاه")
    assert subs.norm("علي آباد") == subs.norm("علی‌آباد")
