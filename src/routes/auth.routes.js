const express = require('express');
const router = express.Router();
const db = require('../db');
const { requestOtp, verifyOtp } = require('../services/otp');
const { signCustomerToken, setCustomerCookie, clearCustomerCookie, signAdminToken, setAdminCookie } = require('../middleware/auth');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/security');

function getAdminPhoneList() {
  return (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
}

router.get('/login', (req, res) => {
  if (res.locals.customer) return res.redirect('/');
  res.render('login', { role:'customer', next: req.query.next || '/', error:null });
});

router.post('/login/request-code', otpRequestLimiter, async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  try {
    await requestOtp(phone, 'customer');
    res.render('login-otp', { role:'customer', phone, next: req.body.next || '/', error:null });
  } catch (e) {
    res.render('login', { role:'customer', next: req.body.next || '/', error: e.message });
  }
});

router.post('/login/verify-code', otpVerifyLimiter, (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const nextUrl = req.body.next || '/';
  const result = verifyOtp(phone, 'customer', code);
  if (!result.ok) return res.render('login-otp', { role:'customer', phone, next:nextUrl, error: result.reason });
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) {
    const info = db.prepare(`INSERT INTO users (phone, role) VALUES (?, 'customer')`).run(phone);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  }
  const token = signCustomerToken(user);
  setCustomerCookie(res, token);
  res.redirect(nextUrl.startsWith('/') ? nextUrl : '/');
});

router.post('/logout', (req, res) => { clearCustomerCookie(res); res.redirect('/'); });

router.get('/admin-access', (req, res) => {
  const customer = res.locals.customer;
  if (!customer) return res.redirect('/login?next=' + encodeURIComponent('/admin-access'));
  const adminPhones = getAdminPhoneList();
  if (!adminPhones.includes(customer.phone)) return res.status(403).render('error', { message:'شما به پنل مدیریت دسترسی ندارید.' });
  db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(customer.id);
  const adminUser = db.prepare('SELECT * FROM users WHERE id=?').get(customer.id);
  const token = signAdminToken(adminUser);
  setAdminCookie(res, token);
  const adminPath = process.env.ADMIN_PANEL_PATH || '/nb-admin-x7q2';
  res.redirect(adminPath);
});

module.exports = router;
