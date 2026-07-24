# دنیای بقا — بات مستقل Telegram Mini App

بازی بقای دوبعدی از بالا (top-down)، شبیه‌سازی زمین بی‌پایان، جمع‌آوری منابع،
ساخت‌وساز، زامبی، و ماشین قابل تعمیر — به‌صورت Telegram Mini App.

## راه‌اندازی محلی (تست)
pip install -r requirements.txt --break-system-packages
export BOT_TOKEN="توکن بات از BotFather"
export WEBAPP_URL="https://<آدرس-بعد-از-دیپلوی>"
python3 bot.py

## دیپلوی روی Railway
1. یه ریپوی گیت‌هاب جدید بساز و همه‌ی این فایل‌ها رو push کن (ساختار پایین رو رعایت کن)
2. تو Railway یه پروژه جدید از همون ریپو بساز
3. Variables: BOT_TOKEN و WEBAPP_URL رو ست کن (WEBAPP_URL بعد از اولین دیپلوی از Settings کپی می‌شه)
4. سرویس رو Redeploy کن تا WEBAPP_URL اعمال بشه

## ساختار نهایی ریپو
bot.py
requirements.txt
Procfile
.gitignore
README.md
static/index.html
static/style.css
static/game.js
