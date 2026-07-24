const express = require('express');
const router = express.Router();
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requestOtp, verifyOtp } = require('../services/otp');
const { signAdminToken, setAdminCookie, clearAdminCookie, requireAdmin } = require('../middleware/auth');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/security');
const { getAllSettings, setSetting } = require('../services/settings');
const { restockOrder } = require('../services/inventory');

function slugify(str) { return str.trim().replace(/\s+/g,'-') + '-' + Math.random().toString(36).slice(2,7); }
function clean(str) { return sanitizeHtml(String(str||''), { allowedTags:[], allowedAttributes:{} }); }

function makeUploader(subfolder) {
  const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads', subfolder);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive:true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname||'').toLowerCase() || '.jpg';
      cb(null, `${subfolder}-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
    },
  });
  return multer({ storage, limits:{ fileSize: 4*1024*1024 }, fileFilter:(req,file,cb) => { if (!file.mimetype.startsWith('image/')) return cb(new Error('فقط فایل تصویر مجاز است')); cb(null,true); } });
}
const uploadProduct = makeUploader('products');
const uploadCategory = makeUploader('categories');

function safeUpload(uploader, fieldName) {
  return function (req, res, next) {
    uploader.single(fieldName)(req, res, function (err) {
      if (err) { console.error('خطای آپلود عکس:', err.message); return res.status(400).render('error', { message: 'خطا در آپلود عکس: ' + (err.message||'فایل نامعتبر است') }); }
      next();
    });
  };
}

const ADMIN_PATH = process.env.ADMIN_PANEL_PATH || '/nb-admin-x7q2';

router.use((req, res, next) => { res.locals.adminBase = ADMIN_PATH; next(); });

router.get('/login', (req, res) => { if (res.locals.admin) return res.redirect(ADMIN_PATH); res.render('admin/login', { error:null }); });

router.post('/login/request-code', otpRequestLimiter, async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const existing = db.prepare(`SELECT * FROM users WHERE phone=? AND is_admin=1`).get(phone);
  if (!existing) return res.render('admin/login', { error:'اگر این شماره مدیر باشد، کد ارسال می‌شود.' });
  try { await requestOtp(phone, 'admin'); res.render('admin/login-otp', { phone, error:null }); }
  catch (e) { res.render('admin/login', { error: e.message }); }
});

router.post('/login/verify-code', otpVerifyLimiter, (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const result = verifyOtp(phone, 'admin', code);
  if (!result.ok) return res.render('admin/login-otp', { phone, error: result.reason });
  const user = db.prepare(`SELECT * FROM users WHERE phone=? AND is_admin=1`).get(phone);
  if (!user) return res.render('admin/login', { error:'دسترسی مدیر یافت نشد' });
  const token = signAdminToken(user);
  setAdminCookie(res, token);
  res.redirect(ADMIN_PATH);
});

router.post('/logout', (req, res) => { clearAdminCookie(res); res.redirect(`${ADMIN_PATH}/login`); });

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
  const products = db.prepare(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC`).all();
  res.render('admin/products', { products });
});
router.get('/products/new', (req, res) => { const categories = db.prepare('SELECT * FROM categories').all(); res.render('admin/product-form', { product:null, categories }); });
router.post('/products/new', safeUpload(uploadProduct, 'image_file'), (req, res) => {
  const { name, category_id, description, price, stock, image_url } = req.body;
  if (!name || !price) return res.status(400).render('error', { message:'نام و قیمت الزامی است' });
  const catId = category_id ? parseInt(category_id,10) : null;
  const finalImage = req.file ? `/uploads/products/${req.file.filename}` : (clean(image_url) || '/img/placeholder.svg');
  db.prepare(`INSERT INTO products (category_id,name,slug,description,price,stock,image_url,active) VALUES (?,?,?,?,?,?,?,1)`).run(catId, clean(name), slugify(name), clean(description), parseInt(price,10), parseInt(stock||0,10), finalImage);
  res.redirect(`${ADMIN_PATH}/products`);
});
router.get('/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  const categories = db.prepare('SELECT * FROM categories').all();
  if (!product) return res.status(404).render('error', { message:'کالا یافت نشد' });
  res.render('admin/product-form', { product, categories });
});
router.post('/products/:id/edit', safeUpload(uploadProduct, 'image_file'), (req, res) => {
  const { name, category_id, description, price, stock, image_url, active } = req.body;
  const catId = category_id ? parseInt(category_id,10) : null;
  const finalImage = req.file ? `/uploads/products/${req.file.filename}` : clean(image_url);
  db.prepare(`UPDATE products SET category_id=?,name=?,description=?,price=?,stock=?,image_url=?,active=? WHERE id=?`).run(catId, clean(name), clean(description), parseInt(price,10), parseInt(stock||0,10), finalImage, active?1:0, req.params.id);
  res.redirect(`${ADMIN_PATH}/products`);
});
router.post('/products/:id/delete', (req, res) => { db.prepare('DELETE FROM products WHERE id=?').run(req.params.id); res.redirect(`${ADMIN_PATH}/products`); });

// ---- دسته‌بندی‌ها ----
router.get('/categories', (req, res) => { const categories = db.prepare('SELECT * FROM categories').all(); res.render('admin/categories', { categories }); });
router.get('/categories/new', (req, res) => { res.render('admin/category-form', { category:null }); });
router.post('/categories/new', safeUpload(uploadCategory, 'image_file'), (req, res) => {
  const name = clean(req.body.name);
  if (!name) return res.redirect(`${ADMIN_PATH}/categories`);
  const slug = slugify(name);
  const finalImage = req.file ? `/uploads/categories/${req.file.filename}` : (clean(req.body.image_url) || null);
  db.prepare('INSERT INTO categories (name, slug, image_url) VALUES (?, ?, ?)').run(name, slug, finalImage);
  res.redirect(`${ADMIN_PATH}/categories`);
});
router.get('/categories/:id/edit', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!category) return res.status(404).render('error', { message:'دسته‌بندی یافت نشد' });
  res.render('admin/category-form', { category });
});
router.post('/categories/:id/edit', safeUpload(uploadCategory, 'image_file'), (req, res) => {
  const name = clean(req.body.name);
  const finalImage = req.file ? `/uploads/categories/${req.file.filename}` : clean(req.body.image_url);
  db.prepare('UPDATE categories SET name=?, image_url=? WHERE id=?').run(name, finalImage, req.params.id);
  res.redirect(`${ADMIN_PATH}/categories`);
});
router.post('/categories/:id/delete', (req, res) => { db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id); res.redirect(`${ADMIN_PATH}/categories`); });

// ---- سفارش‌ها ----
router.get('/orders', (req, res) => {
  const orders = db.prepare(`SELECT o.*, u.phone as user_phone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all();
  res.render('admin/orders', { orders });
});
router.get('/orders/:id', (req, res) => {
  const order = db.prepare(`SELECT o.*, u.phone as user_phone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?`).get(req.params.id);
  if (!order) return res.status(404).render('error', { message:'سفارش یافت نشد' });
  const items = db.prepare(`SELECT oi.*, p.image_url as product_image FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`).all(order.id);
  res.render('admin/order-detail', { order, items });
});
router.post('/orders/:id/confirm', (req, res) => { db.prepare(`UPDATE orders SET status='paid', updated_at=datetime('now') WHERE id=?`).run(req.params.id); res.redirect(`${ADMIN_PATH}/orders/${req.params.id}`); });
router.post('/orders/:id/reject', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (order && ['awaiting_verification','paid'].includes(order.status)) restockOrder(order.id);
  db.prepare(`UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.redirect(`${ADMIN_PATH}/orders/${req.params.id}`);
});

// ---- تنظیمات ----
const SETTINGS_KEYS = ['shop_phone','shop_instagram','shop_card_number','shop_card_owner','zarinpal_merchant_id','zarinpal_sandbox'];
router.get('/settings', (req, res) => { const settings = getAllSettings(SETTINGS_KEYS); res.render('admin/settings', { settings, saved:false }); });
router.post('/settings', (req, res) => {
  setSetting('shop_phone', clean(req.body.shop_phone));
  setSetting('shop_instagram', clean(req.body.shop_instagram));
  setSetting('shop_card_number', clean(req.body.shop_card_number));
  setSetting('shop_card_owner', clean(req.body.shop_card_owner));
  setSetting('zarinpal_merchant_id', clean(req.body.zarinpal_merchant_id));
  setSetting('zarinpal_sandbox', req.body.zarinpal_sandbox ? 'true' : 'false');
  const settings = getAllSettings(SETTINGS_KEYS);
  res.render('admin/settings', { settings, saved:true });
});

module.exports = router;
