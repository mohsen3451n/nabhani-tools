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

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد درخواست‌های شما زیاد بوده، کمی بعد دوباره تلاش کنید' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد تلاش‌های شما زیاد بوده، کمی بعد دوباره تلاش کنید' },
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const sent = req.body?._csrf || req.headers['x-csrf-token'];
    if (!sent || sent !== req.session.csrfToken) {
      return res.status(403).render('error', { message: 'درخواست نامعتبر (CSRF). صفحه را رفرش کنید و دوباره تلاش کنید.' });
    }
  }
  next();
}

module.exports = {
  helmetConfig,
  otpRequestLimiter,
  otpVerifyLimiter,
  globalLimiter,
  adminLimiter,
  setupLimiter,
  csrfProtection,
};
