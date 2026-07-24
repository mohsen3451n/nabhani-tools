const db = require('./db');
function slugify(s){ return s.trim().replace(/\s+/g,'-')+'-'+Math.random().toString(36).slice(2,7); }

const categories = [
  { name: 'ابزار', slug: 'abzar' },
  { name: 'چسب', slug: 'chasb' },
  { name: 'رنگ', slug: 'rang' },
];
const insCat = db.prepare(`INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)`);
for (const c of categories) insCat.run(c.name, c.slug);
const catRow = (slug) => db.prepare('SELECT id FROM categories WHERE slug=?').get(slug);

const products = [
  { cat:'abzar', name:'دریل شارژی ۱۸ ولت', price:1850000, stock:12, desc:'دریل شارژی حرفه‌ای' },
  { cat:'chasb', name:'چسب سیلیکون ساختمانی', price:85000, stock:100, desc:'چسب نسوز و ضدآب' },
  { cat:'rang', name:'رنگ روغنی سفید ۵ لیتری', price:780000, stock:20, desc:'رنگ روغنی درجه یک' },
];
const insProd = db.prepare(`INSERT OR IGNORE INTO products (category_id,name,slug,description,price,stock,image_url,active) VALUES (?,?,?,?,?,?,?,1)`);
for (const p of products) {
  const cat = catRow(p.cat);
  insProd.run(cat.id, p.name, slugify(p.name), p.desc, p.price, p.stock, '/img/placeholder.svg');
}
console.log('Seed کامل شد.');
