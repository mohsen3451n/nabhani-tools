const crypto = require('crypto');
const db = require('../db');
const { sendOtp } = require('./sms');

const OTP_TTL_MS = 2 * 60 * 1000; // ۲ دقیقه اعتبار
const MAX_ATTEMPTS = 5;

function hashCode(code, phone) {
  return crypto.createHash('sha256').update(`${phone}:${code}:${process.env.SESSION_SECRET || 'salt'}`).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(10000, 99999)); // ۵ رقمی
}

function isValidIranPhone(phone) {
  return /^09\d{9}$/.test(phone);
}

async function requestOtp(phone, purpose) {
  if (!isValidIranPhone(phone)) {
    const err = new Error('شماره موبایل معتبر نیست');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  const recent = db.prepare(`
    SELECT created_at FROM otp_codes
    WHERE phone=? AND purpose=? AND used=0
    ORDER BY id DESC LIMIT 1
  `).get(phone, purpose);

  if (recent) {
    const createdMs = new Date(recent.created_at + 'Z').getTime();
    if (Date.now() - createdMs < 30 * 1000) {
      const err = new Error('لطفا کمی صبر کنید و دوباره تلاش کنید');
      err.code = 'RATE_LIMITED';
      throw err;
    }
  }

  const code = generateCode();
  const codeHash = hashCode(code, phone);
  const expiresAt = Date.now() + OTP_TTL_MS;

  db.prepare(`
    INSERT INTO otp_codes (phone, purpose, code_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(phone, purpose, codeHash, expiresAt);

  await sendOtp(phone, code);
  return true;
}

function verifyOtp(phone, purpose, code) {
  const row = db.prepare(`
    SELECT * FROM otp_codes
    WHERE phone=? AND purpose=? AND used=0
    ORDER BY id DESC LIMIT 1
  `).get(phone, purpose);

  if (!row) return { ok: false, reason: 'کد یافت نشد، دوباره درخواست کنید' };
  if (Date.now() > row.expires_at) return { ok: false, reason: 'کد منقضی شده است' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'تعداد تلاش بیش از حد مجاز است' };

  db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id=?`).run(row.id);

  const inputHash = hashCode(code, phone);
  const a = Buffer.from(inputHash);
  const b = Buffer.from(row.code_hash);
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!matches) return { ok: false, reason: 'کد وارد شده اشتباه است' };

  db.prepare(`UPDATE otp_codes SET used=1 WHERE id=?`).run(row.id);
  return { ok: true };
}

module.exports = { requestOtp, verifyOtp, isValidIranPhone };
