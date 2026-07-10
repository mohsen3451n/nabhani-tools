const express = require('express');
const router = express.Router();
const db = require('../db');
const { requestOtp, verifyOtp, isValidIranPhone } = require('../services/otp');
const { signCustomerToken, setCustomerCookie, clearCustomerCookie } = require('../middleware/auth');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/security');

// ---------- ورود مشتری ----------
router.get('/login', (req, res) => {
  if (res.locals.customer) return res.redirect('/');
  res.render('login', { role: 'customer', next: req.query.next || '/', error: null });
});

router.post('/login/request-code', otpRequestLimiter, async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  try {
    await requestOtp(phone, 'customer');
    res.render('login-otp', { role: 'customer', phone, next: req.body.next || '/', error: null });
  } catch (e) {
    res.render('login', { role: 'customer', next: req.body.next || '/', error: e.message });
  }
});

router.post('/login/verify-code', otpVerifyLimiter, (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const nextUrl = req.body.next || '/';

  const result = verifyOtp(phone, 'customer', code);
  if (!result.ok) {
    return res.render('login-otp', { role: 'customer', phone, next: nextUrl, error: result.reason });
  }

  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) {
    const info = db.prepare(`INSERT INTO users (phone, role) VALUES (?, 'customer')`).run(phone);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  }

  const token = signCustomerToken(user);
  setCustomerCookie(res, token);
  res.redirect(nextUrl.startsWith('/') ? nextUrl : '/');
});

router.post('/logout', (req, res) => {
  clearCustomerCookie(res);
  res.redirect('/');
});

module.exports = router;
