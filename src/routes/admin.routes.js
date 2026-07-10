const express = require('express');
const router = express.Router();
const sanitizeHtml = require('sanitize-html');
const db = require('../db');
const { requestOtp, verifyOtp } = require('../services/otp');
const { signAdminToken, setAdminCookie, clearAdminCookie, requireAdmin } = require('../middleware/auth');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/security');

function slugify(str) {
  return str.trim().replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
}
function clean(str) { return sanitizeHtml(String(str || ''), { allowedTags: [], allowedAttributes: {} }); }

const ADMIN_PATH = process.env.ADMIN_PANEL_PATH || '/nb-admin-x7q2';

router.use((req, res, next) => {
  res.locals.adminBase = ADMIN_PATH;
  next();
});

// ---------- ورود ادمین (کاملا جدا از ورود مشتری) ----------
router.get('/login', (req, res) => {
  if (res.locals.admin) return res.redirect(ADMIN_PATH);
  res.render('admin/login', { error: null });
});

router.post('/login/request-code', otpRequestLimiter, async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const existing = db.prepare(`SELECT * FROM users WHERE phone=? AND role='admin'`).get(phone);
  if (!existing) {
    return res.render('admin/login', { error: 'اگر این شماره مدیر باشد، کد ارسال می‌شود. اگر پیامکی نرسید، شماره را بررسی کنید.' });
  }
  try {
    await requestOtp(phone, 'admin');
    res.render('admin/login-otp', { phone, error: null });
  } catch (e) {
    res.render('admin/login', { error: e.message });
  }
});

router.post('/login/verify-code', otpVerifyLimiter, (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const result = verifyOtp(phone, 'admin', code);
  if (!result.ok) return res.render('admin/login-otp', { phone, error: result.reason });

  const user = db.prepare(`SELECT * FROM users WHERE phone=? AND role='admin'`).get(phone);
  if (!user) return res.render('admin/login', { error: 'دسترسی مدیر یافت نشد' });

  const token = signAdminToken(user);
  setAdminCookie(res, token);
  res.redirect(ADMIN_PATH);
});

router.post('/logout', (req, res) => {
  clearAdminCookie(res);
  res.redirect(`${ADMIN_PATH}/login`);
});

// ---------- از این به بعد فقط ادمین ----------
router.use(requireAdmin);

router.get('/', (req, res) => {
  const stats = {
    productsCount: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    ordersPending: db.prepare(`SELECT COUNT(*) c FROM orders WHERE status IN ('pending','awaiting_verification')`).get().c,
    ordersPaid: db.prepare(`SELECT COUNT(*) c FROM orders WHERE status='paid'`).get().c,
    revenue: db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status='paid'`).get().s,
  };
  res.render('admin/dashboard', { stats, admin: res.locals.admin });
});

// ---- محصولات ----
router.get('/products', (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id DESC
  `).all();
  res.render('admin/products', { products });
});

router.get('/products/new', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories').all();
  res.render('admin/product-form', { product: null, categories });
});

router.post('/products/new', (req, res) => {
  const { name, category_id, description, price, stock, image_url } = req.body;
  if (!name || !price) return res.status(400).render('error', { message: 'نام و قیمت الزامی است' });
  const catId = category_id ? parseInt(category_id, 10) : null;
  db.prepare(`
    INSERT INTO products (category_id, name, slug, description, price, stock, image_url, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(catId, clean(name), slugify(name), clean(description), parseInt(price, 10), parseInt(stock || 0, 10), clean(image_url) || '/img/placeholder.svg');
  res.redirect(`${ADMIN_PATH}/products`);
});

router.get('/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  const categories = db.prepare('SELECT * FROM categories').all();
  if (!product) return res.status(404).render('error', { message: 'کالا یافت نشد' });
  res.render('admin/product-form', { product, categories });
});

router.post('/products/:id/edit', (req, res) => {
  const { name, category_id, description, price, stock, image_url, active } = req.body;
  const catId = category_id ? parseInt(category_id, 10) : null;
  db.prepare(`
    UPDATE products SET category_id=?, name=?, description=?, price=?, stock=?, image_url=?, active=?
    WHERE id=?
  `).run(catId, clean(name), clean(description), parseInt(price, 10), parseInt(stock || 0, 10), clean(image_url), active ? 1 : 0, req.params.id);
  res.redirect(`${ADMIN_PATH}/products`);
});

router.post('/products/:id/delete', (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.redirect(`${ADMIN_PATH}/products`);
});

// ---- دسته‌بندی‌ها ----
router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories').all();
  res.render('admin/categories', { categories });
});

router.post('/categories/new', (req, res) => {
  const name = clean(req.body.name);
  if (!name) return res.redirect(`${ADMIN_PATH}/categories`);
  const slug = slugify(name);
  db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
  res.redirect(`${ADMIN_PATH}/categories`);
});

router.post('/categories/:id/delete', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.redirect(`${ADMIN_PATH}/categories`);
});

// ---- سفارش‌ها ----
router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.phone as user_phone FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.id DESC
  `).all();
  res.render('admin/orders', { orders });
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, u.phone as user_phone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?
  `).get(req.params.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  res.render('admin/order-detail', { order, items });
});

router.post('/orders/:id/confirm', (req, res) => {
  db.prepare(`UPDATE orders SET status='paid', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.redirect(`${ADMIN_PATH}/orders/${req.params.id}`);
});

router.post('/orders/:id/reject', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (order && order.status !== 'failed' && order.status !== 'cancelled') {
    const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(order.id);
    const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id=?');
    for (const it of items) restock.run(it.qty, it.product_id);
  }
  db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.redirect(`${ADMIN_PATH}/orders/${req.params.id}`);
});

module.exports = router;
