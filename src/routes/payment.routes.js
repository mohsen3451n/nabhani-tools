const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireCustomer } = require('../middleware/auth');
const { getCart, cartDetails } = require('./shop.routes');
const paymentService = require('../services/payment');
const { getSetting } = require('../services/settings');

function getShopCard() {
  return {
    number: getSetting('shop_card_number', process.env.SHOP_CARD_NUMBER || ''),
    owner: getSetting('shop_card_owner', process.env.SHOP_CARD_OWNER || ''),
  };
}

function createOrder(userId, items, total, paymentMethod, extra = {}) {
  const info = db.prepare(`
    INSERT INTO orders (user_id, status, total, payment_method, address, receiver_name, receiver_phone)
    VALUES (?, 'pending', ?, ?, ?, ?, ?)
  `).run(userId, total, paymentMethod, extra.address || '', extra.receiverName || '', extra.receiverPhone || '');
  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, qty, price) VALUES (?, ?, ?, ?, ?)
  `);
  for (const it of items) {
    insertItem.run(orderId, it.product.id, it.product.name, it.qty, it.product.price);
  }
  return orderId;
}

// موجودی فقط زمانی کم می‌شود که پرداخت قطعی شده باشد (نه در لحظه ثبت سفارش)
function deductStockForOrder(orderId) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(orderId);
  const update = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?');
  for (const it of items) update.run(it.qty, it.product_id);
}

// انتخاب روش پرداخت و ثبت سفارش اولیه
router.post('/checkout/place', requireCustomer, (req, res) => {
  const cart = getCart(req);
  const { items, total } = cartDetails(cart);
  if (items.length === 0) return res.redirect('/cart');

  const method = req.body.payment_method === 'card2card' ? 'card2card' : 'gateway';
  const address = req.body.address || '';
  const receiverName = req.body.receiver_name || '';
  const receiverPhone = req.body.receiver_phone || '';

  const orderId = createOrder(res.locals.customer.id, items, total, method, { address, receiverName, receiverPhone });
  req.session.cart = {}; // خالی کردن سبد خرید

  if (method === 'card2card') {
    return res.redirect(`/payment/card2card/${orderId}`);
  }
  return res.redirect(`/payment/gateway/${orderId}/start`);
});

// ---------- کارت به کارت ----------
router.get('/payment/card2card/:orderId', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });
  res.render('card2card', {
    order,
    shopCard: getShopCard(),
  });
});

router.post('/payment/card2card/:orderId/submit', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });

  const trackingCode = String(req.body.tracking_code || '').trim().slice(0, 100);
  if (!trackingCode) {
    return res.render('card2card', {
      order,
      shopCard: getShopCard(),
      error: 'کد رهگیری واریز را وارد کنید',
    });
  }

  db.prepare(`
    UPDATE orders SET status='awaiting_verification', tracking_code=?, updated_at=datetime('now') WHERE id=?
  `).run(trackingCode, order.id);
  deductStockForOrder(order.id);

  res.redirect(`/order/${order.id}/success`);
});

// ---------- درگاه بانکی (زرین‌پال، جایگزین‌پذیر با هر PSP دیگر) ----------
router.get('/payment/gateway/:orderId/start', requireCustomer, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });

  try {
    const callbackUrl = `${process.env.BASE_URL}/payment/gateway/${order.id}/callback`;
    const { authority, url } = await paymentService.requestPayment({
      amountToman: order.total,
      description: `پرداخت سفارش شماره ${order.id} - ابزار نبهانی`,
      callbackUrl,
      mobile: res.locals.customer.phone,
    });
    db.prepare(`UPDATE orders SET gateway_authority=?, updated_at=datetime('now') WHERE id=?`).run(authority, order.id);
    res.redirect(url);
  } catch (e) {
    if (e.code === 'GATEWAY_NOT_CONFIGURED') {
      return res.render('error', {
        message: 'درگاه بانکی هنوز فعال نشده است. لطفا از روش «کارت به کارت» استفاده کنید یا با فروشگاه تماس بگیرید.',
      });
    }
    return res.render('error', { message: 'خطا در اتصال به درگاه بانکی، لطفا دوباره تلاش کنید' });
  }
});

router.get('/payment/gateway/:orderId/callback', requireCustomer, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });

  if (req.query.Status !== 'OK') {
    db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE id=?`).run(order.id);
    return res.redirect(`/order/${order.id}/failed`);
  }

  try {
    const result = await paymentService.verifyPayment({ amountToman: order.total, authority: order.gateway_authority });
    if (result.ok) {
      db.prepare(`UPDATE orders SET status='paid', gateway_ref_id=?, updated_at=datetime('now') WHERE id=?`).run(String(result.refId), order.id);
      deductStockForOrder(order.id);
      return res.redirect(`/order/${order.id}/success`);
    }
    db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE id=?`).run(order.id);
    return res.redirect(`/order/${order.id}/failed`);
  } catch (e) {
    db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE id=?`).run(order.id);
    return res.redirect(`/order/${order.id}/failed`);
  }
});

// ---------- نتیجه سفارش ----------
router.get('/order/:id/success', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  res.render('order-success', { order, items });
});

router.get('/order/:id/failed', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message: 'سفارش یافت نشد' });
  res.render('order-failed', { order });
});

router.get('/orders', requireCustomer, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(res.locals.customer.id);
  res.render('orders', { orders });
});

module.exports = router;
