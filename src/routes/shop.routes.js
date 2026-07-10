const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireCustomer } = require('../middleware/auth');

function getCart(req) {
  if (!req.session.cart) req.session.cart = {};
  return req.session.cart;
}

function cartDetails(cart) {
  const ids = Object.keys(cart).map(Number).filter(Boolean);
  if (ids.length === 0) return { items: [], total: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const products = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
  const items = products.map(p => ({
    product: p,
    qty: Math.min(cart[p.id], p.stock),
    subtotal: p.price * Math.min(cart[p.id], p.stock),
  })).filter(i => i.qty > 0);
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  return { items, total };
}

// ---------- خانه ----------
router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories').all();
  const featured = db.prepare(`SELECT * FROM products WHERE active=1 ORDER BY id DESC LIMIT 8`).all();
  res.render('home', { categories, featured });
});

// ---------- دسته‌بندی ----------
router.get('/category/:slug', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
  if (!category) return res.status(404).render('error', { message: 'دسته‌بندی یافت نشد' });
  const products = db.prepare('SELECT * FROM products WHERE category_id=? AND active=1 ORDER BY id DESC').all(category.id);
  res.render('category', { category, products });
});

// ---------- جستجو ----------
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  let products = [];
  if (q) {
    products = db.prepare(`SELECT * FROM products WHERE active=1 AND name LIKE ? ORDER BY id DESC`).all(`%${q}%`);
  }
  res.render('search', { q, products });
});

// ---------- محصول ----------
router.get('/product/:slug', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND active=1').get(req.params.slug);
  if (!product) return res.status(404).render('error', { message: 'کالا یافت نشد' });
  res.render('product', { product });
});

// ---------- سبد خرید ----------
router.get('/cart', (req, res) => {
  const { items, total } = cartDetails(getCart(req));
  res.render('cart', { items, total });
});

router.post('/cart/add', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const qty = Math.max(1, parseInt(req.body.qty || '1', 10));
  const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(productId);
  if (!product) return res.status(404).render('error', { message: 'کالا یافت نشد' });

  const cart = getCart(req);
  cart[productId] = Math.min((cart[productId] || 0) + qty, product.stock);
  res.redirect('/cart');
});

router.post('/cart/update', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const qty = Math.max(0, parseInt(req.body.qty || '0', 10));
  const cart = getCart(req);
  if (qty === 0) delete cart[productId];
  else cart[productId] = qty;
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const cart = getCart(req);
  delete cart[productId];
  res.redirect('/cart');
});

// ---------- تسویه حساب (نیاز به ورود مشتری) ----------
router.get('/checkout', requireCustomer, (req, res) => {
  const { items, total } = cartDetails(getCart(req));
  if (items.length === 0) return res.redirect('/cart');
  res.render('checkout', {
    items, total,
    shopCard: { number: process.env.SHOP_CARD_NUMBER, owner: process.env.SHOP_CARD_OWNER },
    error: null,
  });
});

module.exports = router;
module.exports.cartDetails = cartDetails;
module.exports.getCart = getCart;
