"""پست اینستاگرام از سایت خود اینستاگرام با مرورگر واقعی، بدون API (وقتی developers.facebook.com در دسترس نیست).

یک بار روی کامپیوتر خودت:
    python -m radar.ig_web --export-session   # مرورگر باز می‌شود، دستی وارد اینستاگرام شو؛ نشست کپی می‌شود
نشست را در Secret به نام IG_SESSION بگذار. از آن به بعد GitHub Actions خودش پست می‌گذارد.

    python -m radar.ig_web --check            # با IG_SESSION بررسی می‌کند که هنوز وارد هستی یا نه

رمز اینستاگرام هیچ‌جا ذخیره نمی‌شود؛ فقط کوکی‌های نشست، آن هم رمزنگاری‌شده در Secretهای گیت‌هاب.
"""
import argparse
import base64
import json
import random
import re
import subprocess
import sys
import time

from . import config as cfg

# برچسب دکمه‌ها به انگلیسی و فارسی، چون زبان اینستاگرام هر کس فرق دارد
L_POST = re.compile(r"^(Post|پست)$")
L_NEXT = re.compile(r"^(Next|بعدی)$")
L_SHARE = re.compile(r"^(Share|اشتراک‌گذاری|هم‌رسانی)$")
L_OK = re.compile(r"^(OK|باشه|تأیید)$")
L_DONE = re.compile(r"(has been shared|been shared|به اشتراک گذاشته شد|منتشر شد)")
CREATE = ('svg[aria-label="New post"], svg[aria-label="Create"], svg[aria-label="پست جدید"], '
          'svg[aria-label="ایجاد"]')
# مرورگر بی‌پنجره خودش را لو می‌دهد؛ روی رانر با xvfb پنجره‌دار اجرا می‌شود و این UA معمولی را دارد
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")


def pause(a=1.2, b=3.0):
    time.sleep(random.uniform(a, b))


def _launch(pw, headless):
    try:        # کروم واقعی (روی رانر گیت‌هاب از قبل نصب است)
        return pw.chromium.launch(channel="chrome", headless=headless)
    except Exception:
        return pw.chromium.launch(headless=headless)


def _session():
    raw = cfg.env("IG_SESSION")
    if not raw:
        return None
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _context(pw, state):
    headless = cfg.env("IG_HEADED", "0") != "1"
    b = _launch(pw, headless)
    ctx = b.new_context(storage_state=state, user_agent=UA, viewport={"width": 1280, "height": 900},
                        locale="en-US", timezone_id="Asia/Tehran")
    return b, ctx


def _logged_in(page):
    page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
    pause(4, 6)
    return not page.locator('input[name="username"]').count() and page.locator(CREATE).count() > 0


def publish(page, paths, caption):
    """paths: یک یا چند فایل (تا ۱۰ تا = پست کارتی)."""
    if not _logged_in(page):
        raise RuntimeError("نشست اینستاگرام منقضی شده؛ دوباره --export-session بزن و IG_SESSION را عوض کن")
    # بستن پاپ‌آپ‌های احتمالی (نوتیفیکیشن، ...)
    for dismiss in ['button[aria-label="Not Now"]', 'button:has-text("Not Now")', 'button:has-text("نه")']:
        try:
            page.locator(dismiss).first.click(timeout=2000)
            pause(1, 2)
        except Exception:
            pass
    try:
        page.locator(CREATE).first.click(timeout=30000)
    except Exception as e:
        # دیباگ: لیست svg‌هایی که aria-label دارند
        svgs = page.locator('svg[aria-label]').all()
        labels = [s.get_attribute('aria-label') for s in svgs[:10]]
        print(f"[ig_web] Create button not found. Available svg labels: {labels}", file=sys.stderr)
        raise
    pause()
    post = page.get_by_role("link", name=L_POST)          # نسخه‌های جدید: منوی «پست / لایو»
    if post.count():
        post.first.click()
        pause()
    page.locator('input[type="file"]').first.set_input_files(paths)
    pause(4, 6)
    ok = page.get_by_role("button", name=L_OK)             # «ویدیوها حالا ریلز می‌شوند»
    if ok.count():
        ok.first.click()
        pause()
    for _ in range(2):                                      # برش، بعد ویرایش
        page.get_by_role("button", name=L_NEXT).first.click(timeout=20000)
        pause(2, 4)
    box = page.locator('div[contenteditable="true"][role="textbox"]').first
    box.click()
    pause(.5, 1)
    for chunk in re.findall(r".{1,120}", caption[:2200], flags=re.S):   # تایپ تکه‌تکه، مثل آدم
        page.keyboard.insert_text(chunk)
        time.sleep(random.uniform(.15, .4))
    pause(1.5, 3)
    page.get_by_role("button", name=L_SHARE).first.click(timeout=20000)
    page.get_by_text(L_DONE).first.wait_for(timeout=300000)      # پردازش ویدیو چند دقیقه طول می‌کشد
    pause(2, 4)


def post(paths, caption):
    """از notify صدا زده می‌شود. True اگر منتشر شد."""
    state = _session()
    if not state:
        return False
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b, ctx = _context(pw, state)
        page = ctx.new_page()
        try:
            publish(page, paths, caption)
            return True
        except Exception as e:
            print(f"[ig_web] failed: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
            return False
        finally:
            b.close()


def export_session():
    """یک بار روی کامپیوتر خودت: ورود دستی، بعد فقط کوکی‌های اینستاگرام برای Secret."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = _launch(pw, False)
        ctx = b.new_context(user_agent=UA, viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.goto("https://www.instagram.com/accounts/login/")
        print("در پنجره‌ی باز شده خودت وارد اینستاگرام شو. اگر «Save login info» پرسید، Save را بزن.")
        input("وقتی صفحه‌ی اصلی اینستاگرام را دیدی، اینجا Enter بزن… ")
        state = ctx.storage_state()
        b.close()
    cookies = [c for c in state["cookies"] if "instagram.com" in c["domain"]]
    if not any(c["name"] == "sessionid" for c in cookies):
        print("به نظر وارد نشده‌ای (کوکی ورود پیدا نشد). دوباره امتحان کن.")
        return 1
    blob = base64.b64encode(json.dumps({"cookies": cookies, "origins": []}).encode()).decode()
    try:
        subprocess.run(["pbcopy"], input=blob.encode(), check=True)
        print("\nنشست در کلیپ‌بورد کپی شد. در گیت‌هاب Secret به نام IG_SESSION بساز و paste کن.")
    except Exception:
        print("\nاین متن را در Secret به نام IG_SESSION بگذار:\n\n" + blob)
    return 0


def check():
    state = _session()
    if not state:
        print("IG_SESSION تنظیم نشده")
        return 1
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b, ctx = _context(pw, state)
        try:
            ok = _logged_in(ctx.new_page())
        except Exception as e:      # مثلاً فیلتر بودن اینستاگرام روی همین شبکه
            print(f"[ig_web] اینستاگرام در دسترس نیست: {str(e).splitlines()[0][:150]}")
            return 1
        finally:
            b.close()
    print("[ig_web] نشست معتبر است" if ok else "[ig_web] نشست منقضی شده؛ دوباره --export-session بزن")
    return 0 if ok else 1


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--export-session", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    if a.export_session:
        return export_session()
    if a.check:
        return check()
    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
