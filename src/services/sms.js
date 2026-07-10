// این فایل عمدا ساده و «قابل تعویض» طراحی شده تا هر سرویس پیامک ایرانی
// (کاوه‌نگار، قاصدک، ملی‌پیامک، ...) به راحتی جایگزین شود.
// در حالت پیش‌فرض (SMS_PROVIDER=console) کد تایید فقط در لاگ سرور چاپ می‌شود؛
// این حالت فقط برای تست است و روی سایت واقعی نباید استفاده شود.

const fetch = require('node-fetch');

async function sendOtp(phone, code) {
  const provider = process.env.SMS_PROVIDER || 'console';

  if (provider === 'kavenegar') {
    const apiKey = process.env.KAVENEGAR_API_KEY;
    const template = process.env.KAVENEGAR_TEMPLATE || 'verify';
    const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(phone)}&token=${code}&template=${template}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('ارسال پیامک ناموفق بود');
    return true;
  }

  // حالت آزمایشی / کنسول
  console.log(`\n[SMS-MOCK] کد تایید برای ${phone}: ${code}\n`);
  return true;
}

module.exports = { sendOtp };
