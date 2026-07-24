const express = require('express');
const router = express.Router();
const db = require('../db');
const { isValidIranPhone } = require('../services/otp');

router.get('/setup-admin', (req, res) => {
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!setupToken) return res.status(404).render('error', { message:'این مسیر غیرفعال است' });
  const { token, phone } = req.query;
  if (!token || token !== setupToken) return res.status(403).render('error', { message:'توکن نامعتبر است' });
  if (!phone || !isValidIranPhone(String(phone))) return res.status(400).render('error', { message:'شماره موبایل معتبر نیست' });
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) {
    const info = db.prepare(`INSERT INTO users (phone, is_admin) VALUES (?, 1)`).run(phone);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  } else {
    db.prepare(`UPDATE users SET is_admin=1 WHERE id=?`).run(user.id);
  }
  res.render('error', { message: `شماره ${phone} با موفقیت به ادمین تبدیل شد.` });
});

module.exports = router;
