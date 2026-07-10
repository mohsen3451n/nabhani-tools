const jwt = require('jsonwebtoken');
const db = require('../db');

const CUSTOMER_COOKIE = 'nb_customer_session';
const ADMIN_COOKIE = 'nb_admin_session';

function signCustomerToken(user) {
  return jwt.sign({ uid: user.id, phone: user.phone, role: 'customer' }, process.env.JWT_CUSTOMER_SECRET, { expiresIn: '30d' });
}
function signAdminToken(user) {
  return jwt.sign({ uid: user.id, phone: user.phone, role: 'admin' }, process.env.JWT_ADMIN_SECRET, { expiresIn: '8h' });
}

const cookieOpts = (maxAgeMs) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: maxAgeMs,
  path: '/',
});

function setCustomerCookie(res, token) {
  res.cookie(CUSTOMER_COOKIE, token, cookieOpts(30 * 24 * 3600 * 1000));
}
function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, cookieOpts(8 * 3600 * 1000));
}
function clearCustomerCookie(res) { res.clearCookie(CUSTOMER_COOKIE, { path: '/' }); }
function clearAdminCookie(res) { res.clearCookie(ADMIN_COOKIE, { path: '/' }); }

function loadCustomer(req, res, next) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  res.locals.customer = null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id=? AND role=?').get(payload.uid, 'customer');
      if (user) res.locals.customer = user;
    } catch (e) { /* توکن نامعتبر یا منقضی - نادیده گرفته می‌شود */ }
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!res.locals.customer) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function loadAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  res.locals.admin = null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id=? AND role=?').get(payload.uid, 'admin');
      if (user) res.locals.admin = user;
    } catch (e) { /* نامعتبر */ }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.admin) {
    const base = process.env.ADMIN_PANEL_PATH || '/nb-admin-x7q2';
    return res.redirect(`${base}/login`);
  }
  next();
}

module.exports = {
  signCustomerToken, signAdminToken,
  setCustomerCookie, setAdminCookie,
  clearCustomerCookie, clearAdminCookie,
  loadCustomer, requireCustomer,
  loadAdmin, requireAdmin,
};
