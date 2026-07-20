const db = require('../db');

// موجودی فقط زمانی کم می‌شود که پرداخت قطعی شده باشد (نه در لحظه ثبت سفارش)
function deductStockForOrder(orderId) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(orderId);
  const update = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?');
  for (const it of items) update.run(it.qty, it.product_id);
}

// وقتی سفارشی لغو می‌شود، موجودی کسرشده باید برگردد
function restockOrder(orderId) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(orderId);
  const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id=?');
  for (const it of items) restock.run(it.qty, it.product_id);
}

module.exports = { deductStockForOrder, restockOrder };
