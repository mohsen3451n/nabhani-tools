const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'", 'https://sandbox.zarinpal.com', 'https://www.zarinpal.com', 'https://payment.zarinpal.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// محدودیت شدید برای درخواست کد تایید (جلوگیری از بمباران پیامکی / brute force)
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد درخواست‌های شما زیاد بوده، کمی بعد دوباره تلاش کنید' },
});

// محدودیت برای تایید کد (جلوگیری از حدس زدن کد ۵ رقمی)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد تلاش‌های شما زیاد بوده، کمی بعد دوباره تلاش کنید' },
});

// محدودیت عمومی برای کل سایت
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// محدودیت سخت‌گیرانه برای مسیرهای پنل ادمین (کاهش سطح حمله brute force روی ادمین)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// CSRF ساده مبتنی بر توکن ذخیره‌شده در session و مقایسه با فیلد فرم/هدر
function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const sent = req.body?._csrf || req.query?._csrf || req.headers['x-csrf-token'];
    if (!sent || sent !== req.session.csrfToken) {
      return res.status(403).render('error', { message: 'درخواست نامعتبر (CSRF). صفحه را رفرش کنید و دوباره تلاش کنید.' });
    }
  }
  next();
}

// محدودیت سخت‌گیرانه برای مسیر یک‌بارمصرف ساخت اولین ادمین (جلوگیری از حدس زدن توکن)
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  helmetConfig,
  otpRequestLimiter,
  otpVerifyLimiter,
  globalLimiter,
  adminLimiter,
  setupLimiter,
  csrfProtection,
};
