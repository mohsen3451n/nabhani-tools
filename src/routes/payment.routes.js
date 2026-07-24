const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireCustomer } = require('../middleware/auth');
const { getCart, cartDetails } = require('./shop.routes');
const paymentService = require('../services/payment');
const { getSetting } = require('../services/settings');
const { deductStockForOrder, restockOrder } = require('../services/inventory');

function getShopCard() { return { number: getSetting('shop_card_number', process.env.SHOP_CARD_NUMBER||''), owner: getSetting('shop_card_owner', process.env.SHOP_CARD_OWNER||'') }; }
function getGatewayConfig() { return { merchantId: getSetting('zarinpal_merchant_id', process.env.ZARINPAL_MERCHANT_ID||''), sandbox: getSetting('zarinpal_sandbox', process.env.ZARINPAL_SANDBOX||'true') === 'true' }; }

function createOrder(userId, items, total, paymentMethod, extra = {}) {
  const info = db.prepare(`INSERT INTO orders (user_id, status, total, payment_method, address, receiver_name, receiver_phone) VALUES (?, 'pending', ?, ?, ?, ?, ?)`).run(userId, total, paymentMethod, extra.address||'', extra.receiverName||'', extra.receiverPhone||'');
  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, qty, price) VALUES (?, ?, ?, ?, ?)`);
  for (const it of items) insertItem.run(orderId, it.product.id, it.product.name, it.qty, it.product.price);
  return orderId;
}

router.post('/checkout/place', requireCustomer, (req, res) => {
  const cart = getCart(req);
  const { items, total } = cartDetails(cart);
  if (items.length === 0) return res.redirect('/cart');
  const method = req.body.payment_method === 'card2card' ? 'card2card' : 'gateway';
  const orderId = createOrder(res.locals.customer.id, items, total, method, { address:req.body.address||'', receiverName:req.body.receiver_name||'', receiverPhone:req.body.receiver_phone||'' });
  req.session.cart = {};
  if (method === 'card2card') return res.redirect(`/payment/card2card/${orderId}`);
  return res.redirect(`/payment/gateway/${orderId}/start`);
});

router.get('/payment/card2card/:orderId', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  res.render('card2card', { order, shopCard: getShopCard(), error: null });
});

router.post('/payment/card2card/:orderId/submit', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  const trackingCode = String(req.body.tracking_code || '').trim().slice(0, 100);
  if (!trackingCode) return res.render('card2card', { order, shopCard: getShopCard(), error:'کد رهگیری واریز را وارد کنید' });
  db.prepare(`UPDATE orders SET status='awaiting_verification', tracking_code=?, updated_at=datetime('now') WHERE id=?`).run(trackingCode, order.id);
  deductStockForOrder(order.id);
  res.redirect(`/order/${order.id}/success`);
});

router.get('/payment/gateway/:orderId/start', requireCustomer, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  try {
    const { merchantId, sandbox } = getGatewayConfig();
    const callbackUrl = `${process.env.BASE_URL}/payment/gateway/${order.id}/callback`;
    const { authority, url } = await paymentService.requestPayment({ amountToman: order.total, description:`پرداخت سفارش شماره ${order.id} - ابزار نبهانی`, callbackUrl, mobile: res.locals.customer.phone, merchantId, sandbox });
    db.prepare(`UPDATE orders SET gateway_authority=?, updated_at=datetime('now') WHERE id=?`).run(authority, order.id);
    res.redirect(url);
  } catch (e) {
    if (e.code === 'GATEWAY_NOT_CONFIGURED') return res.render('error', { message:'درگاه بانکی هنوز فعال نشده است. لطفا از روش «کارت به کارت» استفاده کنید.' });
    return res.render('error', { message:'خطا در اتصال به درگاه بانکی، لطفا دوباره تلاش کنید' });
  }
});

router.get('/payment/gateway/:orderId/callback', requireCustomer, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.orderId, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  if (req.query.Status !== 'OK') { db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE id=?`).run(order.id); return res.redirect(`/order/${order.id}/failed`); }
  try {
    const { merchantId, sandbox } = getGatewayConfig();
    const result = await paymentService.verifyPayment({ amountToman: order.total, authority: order.gateway_authority, merchantId, sandbox });
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

router.post('/order/:id/cancel', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  if (!['pending','awaiting_verification'].includes(order.status)) return res.status(400).render('error', { message:'این سفارش دیگر قابل لغو نیست.' });
  if (order.status === 'awaiting_verification') restockOrder(order.id);
  db.prepare(`UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(order.id);
  res.redirect('/orders');
});

router.get('/order/:id/success', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  res.render('order-success', { order, items });
});

router.get('/order/:id/failed', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, res.locals.customer.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  res.render('order-failed', { order });
});

router.get('/orders', requireCustomer, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(res.locals.customer.id);
  res.render('orders', { orders });
});

module.exports = router;
