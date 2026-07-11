require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const { helmetConfig, globalLimiter, adminLimiter, setupLimiter, csrfProtection } = require('./middleware/security');
const { loadCustomer, loadAdmin } = require('./middleware/auth');

const authRoutes = require('./routes/auth.routes');
const shopRoutes = require('./routes/shop.routes');
const paymentRoutes = require('./routes/payment.routes');
const adminRoutes = require('./routes/admin.routes');
const setupRoutes = require('./routes/setup.routes');

const app = express();
const ADMIN_PATH = process.env.ADMIN_PANEL_PATH || '/nb-admin-x7q2';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1); // لازم برای Railway/هر پراکسی دیگر تا secure cookie و IP درست کار کند

app.use(helmetConfig);
app.use(globalLimiter);
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_only_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  },
}));

app.use(csrfProtection);

// ---------- مسیر مشتری ----------
app.use(loadCustomer);
app.use((req, res, next) => {
  res.locals.adminPanelPath = ADMIN_PATH;
  res.locals.shopPhone = process.env.SHOP_PHONE || '';
  res.locals.shopInstagram = process.env.SHOP_INSTAGRAM || '';
  next();
});
app.use('/', authRoutes);
app.use('/', shopRoutes);
app.use('/', paymentRoutes);
app.use('/setup-admin', setupLimiter);
app.use('/', setupRoutes);

// ---------- مسیر پنل مدیریت (کاملا جدا، آدرس مخفی + کوکی جدا) ----------
app.use(ADMIN_PATH, adminLimiter, loadAdmin, adminRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('error', { message: 'صفحه یافت نشد' });
});

// ---------- خطای عمومی (هیچ‌وقت جزئیات فنی/استک به کاربر نمایش داده نمی‌شود) ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'خطایی رخ داد، لطفا دوباره تلاش کنید' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`فروشگاه ابزار نبهانی روی پورت ${PORT} اجرا شد`);
  console.log(`پنل مدیریت: ${ADMIN_PATH}/login`);
});
