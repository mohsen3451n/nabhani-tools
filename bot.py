# -*- coding: utf-8 -*-
"""
بات مستقل Mini App بازی بقا (Survival Top-Down)
- سرور Flask که هم صفحه بازی (Mini App) رو serve می‌کنه هم API ذخیره/بارگذاری/ریست وضعیت بازیکن رو داره
- بات تلگرام (polling) که با /start یا کلمه‌ی "بقا" دکمه‌ی بازی رو می‌فرسته
- دستور /help یا کلمه‌ی "راهنما" راهنمای بازی رو می‌فرسته (تو گروه و پیوی)
- دکمه‌ی منوی چت (کنار کیبورد) هم مستقیم بازی رو باز می‌کنه

نصب:
    pip install flask "python-telegram-bot==21.4" --break-system-packages

اجرا:
    python3 bot.py

متغیرهای محیطی لازم (تو Railway تحت Variables ست کن):
    BOT_TOKEN   -> توکن باتی که از BotFather گرفتی
    WEBAPP_URL  -> آدرس عمومی همین سرویس روی Railway (مثلا https://xxx.up.railway.app)
"""

import os
import json
import hmac
import hashlib
import threading
import time
import urllib.parse

from flask import Flask, request, jsonify, send_from_directory

from telegram import (
    InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, Update, MenuButtonWebApp,
)
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

# ==================== تنظیمات ====================

BOT_TOKEN = os.environ.get("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN تنظیم نشده! تو Railway بخش Variables اضافه‌ش کن.")

WEBAPP_URL = os.environ.get("WEBAPP_URL", "")

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
os.makedirs(DATA_DIR, exist_ok=True)

_save_lock = threading.Lock()

app = Flask(__name__, static_folder="static", static_url_path="")

HELP_TEXT = (
    "📖 راهنمای دنیای بقا\n\n"
    "🕹️ کنترل‌ها:\n"
    "• آنالوگ چپ: حرکت\n"
    "• آنالوگ راست (قرمز): نشونه‌گیری و حمله (نگه‌دار تا خودکار بزنه)\n"
    "• دکمه ✋: برداشتن منبع نزدیک یا سوار/پیاده شدن از ماشین\n\n"
    "🌲 منابع: درخت (چوب)، سنگ، بشکه (فلز)، بوته (پارچه)، بوته‌ی قرمز (غذا)، چشمه (آب)\n\n"
    "🛠️ ساخت: از منوی «ساخت» ابزار و سلاح بساز (تبر، کلنگ، چاقو، آچار، باند زخم) — هرکدوم برد حمله‌ی متفاوتی دارن\n\n"
    "🏠 بنا: از منوی «بنا» دیوار/در/پنجره بساز. دیوار جلوی زامبی و خودتو می‌گیره، در و پنجره فقط جلوی زامبی رو می‌گیرن\n\n"
    "🧟 زامبی‌ها: فقط وقتی بهشون نزدیک بشی متوجه‌ات می‌شن و دنبالت می‌کنن\n\n"
    "🚗 ماشین: با آچار + ۳ قطعه موتور تعمیرش کن، بعد با قوطی بنزین پرش کن تا سوار بشی\n\n"
    "💀 اگه سلامتیت صفر بشه، یه دنیای تازه از اول شروع می‌شه."
)


# ==================== اعتبارسنجی initData تلگرام ====================

def validate_init_data(init_data: str):
    """طبق مستندات رسمی تلگرام امضای Mini App رو چک می‌کنه و اطلاعات کاربر رو برمی‌گردونه."""
    if not init_data:
        return None
    try:
        parsed = dict(urllib.parse.parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        return None

    user_raw = parsed.get("user")
    if not user_raw:
        return None
    try:
        return json.loads(user_raw)
    except (ValueError, TypeError):
        return None


def user_file(user_id: int) -> str:
    return os.path.join(DATA_DIR, f"user_{user_id}.json")


def default_state(user_id: int) -> dict:
    return {
        "userId": user_id,
        "worldSeed": int(time.time() * 1000 + user_id) % 233280,
        "player": {
            "x": 0, "y": 0,
            "health": 100, "hunger": 100, "thirst": 100, "stamina": 100,
        },
        "inventory": {},
        "equipped": None,
        "cars": {"main": {"repaired": False, "fuel": 0, "health": 100}},
        "modifications": {},   # چانک‌های برداشت‌شده / سازه‌های ساخته‌شده
        "guideSeen": False,
        "updatedAt": time.time(),
    }


def save_state_to_disk(uid: int, state: dict):
    with _save_lock:
        with open(user_file(uid), "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)


# ==================== مسیرهای وب (Mini App) ====================

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/load", methods=["POST"])
def api_load():
    body = request.get_json(force=True, silent=True) or {}
    user = validate_init_data(body.get("initData", ""))
    if not user:
        return jsonify({"ok": False, "error": "invalid_init_data"}), 401

    uid = user["id"]
    path = user_file(uid)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = default_state(uid)
        save_state_to_disk(uid, state)

    return jsonify({"ok": True, "state": state, "firstName": user.get("first_name", "")})


@app.route("/api/save", methods=["POST"])
def api_save():
    body = request.get_json(force=True, silent=True) or {}
    user = validate_init_data(body.get("initData", ""))
    if not user:
        return jsonify({"ok": False, "error": "invalid_init_data"}), 401

    uid = user["id"]
    state = body.get("state")
    if not isinstance(state, dict):
        return jsonify({"ok": False, "error": "bad_state"}), 400

    state["userId"] = uid
    state["updatedAt"] = time.time()
    save_state_to_disk(uid, state)

    return jsonify({"ok": True})


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """وقتی کاراکتر می‌میره صدا زده می‌شه: یه دنیای کاملاً تازه برای بازیکن می‌سازه."""
    body = request.get_json(force=True, silent=True) or {}
    user = validate_init_data(body.get("initData", ""))
    if not user:
        return jsonify({"ok": False, "error": "invalid_init_data"}), 401

    uid = user["id"]
    old_path = user_file(uid)
    guide_seen = False
    if os.path.exists(old_path):
        try:
            with open(old_path, "r", encoding="utf-8") as f:
                guide_seen = json.load(f).get("guideSeen", False)
        except Exception:
            pass

    fresh = default_state(uid)
    fresh["guideSeen"] = guide_seen
    save_state_to_disk(uid, fresh)
    return jsonify({"ok": True, "state": fresh})


# ==================== بات تلگرام ====================

async def send_game_button(update: Update):
    if not WEBAPP_URL:
        await update.message.reply_text(
            "⚠️ آدرس بازی هنوز تنظیم نشده. اول WEBAPP_URL رو تو تنظیمات سرویس ست کن."
        )
        return

    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton("🎮 ورود به دنیای بقا", web_app=WebAppInfo(url=WEBAPP_URL))]]
    )
    await update.message.reply_text(
        "به دنیای بی‌پایان بقا خوش اومدی! 🧟\n"
        "منابع جمع کن، بساز، ماشین رو تعمیر کن و زنده بمون.\n"
        "برای دیدن راهنما دستور /help یا کلمه‌ی «راهنما» رو بفرست.\n\n"
        "برای شروع دکمه‌ی پایین رو بزن:",
        reply_markup=kb,
    )


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await send_game_button(update)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(HELP_TEXT)


async def on_keyword_bagha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message and update.message.text:
        await send_game_button(update)


async def on_keyword_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message and update.message.text:
        await update.message.reply_text(HELP_TEXT)


async def set_menu_button(application: Application):
    """دکمه‌ی کنار کیبورد چت رو مستقیم به بازی وصل می‌کنه (مثل بقیه بات‌ها)."""
    if not WEBAPP_URL:
        return
    try:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="🎮 بازی", web_app=WebAppInfo(url=WEBAPP_URL))
        )
        print("دکمه‌ی منو تنظیم شد.")
    except Exception as e:
        print("خطا در تنظیم دکمه‌ی منو:", e)


def run_bot():
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(set_menu_button)
        .build()
    )
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(
        MessageHandler(filters.Regex(r"راهنما") & filters.TEXT & ~filters.COMMAND, on_keyword_help)
    )
    application.add_handler(
        MessageHandler(filters.Regex(r"بقا") & filters.TEXT & ~filters.COMMAND, on_keyword_bagha)
    )
    print("بات بازی بقا روشن شد ...")
    application.run_polling(stop_signals=None, close_loop=False)


# ==================== main ====================

if __name__ == "__main__":
    t = threading.Thread(target=run_bot, daemon=True)
    t.start()

    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
