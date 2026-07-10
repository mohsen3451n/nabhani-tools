const db = require('./db');

function slugify(str) {
  return str.trim().replace(/\s+/g, '-');
}

const categories = [
  { name: 'ابزار', slug: 'abzar' },
  { name: 'چسب', slug: 'chasb' },
  { name: 'رنگ', slug: 'rang' },
];

const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)`);
for (const c of categories) insertCat.run(c.name, c.slug);

const catRow = (slug) => db.prepare('SELECT id FROM categories WHERE slug=?').get(slug);

const products = [
  { cat: 'abzar', name: 'دریل شارژی ۱۸ ولت', price: 1850000, stock: 12, desc: 'دریل شارژی حرفه‌ای با دو باتری' },
  { cat: 'abzar', name: 'پیچ‌گوشتی ست ۳۲ عددی', price: 320000, stock: 40, desc: 'ست کامل پیچ‌گوشتی صنعتی' },
  { cat: 'abzar', name: 'متر فلزی ۵ متری', price: 95000, stock: 60, desc: 'متر فلزی با قفل مطمئن' },
  { cat: 'chasb', name: 'چسب سیلیکون ساختمانی', price: 85000, stock: 100, desc: 'چسب نسوز و ضدآب برای درزگیری' },
  { cat: 'chasb', name: 'چسب کاشی و سرامیک ۱ کیلویی', price: 60000, stock: 80, desc: 'مناسب نصب کاشی و سرامیک' },
  { cat: 'chasb', name: 'چسب فوری صنعتی', price: 25000, stock: 150, desc: 'چسب قطره‌ای فوری با چسبندگی بالا' },
  { cat: 'rang', name: 'رنگ روغنی سفید ۵ لیتری', price: 780000, stock: 20, desc: 'رنگ روغنی درجه یک، پوشش بالا' },
  { cat: 'rang', name: 'رنگ پلاستیک طوسی ۱۰ لیتری', price: 1250000, stock: 15, desc: 'رنگ پلاستیک شستشوپذیر برای دیوار داخلی' },
  { cat: 'rang', name: 'اسپری رنگ مشکی مات', price: 110000, stock: 70, desc: 'اسپری رنگ سریع خشک شونده' },
];

const insertProd = db.prepare(`
  INSERT OR IGNORE INTO products (category_id, name, slug, description, price, stock, image_url, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
`);

for (const p of products) {
  const cat = catRow(p.cat);
  insertProd.run(cat.id, p.name, slugify(p.name) + '-' + Math.random().toString(36).slice(2,7), p.desc, p.price, p.stock, '/img/placeholder.svg');
}

console.log('Seed کامل شد. دسته‌بندی‌ها و محصولات نمونه اضافه شدند.');
console.log('برای ساخت اولین حساب ادمین، به مسیر /setup-admin?token=...&phone=09xxxxxxxxx بروید (به README مراجعه کنید)');
